import { supabaseAdmin } from '@/lib/supabase-admin';
import { MOCK_SHOP_ITEMS } from '@/server/mocks/shop';

export type ShopItemKey = (typeof MOCK_SHOP_ITEMS)[number]['key'];

type ShopMasterDef = {
  pieceCode: string;
  moveCode: string;
  kanji: ShopItemKey;
  name: string;
  moveDescriptionJa: string;
  displayChar: string;
  sfenCode: string;
  canonicalPieceCode: string;
};

export const SHOP_MASTER_DEFS: ShopMasterDef[] = [
  {
    pieceCode: 'piece_shop_so',
    moveCode: 'shop_run',
    kanji: '走',
    name: '走',
    moveDescriptionJa: '前方に最大2マス進める。1マス目に駒がある場合は2マス目には進めない。',
    displayChar: 'SO',
    sfenCode: '+',
    canonicalPieceCode: 'shop_so',
  },
  {
    pieceCode: 'piece_shop_tane',
    moveCode: 'shop_tane',
    kanji: '種',
    name: '種',
    moveDescriptionJa: '前斜め4方向に1マス移動できる。',
    displayChar: 'TANE',
    sfenCode: ',',
    canonicalPieceCode: 'shop_tane',
  },
  {
    pieceCode: 'piece_shop_kirin',
    moveCode: 'shop_kirin',
    kanji: '麒',
    name: '麒',
    moveDescriptionJa: '前後左右に何マスでも進める。斜め4方向に1マス進める。',
    displayChar: 'KIRIN',
    sfenCode: '-',
    canonicalPieceCode: 'shop_kirin',
  },
  {
    pieceCode: 'piece_shop_mai',
    moveCode: 'shop_mai',
    kanji: '舞',
    name: '舞',
    moveDescriptionJa: '前・前斜め左右・左右・後に各1マス進める。',
    displayChar: 'MAI',
    sfenCode: '.',
    canonicalPieceCode: 'shop_mai',
  },
  {
    pieceCode: 'piece_shop_p',
    moveCode: 'shop_p',
    kanji: 'P',
    name: 'P',
    moveDescriptionJa: '縦横1マス移動。移動時同じ行と列にいる敵駒を移動不能にする。',
    displayChar: 'SHOP_P',
    sfenCode: '!',
    canonicalPieceCode: 'shop_p',
  },
  {
    pieceCode: 'piece_shop_naku',
    moveCode: 'shop_naku',
    kanji: '鳴',
    name: '鳴',
    moveDescriptionJa:
      '銀と同じ移動範囲。移動時もし相手駒に同じ駒が3体いる場合、その3体をまとめて取る(ポン)。',
    displayChar: 'NAKU',
    sfenCode: '@',
    canonicalPieceCode: 'shop_naku',
  },
];

export const SHOP_ITEM_PIECE_CODE: Record<ShopItemKey, string> = Object.fromEntries(
  SHOP_MASTER_DEFS.map((def) => [def.kanji, def.pieceCode]),
) as Record<ShopItemKey, string>;

let bootstrapPromise: Promise<void> | null = null;
let shopPiecesCache: Map<string, number> | null = null;
let shopPiecesCacheAt = 0;
let shopPiecesInFlight: Promise<Map<string, number>> | null = null;

const SHOP_PIECES_CACHE_TTL_MS = 60_000;

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** DB に登録済みのショップ駒を取得（マスタ自動登録はしない） */
export async function lookupShopPiecesInDb(): Promise<Map<string, number>> {
  const now = Date.now();
  if (shopPiecesCache && now - shopPiecesCacheAt < SHOP_PIECES_CACHE_TTL_MS) {
    return new Map(shopPiecesCache);
  }
  if (shopPiecesInFlight) {
    const cached = await shopPiecesInFlight;
    return new Map(cached);
  }

  shopPiecesInFlight = lookupShopPiecesInDbUncached().finally(() => {
    shopPiecesInFlight = null;
  });
  const rows = await shopPiecesInFlight;
  shopPiecesCache = new Map(rows);
  shopPiecesCacheAt = Date.now();
  return new Map(rows);
}

async function lookupShopPiecesInDbUncached(): Promise<Map<string, number>> {
  const kanjiList = SHOP_MASTER_DEFS.map((def) => def.kanji);
  const { data, error } = await supabaseAdmin
    .schema('master')
    .from('m_piece')
    .select('piece_id, kanji, piece_code')
    .in('kanji', kanjiList);
  if (error) throw error;

  const allowedKanji = new Set(kanjiList);
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const kanji = String((row as { kanji?: unknown }).kanji ?? '');
    const pieceId = toNumber((row as { piece_id?: unknown }).piece_id);
    if (allowedKanji.has(kanji as ShopItemKey) && pieceId) {
      map.set(kanji, pieceId);
    }
  }
  return map;
}

async function ensureMovePattern(moveCode: string, moveName: string, isRepeatable: boolean) {
  const { data: existing, error: selectError } = await supabaseAdmin
    .schema('master')
    .from('m_move_pattern')
    .select('move_pattern_id')
    .eq('move_code', moveCode)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.move_pattern_id) return toNumber(existing.move_pattern_id);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .schema('master')
    .from('m_move_pattern')
    .insert({
      move_code: moveCode,
      move_name: moveName,
      is_repeatable: isRepeatable,
      can_jump: false,
      constraints_json: {
        mode: 'piece_info_canMoveTo',
        source_move_code: moveCode,
      },
      is_active: true,
    })
    .select('move_pattern_id')
    .single();
  if (insertError) throw insertError;
  return toNumber(inserted.move_pattern_id);
}

async function ensurePieceMapping(def: ShopMasterDef, pieceId: number): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    piece_id: pieceId,
    sfen_code: def.sfenCode,
    display_char: def.displayChar,
    canonical_piece_code: def.canonicalPieceCode,
    is_special: true,
    is_promoted: false,
    is_active: true,
    updated_at: now,
  };

  const { data: byPieceId, error: byPieceError } = await supabaseAdmin
    .schema('master')
    .from('m_piece_mapping')
    .select('id')
    .eq('piece_id', pieceId)
    .maybeSingle();
  if (byPieceError) throw byPieceError;

  if (byPieceId?.id) {
    const { error: updateError } = await supabaseAdmin
      .schema('master')
      .from('m_piece_mapping')
      .update(payload)
      .eq('piece_id', pieceId);
    if (updateError) throw updateError;
    return;
  }

  const { data: byDisplay, error: byDisplayError } = await supabaseAdmin
    .schema('master')
    .from('m_piece_mapping')
    .select('id, piece_id')
    .eq('display_char', def.displayChar)
    .maybeSingle();
  if (byDisplayError) throw byDisplayError;

  if (byDisplay?.id) {
    const { error: updateError } = await supabaseAdmin
      .schema('master')
      .from('m_piece_mapping')
      .update(payload)
      .eq('id', byDisplay.id);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .schema('master')
    .from('m_piece_mapping')
    .insert({ ...payload, created_at: now });
  if (insertError) throw insertError;
}

async function ensureShopPiece(def: ShopMasterDef): Promise<number> {
  const movePatternId = await ensureMovePattern(
    def.moveCode,
    def.name,
    def.moveCode === 'shop_kirin',
  );

  const { data: existingByCode, error: existingError } = await supabaseAdmin
    .schema('master')
    .from('m_piece')
    .select('piece_id')
    .eq('piece_code', def.pieceCode)
    .maybeSingle();
  if (existingError) throw existingError;

  let pieceId = toNumber((existingByCode as { piece_id?: unknown } | null)?.piece_id);
  if (!pieceId) {
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .schema('master')
      .from('m_piece')
      .insert({
        piece_code: def.pieceCode,
        kanji: def.kanji,
        name: def.name,
        move_pattern_id: movePatternId,
        move_description_ja: def.moveDescriptionJa,
        rarity: 'SR',
        image_source: 'supabase',
        image_version: 1,
        is_active: true,
        published_at: now,
      })
      .select('piece_id')
      .single();

    if (insertError) {
      const { data: byKanji, error: kanjiError } = await supabaseAdmin
        .schema('master')
        .from('m_piece')
        .select('piece_id, piece_code')
        .eq('kanji', def.kanji)
        .maybeSingle();
      if (kanjiError) throw kanjiError;
      pieceId = toNumber((byKanji as { piece_id?: unknown } | null)?.piece_id);
      if (!pieceId) {
        throw new Error(`SHOP_PIECE_INSERT_FAILED:${def.kanji}:${insertError.message}`);
      }
    } else {
      pieceId = toNumber(inserted.piece_id);
    }
  }

  await ensurePieceMapping(def, pieceId);
  return pieceId;
}

async function bootstrapShopMasterData(): Promise<void> {
  const errors: string[] = [];
  for (const def of SHOP_MASTER_DEFS) {
    try {
      await ensureShopPiece(def);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${def.kanji}: ${message}`);
    }
  }
  if (errors.length === SHOP_MASTER_DEFS.length) {
    throw new Error(`SHOP_MASTER_BOOTSTRAP_FAILED: ${errors.join('; ')}`);
  }
}

export async function ensureShopMasterData(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapShopMasterData().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  shopPiecesCache = null;
  shopPiecesCacheAt = 0;
  await bootstrapPromise;
}

export async function resolveShopPieceId(itemKey: ShopItemKey): Promise<number> {
  await ensureShopMasterData();

  const existing = await lookupShopPiecesInDb();
  const fromDb = existing.get(itemKey);
  if (fromDb) return fromDb;

  const pieceCode = SHOP_ITEM_PIECE_CODE[itemKey];
  throw new Error(`SHOP_PIECE_NOT_CONFIGURED:${itemKey}:${pieceCode}`);
}
