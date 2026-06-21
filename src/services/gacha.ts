import { isPublishedNow } from '@/lib/time';
import { measure } from '@/lib/perf';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  assertAdFreeRollAllowed,
  buildDailyAdGachaStatus,
  isMissingDailyAdGachaTableError,
  jstDayKey,
  type DailyAdGachaStatus,
} from '@/lib/daily-ad-gacha';
import {
  effectiveGachaPieceWeight,
  isGachaCurrencyChar,
  normalizeGachaBallColorIndex,
} from '@/lib/gacha-ball-piece-rate';
import { clearPieceCatalogCache } from '@/services/piece-master';

type GachaRow = {
  gacha_id: number;
  gacha_code: string;
  gacha_name: string;
  rarity_rate_n: number;
  rarity_rate_r: number;
  rarity_rate_sr: number;
  rarity_rate_ur: number;
  rarity_rate_ssr: number;
  pawn_cost: number;
  gold_cost: number;
  image_bucket: string | null;
  image_key: string | null;
  is_active: boolean;
  published_at: string | null;
  unpublished_at: string | null;
};

type GachaPieceJoinRow = {
  gacha_id: number;
  weight: number;
  m_piece:
    | {
        piece_id: number;
        kanji: string;
        name: string;
        rarity: string;
        image_bucket: string | null;
        image_key: string | null;
        move_description_ja: string | null;
      }
    | {
        piece_id: number;
        kanji: string;
        name: string;
        rarity: string;
        image_bucket: string | null;
        image_key: string | null;
        move_description_ja: string | null;
      }[]
    | null;
};

function toPieceRow(row: GachaPieceJoinRow): {
  piece_id: number;
  kanji: string;
  name: string;
  rarity: string;
  image_bucket: string | null;
  image_key: string | null;
  move_description_ja: string | null;
} | null {
  if (Array.isArray(row.m_piece)) {
    return row.m_piece[0] ?? null;
  }
  return row.m_piece ?? null;
}

export type GachaLobbyBanner = {
  key: string;
  name: string;
  rareRateText: string;
  /** HTML 版の data-gacha-hit-rate に相当（駒ごとの重みから算出した割合） */
  pieceRateText: string;
  description: string | null;
  lineup: Array<{
    char: string;
    name: string;
    rarity: string;
    weight: number;
    /** master.m_piece.move_description_ja */
    description: string | null;
  }>;
  usesGold?: boolean;
  pawnCost: number;
  goldCost: number;
};

export type GachaLobbySnapshot = {
  banners: GachaLobbyBanner[];
  pawnCurrency: number;
  goldCurrency: number;
  history: string[];
  /** 広告無償ガチャが利用不可（DB未適用等）のとき null */
  dailyAdGacha: DailyAdGachaStatus | null;
};

export type RollGachaResult =
  | {
      type: 'hit';
      piece: {
        char: string;
        name: string;
        rarity: string;
        description: string;
      };
      alreadyOwned: boolean;
      pawnCurrency: number;
      goldCurrency: number;
    }
  | {
      type: 'miss';
      currency: 'pawn' | 'gold';
      amount: number;
      pawnCurrency: number;
      goldCurrency: number;
    };

type ActiveGacha = {
  gachaId: number;
  gachaCode: string;
  gachaName: string;
  rates: {
    N: number;
    R: number;
    SR: number;
    UR: number;
    SSR: number;
  };
  costs: {
    pawn: number;
    gold: number;
  };
  imageBucket: string | null;
  imageKey: string | null;
  pieces: Array<{
    pieceId: number;
    char: string;
    name: string;
    rarity: string;
    weight: number;
    imageBucket: string | null;
    imageKey: string | null;
    /** master.m_piece.move_description_ja */
    description: string | null;
  }>;
};

const ACTIVE_GACHA_CACHE_TTL_MS = 60_000;

let activeGachaCache: ActiveGacha[] | null = null;
let activeGachaCacheAt = 0;
let activeGachaInFlight: Promise<ActiveGacha[]> | null = null;

function toNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function pickWeightedRandom<T>(items: T[], getWeight: (item: T) => number): T {
  if (items.length === 0) {
    throw new Error('pickWeightedRandom: empty items');
  }
  const total = items.reduce((sum, item) => sum + Math.max(0, getWeight(item)), 0);
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(0, getWeight(item));
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/** 表示用: 重みからレアリティ別の実効排出率を算出 */
export function computeOutcomeRatesFromWeights(
  pieces: Array<{ char: string; rarity: string; weight: number }>,
): ActiveGacha['rates'] {
  const total = pieces.reduce((sum, piece) => sum + Math.max(0, piece.weight), 0);
  if (total <= 0) {
    return { N: 0, R: 0, SR: 0, UR: 0, SSR: 0 };
  }

  const rates: ActiveGacha['rates'] = { N: 0, R: 0, SR: 0, UR: 0, SSR: 0 };
  for (const piece of pieces) {
    const share = Math.max(0, piece.weight) / total;
    if (isGachaCurrencyChar(piece.char)) {
      rates.N += share;
      continue;
    }
    const rarity = piece.rarity.toUpperCase();
    if (rarity === 'R') rates.R += share;
    else if (rarity === 'SR') rates.SR += share;
    else if (rarity === 'UR') rates.UR += share;
    else if (rarity === 'SSR') rates.SSR += share;
  }
  return rates;
}

function pawnRewardForCurrencyRoll(gachaCode: string): number {
  if (gachaCode === 'kanken1') return 5;
  if (gachaCode === 'ukanmuri' || gachaCode === 'hihen' || gachaCode === 'shinnyo') return 2;
  return 1;
}

function formatRatePercent(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

function formatRareRateText(rates: ActiveGacha['rates']): string {
  return `R ${formatRatePercent(rates.R)} / SR ${formatRatePercent(rates.SR)} / UR ${formatRatePercent(rates.UR)} / SSR ${formatRatePercent(rates.SSR)}`;
}

/** gacha_room.html の並び（うかんむり → ひへん → しんにょう → 漢検）— DB の gacha_code */
const GACHA_LOBBY_DISPLAY_ORDER: string[] = ['ukanmuri', 'hihen', 'shinnyo', 'kanken1'];

function normalizeGachaCode(code: string): string {
  if (code === 'hiHen') return 'hihen';
  return code;
}

function formatPieceRateLine(pieces: ActiveGacha['pieces']): string {
  const total = pieces.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (total <= 0) return '';
  return pieces
    .map((p) => `${p.char}${Math.round((Math.max(0, p.weight) / total) * 100)}%`)
    .join('・');
}

function sortLobbyBanners(banners: GachaLobbyBanner[]): GachaLobbyBanner[] {
  return [...banners].sort((a, b) => {
    const ia = GACHA_LOBBY_DISPLAY_ORDER.indexOf(a.key);
    const ib = GACHA_LOBBY_DISPLAY_ORDER.indexOf(b.key);
    if (ia === -1 && ib === -1) return a.key.localeCompare(b.key);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

async function loadActiveGachasWithPieces(): Promise<ActiveGacha[]> {
  const now = Date.now();
  if (activeGachaCache && now - activeGachaCacheAt < ACTIVE_GACHA_CACHE_TTL_MS) {
    return activeGachaCache;
  }
  if (activeGachaInFlight) return activeGachaInFlight;

  activeGachaInFlight = loadActiveGachasWithPiecesUncached().finally(() => {
    activeGachaInFlight = null;
  });
  const rows = await activeGachaInFlight;
  activeGachaCache = rows;
  activeGachaCacheAt = Date.now();
  return rows;
}

async function loadActiveGachasWithPiecesUncached(): Promise<ActiveGacha[]> {
  const { data: gachaRows, error: gachaError } = await measure(
    'gacha.loadActiveGachas.gachaQuery',
    () =>
      supabaseAdmin
        .schema('master')
        .from('m_gacha')
        .select(
          'gacha_id,gacha_code,gacha_name,rarity_rate_n,rarity_rate_r,rarity_rate_sr,rarity_rate_ur,rarity_rate_ssr,pawn_cost,gold_cost,image_bucket,image_key,is_active,published_at,unpublished_at',
        )
        .order('gacha_id', { ascending: true }),
  );
  if (gachaError) throw gachaError;

  const activeRows = ((gachaRows ?? []) as GachaRow[]).filter((row) => isPublishedNow(row));
  if (activeRows.length === 0) return [];

  const gachaIds = activeRows.map((row) => row.gacha_id);
  const { data: pieceRows, error: pieceError } = await measure(
    'gacha.loadActiveGachas.pieceQuery',
    () =>
      supabaseAdmin
        .schema('master')
        .from('m_gacha_piece')
        .select(
          'gacha_id,weight,m_piece:piece_id(piece_id,kanji,name,rarity,image_bucket,image_key,move_description_ja)',
        )
        .in('gacha_id', gachaIds)
        .eq('is_active', true),
    { gachaCount: gachaIds.length },
  );
  if (pieceError) throw pieceError;

  const pieceRowsByGacha = new Map<number, GachaPieceJoinRow[]>();
  for (const row of (pieceRows ?? []) as unknown as GachaPieceJoinRow[]) {
    const current = pieceRowsByGacha.get(row.gacha_id) ?? [];
    current.push(row);
    pieceRowsByGacha.set(row.gacha_id, current);
  }

  return activeRows.map((row) => ({
    gachaId: row.gacha_id,
    gachaCode: row.gacha_code,
    gachaName: row.gacha_name,
    rates: {
      N: toNumber(row.rarity_rate_n),
      R: toNumber(row.rarity_rate_r),
      SR: toNumber(row.rarity_rate_sr),
      UR: toNumber(row.rarity_rate_ur),
      SSR: toNumber(row.rarity_rate_ssr),
    },
    costs: {
      pawn: toNumber((row as any).pawn_cost),
      gold: toNumber((row as any).gold_cost),
    },
    imageBucket: row.image_bucket,
    imageKey: row.image_key,
    pieces: (pieceRowsByGacha.get(row.gacha_id) ?? [])
      .map((r) => ({ row: r, piece: toPieceRow(r) }))
      .filter((r) => r.piece != null)
      .map((r) => ({
        pieceId: r.piece!.piece_id,
        char: r.piece!.kanji,
        name: r.piece!.name,
        rarity: r.piece!.rarity ?? 'N',
        weight: toNumber(r.row.weight, 1),
        imageBucket: r.piece!.image_bucket,
        imageKey: r.piece!.image_key,
        description: r.piece!.move_description_ja?.trim()
          ? r.piece!.move_description_ja.trim()
          : null,
      })),
  }));
}

async function getPlayerDailyAdGachaStatus(userId: string): Promise<DailyAdGachaStatus | null> {
  const dayKey = jstDayKey();
  const { data, error } = await measure(
    'gacha.getPlayerDailyAdGachaStatus.query',
    () =>
      supabaseAdmin
        .from('player_daily_ad_gacha')
        .select('date_key')
        .eq('player_id', userId)
        .eq('date_key', dayKey)
        .limit(1)
        .maybeSingle(),
    { userId, dayKey },
  );
  if (error) {
    if (isMissingDailyAdGachaTableError(error)) return null;
    throw error;
  }
  return buildDailyAdGachaStatus({
    dayKey,
    usedDayKey: data ? dayKey : null,
    used: data != null,
  });
}

async function reserveDailyAdGachaRoll(userId: string, dayKey: string): Promise<void> {
  const { error } = await supabaseAdmin.from('player_daily_ad_gacha').insert({
    player_id: userId,
    date_key: dayKey,
  });
  if (error) {
    if (isMissingDailyAdGachaTableError(error)) {
      throw new Error('AD_GACHA_UNAVAILABLE');
    }
    if ((error as { code?: string }).code === '23505') {
      throw new Error('AD_GACHA_UNAVAILABLE');
    }
    throw error;
  }
}

async function releaseDailyAdGachaRoll(userId: string, dayKey: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('player_daily_ad_gacha')
    .delete()
    .eq('player_id', userId)
    .eq('date_key', dayKey);
  if (error && !isMissingDailyAdGachaTableError(error)) {
    throw error;
  }
}

async function getPlayerWallet(
  userId: string,
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const { data, error } = await measure(
    'gacha.getPlayerWallet.query',
    () =>
      supabaseAdmin
        .from('players')
        .select('pawn_currency,gold_currency')
        .eq('id', userId)
        .limit(1)
        .maybeSingle(),
    { userId },
  );
  if (error) throw error;
  if (!data) throw new Error('Player not found');
  return {
    pawnCurrency: toNumber((data as any).pawn_currency),
    goldCurrency: toNumber((data as any).gold_currency),
  };
}

export async function getGachaLobby(userId: string): Promise<GachaLobbySnapshot> {
  const [wallet, gachas, dailyAdGacha] = await measure(
    'gacha.getGachaLobby.parallel',
    () =>
      Promise.all([
        getPlayerWallet(userId),
        loadActiveGachasWithPieces(),
        getPlayerDailyAdGachaStatus(userId),
      ]),
    { userId },
  );

  const banners: GachaLobbyBanner[] = [];
  for (const gacha of gachas) {
    const displayRates = computeOutcomeRatesFromWeights(gacha.pieces);
    banners.push({
      key: gacha.gachaCode,
      name: gacha.gachaName,
      rareRateText: formatRareRateText(displayRates),
      pieceRateText: formatPieceRateLine(gacha.pieces),
      description: null,
      lineup: gacha.pieces.map((p) => ({
        char: p.char,
        name: p.name,
        rarity: p.rarity,
        weight: p.weight,
        description: p.description,
      })),
      usesGold: gacha.costs.gold > 0,
      pawnCost: gacha.costs.pawn,
      goldCost: gacha.costs.gold,
    });
  }

  return {
    banners: sortLobbyBanners(banners),
    pawnCurrency: wallet.pawnCurrency,
    goldCurrency: wallet.goldCurrency,
    history: [],
    dailyAdGacha,
  };
}

async function addPlayerCurrency(
  userId: string,
  delta: { pawn?: number; gold?: number },
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const wallet = await getPlayerWallet(userId);
  const nextPawn = Math.max(0, wallet.pawnCurrency + (delta.pawn ?? 0));
  const nextGold = Math.max(0, wallet.goldCurrency + (delta.gold ?? 0));

  const { error } = await supabaseAdmin
    .from('players')
    .update({
      pawn_currency: nextPawn,
      gold_currency: nextGold,
    })
    .eq('id', userId);
  if (error) throw error;

  return { pawnCurrency: nextPawn, goldCurrency: nextGold };
}

async function spendGachaCost(
  userId: string,
  cost: { pawn: number; gold: number },
): Promise<{ pawnCurrency: number; goldCurrency: number }> {
  const wallet = await getPlayerWallet(userId);
  if (wallet.pawnCurrency < cost.pawn || wallet.goldCurrency < cost.gold) {
    throw new Error('INSUFFICIENT_CURRENCY');
  }

  const nextPawn = wallet.pawnCurrency - cost.pawn;
  const nextGold = wallet.goldCurrency - cost.gold;
  const { error } = await supabaseAdmin
    .from('players')
    .update({
      pawn_currency: nextPawn,
      gold_currency: nextGold,
    })
    .eq('id', userId);
  if (error) throw error;
  return { pawnCurrency: nextPawn, goldCurrency: nextGold };
}

async function grantOwnedPiece(
  userId: string,
  pieceId: number,
): Promise<{ alreadyOwned: boolean }> {
  const { data, error } = await supabaseAdmin
    .from('player_owned_pieces')
    .select('quantity')
    .eq('player_id', userId)
    .eq('piece_id', pieceId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabaseAdmin.from('player_owned_pieces').insert({
      player_id: userId,
      piece_id: pieceId,
      source: 'gacha',
      quantity: 1,
      acquired_at: new Date().toISOString(),
    });
    if (insertError) throw insertError;
    return { alreadyOwned: false };
  }

  const nextQty = toNumber((data as any).quantity, 1) + 1;
  const { error: updateError } = await supabaseAdmin
    .from('player_owned_pieces')
    .update({
      quantity: nextQty,
      source: 'gacha',
      acquired_at: new Date().toISOString(),
    })
    .eq('player_id', userId)
    .eq('piece_id', pieceId);
  if (updateError) throw updateError;
  return { alreadyOwned: true };
}

export async function rollGacha(
  userId: string,
  gachaCode: string,
  options?: { gachaBallColorIndex?: number; adFreeRoll?: boolean },
): Promise<RollGachaResult> {
  const normalized = normalizeGachaCode(gachaCode.trim());
  const gacha = (await loadActiveGachasWithPieces()).find((x) => x.gachaCode === normalized);
  if (!gacha) throw new Error('Gacha not found or unavailable');
  if (gacha.pieces.length === 0) throw new Error('No pieces configured for gacha');

  const adFreeRoll = options?.adFreeRoll === true;
  let reservedDayKey: string | null = null;
  if (adFreeRoll) {
    const status = await getPlayerDailyAdGachaStatus(userId);
    if (!status) {
      throw new Error('AD_GACHA_UNAVAILABLE');
    }
    assertAdFreeRollAllowed(normalized, status);
    reservedDayKey = status.dayKey;
    await reserveDailyAdGachaRoll(userId, reservedDayKey);
  } else {
    await spendGachaCost(userId, { pawn: gacha.costs.pawn, gold: gacha.costs.gold });
  }

  try {
    const colorIndex = normalizeGachaBallColorIndex(options?.gachaBallColorIndex);
    const picked = pickWeightedRandom(gacha.pieces, (item) =>
      effectiveGachaPieceWeight(item.char, item.weight, colorIndex),
    );

    if (picked.char === '歩') {
      const pawnAmount = pawnRewardForCurrencyRoll(gacha.gachaCode);
      const wallet = await addPlayerCurrency(userId, { pawn: pawnAmount, gold: 0 });
      return {
        type: 'miss',
        currency: 'pawn',
        amount: pawnAmount,
        pawnCurrency: wallet.pawnCurrency,
        goldCurrency: wallet.goldCurrency,
      };
    }

    if (picked.char === '金') {
      const wallet = await addPlayerCurrency(userId, { pawn: 0, gold: 1 });
      return {
        type: 'miss',
        currency: 'gold',
        amount: 1,
        pawnCurrency: wallet.pawnCurrency,
        goldCurrency: wallet.goldCurrency,
      };
    }

    const [{ alreadyOwned }, wallet] = await Promise.all([
      grantOwnedPiece(userId, picked.pieceId),
      getPlayerWallet(userId),
    ]);
    activeGachaCache = null;
    activeGachaCacheAt = 0;
    clearPieceCatalogCache();

    return {
      type: 'hit',
      piece: {
        char: picked.char,
        name: picked.name,
        rarity: picked.rarity,
        description: picked.description ?? `${picked.name}を獲得しました。`,
      },
      alreadyOwned,
      pawnCurrency: wallet.pawnCurrency,
      goldCurrency: wallet.goldCurrency,
    };
  } catch (error) {
    if (adFreeRoll && reservedDayKey) {
      await releaseDailyAdGachaRoll(userId, reservedDayKey);
    }
    throw error;
  }
}
