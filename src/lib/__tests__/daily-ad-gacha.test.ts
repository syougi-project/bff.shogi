import { describe, expect, it } from 'bun:test';

import {
  buildDailyAdGachaStatus,
  canRollGachaWithAd,
  featuredAdGachaCodeForDay,
  jstDayKey,
} from '../daily-ad-gacha';

describe('daily-ad-gacha', () => {
  it('JSTの日付キーを返す', () => {
    const dayKey = jstDayKey(new Date('2026-05-25T15:00:00.000Z').getTime());
    expect(dayKey).toBe('2026-05-26');
  });

  it('同じ日付なら同じガチャを選ぶ', () => {
    const first = featuredAdGachaCodeForDay('2026-05-26');
    const second = featuredAdGachaCodeForDay('2026-05-26');
    expect(first).toBe(second);
  });

  it('未使用かつ本日の対象ガチャのみ広告無料で引ける', () => {
    const status = buildDailyAdGachaStatus({
      dayKey: '2026-05-26',
      usedDayKey: null,
      used: false,
    });
    expect(canRollGachaWithAd(status.featuredGachaKey, status)).toBe(true);
    expect(canRollGachaWithAd('kanken1', status)).toBe(false);
    expect(canRollGachaWithAd(status.featuredGachaKey, { ...status, used: true })).toBe(false);
  });
});
