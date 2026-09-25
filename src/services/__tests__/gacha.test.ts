import { describe, expect, it } from 'bun:test';

import {
  computeOutcomeRatesFromWeights,
  normalizeGachaPieceRarity,
  pickWeightedRandom,
} from '@/services/gacha';

describe('gacha weighted pool', () => {
  it('normalizeGachaPieceRarity maps 膠 to SSR', () => {
    expect(normalizeGachaPieceRarity('膠', 'UR')).toBe('SSR');
    expect(normalizeGachaPieceRarity('閹', 'UR')).toBe('UR');
  });

  it('computeOutcomeRatesFromWeights matches hihen HTML weights', () => {
    const rates = computeOutcomeRatesFromWeights([
      { char: '歩', rarity: 'N', weight: 45 },
      { char: '金', rarity: 'N', weight: 25 },
      { char: '灯', rarity: 'R', weight: 15 },
      { char: '煽', rarity: 'SR', weight: 10 },
      { char: '爆', rarity: 'UR', weight: 5 },
    ]);
    expect(rates.N).toBeCloseTo(0.7, 4);
    expect(rates.R).toBeCloseTo(0.15, 4);
    expect(rates.SR).toBeCloseTo(0.1, 4);
    expect(rates.UR).toBeCloseTo(0.05, 4);
  });

  it('computeOutcomeRatesFromWeights counts 膠 as SSR for kanken1 pool', () => {
    const rates = computeOutcomeRatesFromWeights([
      { char: '歩', rarity: 'N', weight: 66 },
      { char: '金', rarity: 'N', weight: 25 },
      { char: '艸', rarity: 'UR', weight: 3 },
      { char: '閹', rarity: 'UR', weight: 3 },
      { char: '膠', rarity: normalizeGachaPieceRarity('膠', 'UR'), weight: 3 },
    ]);
    expect(rates.UR).toBeCloseTo(0.06, 4);
    expect(rates.SSR).toBeCloseTo(0.03, 4);
  });

  it('pickWeightedRandom respects dominant weight over many trials', () => {
    const items = [
      { id: 'pawn', weight: 90 },
      { id: 'rare', weight: 10 },
    ];
    let pawnHits = 0;
    for (let i = 0; i < 500; i += 1) {
      const picked = pickWeightedRandom(items, (x) => x.weight);
      if (picked.id === 'pawn') pawnHits += 1;
    }
    expect(pawnHits).toBeGreaterThan(400);
  });
});
