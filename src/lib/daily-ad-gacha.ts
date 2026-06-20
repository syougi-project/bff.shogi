/** 広告無償ガチャの対象（漢検1級は含まない） */
export const DAILY_AD_GACHA_CODES = ['ukanmuri', 'hihen', 'shinnyo'] as const;

export type DailyAdGachaCode = (typeof DAILY_AD_GACHA_CODES)[number];

export type DailyAdGachaStatus = {
  /** JST 0:00 基準の日付キー（YYYY-MM-DD） */
  dayKey: string;
  featuredGachaKey: DailyAdGachaCode;
  used: boolean;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function jstDayKey(nowMs: number = Date.now()): string {
  const jst = new Date(nowMs + JST_OFFSET_MS);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hashDayKey(dayKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i += 1) {
    h ^= dayKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function featuredAdGachaCodeForDay(dayKey: string): DailyAdGachaCode {
  const index = hashDayKey(dayKey) % DAILY_AD_GACHA_CODES.length;
  return DAILY_AD_GACHA_CODES[index] ?? 'ukanmuri';
}

export function normalizeAdGachaCode(code: string): DailyAdGachaCode | null {
  const normalized = code.trim().toLowerCase();
  if (normalized === 'hihen') return 'hihen';
  if (normalized === 'ukanmuri') return 'ukanmuri';
  if (normalized === 'shinnyo') return 'shinnyo';
  return null;
}

export function buildDailyAdGachaStatus(input: {
  dayKey: string;
  usedDayKey: string | null;
  used: boolean;
}): DailyAdGachaStatus {
  const dayKey = input.dayKey;
  const featuredGachaKey = featuredAdGachaCodeForDay(dayKey);
  const used = input.usedDayKey === dayKey && input.used;
  return { dayKey, featuredGachaKey, used };
}

export function canRollGachaWithAd(gachaKey: string, status: DailyAdGachaStatus): boolean {
  if (status.used) return false;
  const code = normalizeAdGachaCode(gachaKey);
  return code != null && code === status.featuredGachaKey;
}

export function assertAdFreeRollAllowed(gachaKey: string, status: DailyAdGachaStatus): void {
  if (!canRollGachaWithAd(gachaKey, status)) {
    throw new Error('AD_GACHA_UNAVAILABLE');
  }
}
