import { describe, expect, it } from 'bun:test';

import {
  computeStageClearCurrencyGrant,
  firstClearStageCurrencyGrant,
  repeatClearPawnReward,
} from '@/lib/stage-clear-currency-reward';

describe('stage-clear-currency-reward', () => {
  it('初回クリアはステージ帯ごとに歩・金が変わる', () => {
    expect(firstClearStageCurrencyGrant(1)).toEqual({ pawn: 5, gold: 0 });
    expect(firstClearStageCurrencyGrant(5)).toEqual({ pawn: 5, gold: 0 });
    expect(firstClearStageCurrencyGrant(6)).toEqual({ pawn: 5, gold: 1 });
    expect(firstClearStageCurrencyGrant(10)).toEqual({ pawn: 5, gold: 1 });
    expect(firstClearStageCurrencyGrant(11)).toEqual({ pawn: 8, gold: 2 });
    expect(firstClearStageCurrencyGrant(20)).toEqual({ pawn: 8, gold: 2 });
    expect(firstClearStageCurrencyGrant(21)).toEqual({ pawn: 12, gold: 2 });
    expect(firstClearStageCurrencyGrant(30)).toEqual({ pawn: 12, gold: 2 });
    expect(firstClearStageCurrencyGrant(31)).toEqual({ pawn: 20, gold: 3 });
    expect(firstClearStageCurrencyGrant(40)).toEqual({ pawn: 20, gold: 3 });
    expect(firstClearStageCurrencyGrant(41)).toEqual({ pawn: 25, gold: 3 });
    expect(firstClearStageCurrencyGrant(50)).toEqual({ pawn: 25, gold: 3 });
    expect(computeStageClearCurrencyGrant(99, true)).toEqual({ pawn: 25, gold: 3 });
  });

  it('2回目以降は歩のみ floor(stageNo/5)+2', () => {
    expect(repeatClearPawnReward(1)).toBe(2);
    expect(repeatClearPawnReward(4)).toBe(2);
    expect(repeatClearPawnReward(5)).toBe(3);
    expect(repeatClearPawnReward(10)).toBe(4);
    expect(repeatClearPawnReward(25)).toBe(7);
    expect(computeStageClearCurrencyGrant(10, false)).toEqual({ pawn: 4, gold: 0 });
  });
});
