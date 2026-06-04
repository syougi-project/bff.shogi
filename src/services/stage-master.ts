import { supabaseAdmin } from '@/lib/supabase-admin';
import { measure } from '@/lib/perf';
import { isPublishedNow } from '@/lib/time';

export type StageRow = {
  stage_id: number;
  stage_no: number;
  stage_name: string;
  unlock_stage_no: number | null;
  difficulty: number | null;
  stage_category?: string | null;
  clear_condition_type?: string | null;
  clear_condition_params?: Record<string, unknown> | null;
  recommended_power?: number | null;
  stamina_cost?: number | null;
  is_active: boolean;
  published_at: string | null;
  unpublished_at: string | null;
};

const STAGE_MASTER_TTL_MS = 60_000;
const STAGE_BATTLE_SETUP_TTL_MS = 60_000;

let cachedStageRows: StageRow[] | null = null;
let cachedStageRowsAt = 0;
let stageRowsInFlight: Promise<StageRow[]> | null = null;

type StageBattleSetupMasterRows = {
  placements: any[];
  roster: any[];
  rewards: any[];
};

const stageBattleSetupCache = new Map<
  number,
  { rows: StageBattleSetupMasterRows; cachedAt: number }
>();
const stageBattleSetupInFlight = new Map<number, Promise<StageBattleSetupMasterRows>>();

async function loadStageRows(force = false): Promise<StageRow[]> {
  const now = Date.now();
  if (!force && cachedStageRows && now - cachedStageRowsAt < STAGE_MASTER_TTL_MS) {
    return cachedStageRows;
  }
  if (stageRowsInFlight) return stageRowsInFlight;

  stageRowsInFlight = (async () => {
    const { data, error } = await measure('stageMaster.loadStageRows.query', () =>
      supabaseAdmin
        .schema('master')
        .from('m_stage')
        .select(
          'stage_id,stage_no,stage_name,unlock_stage_no,difficulty,stage_category,clear_condition_type,clear_condition_params,recommended_power,stamina_cost,is_active,published_at,unpublished_at',
        )
        .order('stage_no', { ascending: true }),
    );

    if (error) throw error;

    const rows = (data ?? []) as StageRow[];
    cachedStageRows = rows;
    cachedStageRowsAt = Date.now();
    return rows;
  })().finally(() => {
    stageRowsInFlight = null;
  });

  return stageRowsInFlight;
}

export async function listPublishedStages() {
  const rows = await loadStageRows();
  return rows.filter((row) => isPublishedNow(row));
}

export async function getStageByNo(stageNo: number) {
  const rows = await loadStageRows();
  return rows.find((row) => row.stage_no === stageNo) ?? null;
}

export async function getStageNoByIdMap(): Promise<Map<number, number>> {
  const rows = await loadStageRows();
  return new Map(rows.map((row) => [row.stage_id, row.stage_no]));
}

export async function getStageBattleSetup(
  stageId: number,
  playerId?: string | null,
  stageNo?: number,
) {
  const boardSize = 9;
  const deckRowCount = 3;
  const playerDeckRowOffset = boardSize - deckRowCount;
  const toBoardRowFromDeck = (rowNo: number) =>
    rowNo >= 0 && rowNo < deckRowCount ? rowNo + playerDeckRowOffset : rowNo;
  const toPieceRow = (row: any) => {
    if (Array.isArray(row?.m_piece)) {
      return row.m_piece[0] ?? null;
    }
    return row?.m_piece ?? null;
  };

  const masterRowsPromise = loadStageBattleSetupMasterRows(stageId);

  const deckPromise = playerId
    ? measure(
        'stageMaster.getStageBattleSetup.playerDeckQuery',
        () =>
          supabaseAdmin
            .from('player_decks')
            .select('deck_id,name,player_deck_placements(row_no,col_no,piece_id)')
            .eq('player_id', playerId)
            .order('deck_id', { ascending: true }),
        { stageId, playerId },
      )
    : Promise.resolve(null);

  const [masterRows, deckRes] = await Promise.all([masterRowsPromise, deckPromise]);

  const stagePlacementRows = masterRows.placements;
  let playerPlacementRowsFromDeck: any[] = [];

  if (deckRes && !deckRes.error) {
    try {
      const deckList = (deckRes.data ?? []) as Array<{
        deck_id: number;
        name: string;
        player_deck_placements?: Array<{ row_no: number; col_no: number; piece_id: number }>;
      }>;
      const targetDeck =
        deckList.find(
          (deck) => deck.name === 'マイデッキ' && (deck.player_deck_placements?.length ?? 0) > 0,
        ) ?? deckList.find((deck) => (deck.player_deck_placements?.length ?? 0) > 0);

      if (targetDeck?.player_deck_placements && targetDeck.player_deck_placements.length > 0) {
        const pieceIds = [
          ...new Set(
            targetDeck.player_deck_placements
              .map((p) => p.piece_id)
              .filter((id): id is number => typeof id === 'number'),
          ),
        ];
        if (pieceIds.length > 0) {
          const { data: pieces, error } = await measure(
            'stageMaster.getStageBattleSetup.playerDeckPiecesQuery',
            () =>
              supabaseAdmin
                .schema('master')
                .from('m_piece')
                .select(
                  'piece_id,piece_code,kanji,name,move_pattern_id,skill_id,image_bucket,image_key',
                )
                .in('piece_id', pieceIds),
            { stageId, playerId, pieceCount: pieceIds.length },
          );

          if (!error) {
            const pieceById = new Map<number, any>(
              (pieces ?? []).map((piece: any) => [piece.piece_id, piece]),
            );
            playerPlacementRowsFromDeck = targetDeck.player_deck_placements
              .map((placement) => {
                const piece = pieceById.get(placement.piece_id);
                if (!piece) return null;
                const rowNo = Number(placement.row_no);
                const colNo = Number(placement.col_no);
                if (!Number.isInteger(rowNo) || !Number.isInteger(colNo)) {
                  return null;
                }
                return {
                  side: 'player',
                  row_no: toBoardRowFromDeck(rowNo),
                  col_no: colNo,
                  piece_id: placement.piece_id,
                  m_piece: piece,
                };
              })
              .filter((row): row is any => row !== null);
          }
        }
      }
    } catch {
      playerPlacementRowsFromDeck = [];
    }
  }

  const mergedPlacementRows =
    playerPlacementRowsFromDeck.length > 0
      ? [
          ...stagePlacementRows.filter((row) => row.side === 'enemy'),
          ...playerPlacementRowsFromDeck,
        ]
      : stagePlacementRows;

  if (stageNo === 39) {
    await applyStage39OniVariants(mergedPlacementRows);
  }

  const rewards = masterRows.rewards;

  return {
    board: {
      size: 9,
      placements: mergedPlacementRows.map((row: any) => {
        const piece = toPieceRow(row);
        return {
          side: row.side,
          row: row.row_no,
          col: row.col_no,
          piece: {
            id: row.piece_id,
            code: piece?.piece_code ?? null,
            char: piece?.kanji ?? null,
            name: piece?.name ?? null,
            imageBucket: piece?.image_bucket ?? null,
            imageKey: piece?.image_key ?? null,
            movePatternId: piece?.move_pattern_id ?? null,
            skillId: piece?.skill_id ?? null,
          },
        };
      }),
    },
    enemyRoster: masterRows.roster.map((row: any) => ({
      role: row.role,
      weight: row.weight,
      piece: {
        id: row.piece_id,
        code: row.m_piece?.piece_code ?? null,
        char: row.m_piece?.kanji ?? null,
        name: row.m_piece?.name ?? null,
      },
    })),
    rewards: rewards.map((row: any) => ({
      timing: row.reward_timing,
      quantity: row.quantity,
      dropRate: row.drop_rate,
      sortOrder: row.sort_order,
      reward: {
        code: row.m_reward?.reward_code ?? null,
        type: row.m_reward?.reward_type ?? null,
        name: row.m_reward?.reward_name ?? null,
        itemCode: row.m_reward?.item_code ?? null,
        pieceId: row.m_reward?.piece_id ?? null,
      },
    })),
  };
}

async function loadStageBattleSetupMasterRows(
  stageId: number,
): Promise<StageBattleSetupMasterRows> {
  const now = Date.now();
  const cached = stageBattleSetupCache.get(stageId);
  if (cached && now - cached.cachedAt < STAGE_BATTLE_SETUP_TTL_MS) {
    return cloneStageBattleSetupMasterRows(cached.rows);
  }

  const inFlight = stageBattleSetupInFlight.get(stageId);
  if (inFlight) return cloneStageBattleSetupMasterRows(await inFlight);

  const loader = loadStageBattleSetupMasterRowsUncached(stageId).finally(() => {
    stageBattleSetupInFlight.delete(stageId);
  });
  stageBattleSetupInFlight.set(stageId, loader);

  const rows = await loader;
  stageBattleSetupCache.set(stageId, { rows, cachedAt: Date.now() });
  return cloneStageBattleSetupMasterRows(rows);
}

async function loadStageBattleSetupMasterRowsUncached(
  stageId: number,
): Promise<StageBattleSetupMasterRows> {
  const placementPromise = measure(
    'stageMaster.getStageBattleSetup.placementQuery',
    () =>
      supabaseAdmin
        .schema('master')
        .from('m_stage_initial_placement')
        .select(
          'side,row_no,col_no,piece_id,m_piece:piece_id(piece_code,kanji,name,move_pattern_id,skill_id,image_bucket,image_key)',
        )
        .eq('stage_id', stageId)
        .order('side', { ascending: true })
        .order('row_no', { ascending: true })
        .order('col_no', { ascending: true }),
    { stageId },
  );

  const rosterPromise = measure(
    'stageMaster.getStageBattleSetup.rosterQuery',
    () =>
      supabaseAdmin
        .schema('master')
        .from('m_stage_piece')
        .select('role,weight,piece_id,m_piece:piece_id(piece_code,kanji,name)')
        .eq('stage_id', stageId)
        .order('role', { ascending: true }),
    { stageId },
  );

  const rewardPromise = measure(
    'stageMaster.getStageBattleSetup.rewardQuery',
    () =>
      supabaseAdmin
        .schema('master')
        .from('m_stage_reward')
        .select(
          'reward_timing,quantity,drop_rate,sort_order,m_reward:reward_id(reward_code,reward_type,reward_name,item_code,piece_id)',
        )
        .eq('stage_id', stageId)
        .order('sort_order', { ascending: true }),
    { stageId },
  );

  const [placementRes, rosterRes, rewardRes] = await Promise.all([
    placementPromise,
    rosterPromise,
    rewardPromise,
  ]);

  if (placementRes.error) throw placementRes.error;
  if (rosterRes.error) throw rosterRes.error;

  return {
    placements: (placementRes.data ?? []) as any[],
    roster: (rosterRes.data ?? []) as any[],
    rewards: rewardRes.error ? [] : ((rewardRes.data ?? []) as any[]),
  };
}

function cloneStageBattleSetupMasterRows(
  rows: StageBattleSetupMasterRows,
): StageBattleSetupMasterRows {
  return {
    placements: structuredClone(rows.placements),
    roster: structuredClone(rows.roster),
    rewards: structuredClone(rows.rewards),
  };
}

const STAGE39_ONI_KANJI = new Set(['鬼', '赤鬼', '青鬼', '黒鬼']);

async function applyStage39OniVariants(placementRows: any[]): Promise<void> {
  const enemyOniRows = placementRows
    .filter((row) => {
      const piece = Array.isArray(row?.m_piece) ? row.m_piece[0] : row?.m_piece;
      const kanji = piece?.kanji;
      const name = piece?.name;
      return (
        row?.side === 'enemy' &&
        (STAGE39_ONI_KANJI.has(kanji) ||
          name === '赤鬼' ||
          name === '青鬼' ||
          name === '黒鬼' ||
          piece?.piece_code === 'redOni' ||
          piece?.piece_code === 'blueOni' ||
          piece?.piece_code === 'blackOni')
      );
    })
    .sort((a, b) => a.col_no - b.col_no || a.row_no - b.row_no);

  if (enemyOniRows.length < 2) return;

  const { data: oniMasterRows, error } = await supabaseAdmin
    .schema('master')
    .from('m_piece')
    .select('piece_id,piece_code,kanji,name,skill_id,move_pattern_id')
    .in('piece_code', ['redOni', 'blueOni', 'blackOni', 'piece_533b7fec5456']);

  if (error) throw error;

  const oniByCode = new Map((oniMasterRows ?? []).map((row) => [row.piece_code as string, row]));

  const applyTemplate = (placementRow: any, templateCode: 'redOni' | 'blueOni' | 'blackOni') => {
    const template =
      templateCode === 'redOni'
        ? (oniByCode.get('redOni') ?? oniByCode.get('piece_533b7fec5456'))
        : oniByCode.get(templateCode);
    const piece = Array.isArray(placementRow?.m_piece)
      ? placementRow.m_piece[0]
      : placementRow?.m_piece;
    if (!piece) return;

    if (template) {
      placementRow.piece_id = template.piece_id;
      piece.piece_code = template.piece_code;
      piece.kanji = template.kanji;
      piece.name = template.name;
      piece.skill_id = template.skill_id;
      piece.move_pattern_id = template.move_pattern_id;
      return;
    }

    if (templateCode === 'blueOni') {
      piece.piece_code = 'blueOni';
      piece.kanji = '青鬼';
      piece.name = '青鬼';
    } else if (templateCode === 'blackOni') {
      piece.piece_code = 'blackOni';
      piece.kanji = '黒鬼';
      piece.name = '黒鬼';
    } else {
      piece.piece_code = 'redOni';
      piece.kanji = '赤鬼';
      piece.name = '赤鬼';
    }
  };

  const left = enemyOniRows[0];
  const right = enemyOniRows[enemyOniRows.length - 1];

  applyTemplate(left, 'blueOni');
  applyTemplate(right, 'blackOni');
  for (const row of enemyOniRows) {
    if (row === left || row === right) continue;
    applyTemplate(row, 'redOni');
  }
}
