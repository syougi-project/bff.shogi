import { describe, expect, it } from 'bun:test';

import { createGetMeSnapshot } from '../me/snapshot';
import { postMePvpRatingApply } from '../me/pvp-rating-apply';
import { postInternalPvpRatingApply } from '../internal/pvp-rating-apply';
import { createGetPvpRatingLeaderboard } from '../pvp-rating/leaderboard';
import { readJson } from './test-utils';

describe('POST /api/v1/me/pvp-rating/apply', () => {
  it('returns 410 because client-side rating apply is disabled', async () => {
    const response = await postMePvpRatingApply();
    expect(response.status).toBe(410);
  });
});

describe('GET /api/v1/pvp-rating/leaderboard', () => {
  it('returns 401 without auth', async () => {
    const handler = createGetPvpRatingLeaderboard();
    const response = await handler(
      new Request('http://localhost/api/v1/pvp-rating/leaderboard?limit=20'),
    );
    expect(response.status).toBe(401);
  });

  it('returns 400 for invalid limit', async () => {
    const handler = createGetPvpRatingLeaderboard({
      resolveUserId: async () => 'user-1',
      fetchPvpRatingLeaderboard: async () => ({
        entries: [],
        snapshotAt: '2026-05-26T00:00:00.000Z',
      }),
    });
    const response = await handler(
      new Request('http://localhost/api/v1/pvp-rating/leaderboard?limit=0'),
    );
    expect(response.status).toBe(400);
  });

  it('returns ranked entries with snapshotAt', async () => {
    const handler = createGetPvpRatingLeaderboard({
      resolveUserId: async () => 'user-1',
      fetchPvpRatingLeaderboard: async (limit) => ({
        entries: [
          {
            rank: 1,
            playerId: 'p1',
            displayName: 'Alice',
            rating: 500,
          },
          {
            rank: 2,
            playerId: 'p2',
            displayName: 'Bob',
            rating: 400,
          },
        ].slice(0, limit),
        snapshotAt: '2026-05-26T12:00:00.000Z',
      }),
    });
    const response = await handler(
      new Request('http://localhost/api/v1/pvp-rating/leaderboard?limit=20'),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: {
        entries: [
          { rank: 1, playerId: 'p1', displayName: 'Alice', rating: 500 },
          { rank: 2, playerId: 'p2', displayName: 'Bob', rating: 400 },
        ],
        snapshotAt: '2026-05-26T12:00:00.000Z',
      },
    });
  });
});

describe('POST /api/v1/internal/pvp-rating/apply', () => {
  it('returns 401 without internal token', async () => {
    const response = await postInternalPvpRatingApply(
      new Request('http://localhost/api/v1/internal/pvp-rating/apply', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u1', matchId: 'm1', won: true }),
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe('GET /api/v1/me/snapshot rating default', () => {
  it('exposes rating from player profile', async () => {
    const handler = createGetMeSnapshot({
      resolveUserId: async () => 'user-1',
      getPlayerSnapshot: async () => ({
        displayName: 'テスト',
        rating: 0,
        pawnCurrency: 0,
        goldCurrency: 0,
        playerRank: 1,
        playerExp: 0,
        stamina: 50,
        maxStamina: 50,
        nextRecoveryAt: null,
      }),
    });
    const response = await handler(new Request('http://localhost/api/v1/me/snapshot'));
    const payload = await readJson(response);
    expect(payload).toEqual({
      ok: true,
      data: {
        playerName: 'テスト',
        rating: 0,
        pawnCurrency: 0,
        goldCurrency: 0,
        playerRank: 1,
        playerExp: 0,
        stamina: 50,
        maxStamina: 50,
        nextRecoveryAt: null,
      },
    });
  });
});
