import { describe, expect, it } from 'bun:test';

import { applyEloRatingDelta, calculateEloRatingDelta, normalizePvpRating } from '@/lib/elo-rating';

describe('elo-rating', () => {
  it('keeps ratings as non-negative integers', () => {
    expect(normalizePvpRating(12.9)).toBe(12);
    expect(normalizePvpRating(-5)).toBe(0);
    expect(applyEloRatingDelta(10, -20)).toBe(0);
  });

  it('uses symmetric small deltas when ratings are equal', () => {
    expect(calculateEloRatingDelta(1500, 1500, true)).toBe(16);
    expect(calculateEloRatingDelta(1500, 1500, false)).toBe(-16);
  });

  it('gives smaller gain and smaller loss when the higher-rated player wins', () => {
    const winnerDelta = calculateEloRatingDelta(1800, 1200, true);
    const loserDelta = calculateEloRatingDelta(1200, 1800, false);
    expect(winnerDelta).toBeGreaterThan(0);
    expect(-loserDelta).toBeGreaterThan(0);
    expect(calculateEloRatingDelta(1500, 1500, true)).toBeGreaterThan(winnerDelta);
    expect(Math.abs(calculateEloRatingDelta(1500, 1500, false))).toBeGreaterThan(
      Math.abs(loserDelta),
    );
  });

  it('gives larger gain and larger loss when the lower-rated player wins', () => {
    const winnerDelta = calculateEloRatingDelta(1000, 2000, true);
    const loserDelta = calculateEloRatingDelta(2000, 1000, false);
    expect(winnerDelta).toBeGreaterThan(calculateEloRatingDelta(1500, 1500, true));
    expect(Math.abs(loserDelta)).toBeGreaterThan(
      Math.abs(calculateEloRatingDelta(1500, 1500, false)),
    );
  });
});
