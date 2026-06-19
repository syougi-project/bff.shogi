import { computeStageClearCurrencyGrant } from '@/lib/stage-clear-currency-reward';
import { isPublishedNow } from '@/lib/time';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStageByNo } from '@/services/stage-master';

type RewardTiming = 'first_clear' | 'clear';

type StageRewardJoinRow = {
  reward_timing: RewardTiming;
  quantity: number;
  is_active: boolean;
  m_reward:
    | {
        reward_type: 'currency' | 'piece' | 'item' | 'ticket';
        item_code: string | null;
        piece_id: number | null;
        is_active: boolean;
        published_at: string | null;
        unpublished_at: string | null;
      }
    | {
        reward_type: 'currency' | 'piece' | 'item' | 'ticket';
        item_code: string | null;
        piece_id: number | null;
        is_active: boolean;
        published_at: string | null;
        unpublished_at: string | null;
      }[]
    | null;
};

type PieceRow = {
  piece_id: number;
  kanji: string;
  name: string;
};

type StageClearState = {
  firstClear: boolean;
  clearCount: number;
};

export type GrantedPiece = {
  pieceId: number;
  char: string;
  name: string;
  quantity: number;
};

export type StageClearRewardResult = {
  stageNo: number;
  firstClear: boolean;
  clearCount: number;
  granted: {
    pawn: number;
    gold: number;
    pieces: GrantedPiece[];
  };
  wallet: {
    pawnCurrency: number;
    goldCurrency: number;
  };
};

export class StageClearRewardError extends Error {
  readonly code: 'NOT_FOUND' | 'LOCKED';

  constructor(code: 'NOT_FOUND' | 'LOCKED', message: string) {
    super(message);
    this.name = 'StageClearRewardError';
    this.code = code;
  }
}

function toRewardRow(row: StageRewardJoinRow): {
  reward_type: 'currency' | 'piece' | 'item' | 'ticket';
  item_code: string | null;
  piece_id: number | null;
  is_active: boolean;
  published_at: string | null;
  unpublished_at: string | null;
} | null {
  if (Array.isArray(row.m_reward)) return row.m_reward[0] ?? null;
  return row.m_reward ?? null;
}

async function markStageClear(userId: string, stageId: number): Promise<StageClearState> {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('player_stage_clears')
    .select('clear_count')
    .eq('player_id', userId)
    .eq('stage_id', stageId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabaseAdmin.from('player_stage_clears').insert({
      player_id: userId,
      stage_id: stageId,
      clear_count: 1,
      cleared_at: now,
      updated_at: now,
    });
    if (insertError) throw insertError;
    return { firstClear: true, clearCount: 1 };
  }

  const nextCount = Math.max(1, Number(data.clear_count) + 1);
  const { error: updateError } = await supabaseAdmin
    .from('player_stage_clears')
    .update({ clear_count: nextCount, cleared_at: now, updated_at: now })
    .eq('player_id', userId)
    .eq('stage_id', stageId);

  if (updateError) throw updateError;

  return { firstClear: false, clearCount: nextCount };
}

async function getPlayerWallet(
  userId: string,
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const { data, error } = await supabaseAdmin
    .from('players')
    .select('pawn_currency,gold_currency')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Player not found');

  return {
    pawnCurrency: Number((data as any).pawn_currency ?? 0),
    goldCurrency: Number((data as any).gold_currency ?? 0),
  };
}

async function addPlayerCurrency(
  userId: string,
  delta: { pawn: number; gold: number },
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const current = await getPlayerWallet(userId);
  const nextPawn = Math.max(0, current.pawnCurrency + delta.pawn);
  const nextGold = Math.max(0, current.goldCurrency + delta.gold);

  const { error } = await supabaseAdmin
    .from('players')
    .update({ pawn_currency: nextPawn, gold_currency: nextGold })
    .eq('id', userId);

  if (error) throw error;
  return { pawnCurrency: nextPawn, goldCurrency: nextGold };
}

async function grantOwnedPieces(
  userId: string,
  pieceQuantities: Map<number, number>,
): Promise<GrantedPiece[]> {
  const pieceIds = [...pieceQuantities.keys()];
  if (pieceIds.length === 0) return [];

  const { data: pieces, error: pieceError } = await supabaseAdmin
    .schema('master')
    .from('m_piece')
    .select('piece_id,kanji,name')
    .in('piece_id', pieceIds);

  if (pieceError) throw pieceError;

  const pieceById = new Map<number, PieceRow>(
    ((pieces ?? []) as PieceRow[]).map((row) => [row.piece_id, row]),
  );

  for (const [pieceId, quantity] of pieceQuantities.entries()) {
    if (quantity <= 0) continue;

    const { data: ownedRow, error: ownedError } = await supabaseAdmin
      .from('player_owned_pieces')
      .select('quantity')
      .eq('player_id', userId)
      .eq('piece_id', pieceId)
      .limit(1)
      .maybeSingle();

    if (ownedError) throw ownedError;

    if (!ownedRow) {
      const { error: insertError } = await supabaseAdmin.from('player_owned_pieces').insert({
        player_id: userId,
        piece_id: pieceId,
        source: 'stage_clear',
        quantity,
        acquired_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      continue;
    }

    const nextQuantity = Math.max(1, Number((ownedRow as any).quantity ?? 0) + quantity);
    const { error: updateError } = await supabaseAdmin
      .from('player_owned_pieces')
      .update({ quantity: nextQuantity })
      .eq('player_id', userId)
      .eq('piece_id', pieceId);
    if (updateError) throw updateError;
  }

  return pieceIds
    .map((pieceId) => {
      const piece = pieceById.get(pieceId);
      if (!piece) return null;
      return {
        pieceId,
        char: piece.kanji,
        name: piece.name,
        quantity: pieceQuantities.get(pieceId) ?? 0,
      };
    })
    .filter((row): row is GrantedPiece => row !== null)
    .filter((row) => row.quantity > 0);
}

async function loadStagePieceRewards(
  stageId: number,
  timings: RewardTiming[],
): Promise<Map<number, number>> {
  const { data, error } = await supabaseAdmin
    .schema('master')
    .from('m_stage_reward')
    .select(
      'reward_timing,quantity,is_active,m_reward:reward_id(reward_type,item_code,piece_id,is_active,published_at,unpublished_at)',
    )
    .eq('stage_id', stageId)
    .eq('is_active', true)
    .in('reward_timing', timings)
    .order('sort_order', { ascending: true });

  if (error) throw error;

  const pieceQuantities = new Map<number, number>();

  for (const row of (data ?? []) as unknown as StageRewardJoinRow[]) {
    if (!row.is_active) continue;

    const reward = toRewardRow(row);
    if (!reward || !reward.is_active || !isPublishedNow(reward as any)) continue;
    if (reward.reward_type !== 'piece' || typeof reward.piece_id !== 'number') continue;

    const qty = Math.max(0, Number(row.quantity ?? 0));
    if (qty <= 0) continue;

    const current = pieceQuantities.get(reward.piece_id) ?? 0;
    pieceQuantities.set(reward.piece_id, current + qty);
  }

  return pieceQuantities;
}

/**
 * grantStageClearRewards は公開APIから直接呼び出さないこと。
 * 必要な場合は private helper として BFF 内部専用で利用すること。
 */
// @internal
async function grantStageClearRewards(
  userId: string,
  stageNo: number,
): Promise<StageClearRewardResult> {
  const stage = await getStageByNo(stageNo);
  if (!stage) {
    throw new StageClearRewardError('NOT_FOUND', 'Stage not found');
  }
  if (!isPublishedNow(stage)) {
    throw new StageClearRewardError('LOCKED', 'Stage is locked');
  }

  const clearState = await markStageClear(userId, stage.stage_id);
  const currencyGrant = computeStageClearCurrencyGrant(stageNo, clearState.firstClear);
  const timings: RewardTiming[] = clearState.firstClear ? ['first_clear', 'clear'] : ['clear'];
  const pieceQuantities = await loadStagePieceRewards(stage.stage_id, timings);

  const [wallet, grantedPieces] = await Promise.all([
    addPlayerCurrency(userId, currencyGrant),
    grantOwnedPieces(userId, pieceQuantities),
  ]);

  return {
    stageNo,
    firstClear: clearState.firstClear,
    clearCount: clearState.clearCount,
    granted: {
      pawn: currencyGrant.pawn,
      gold: currencyGrant.gold,
      pieces: grantedPieces,
    },
    wallet,
  };
}
