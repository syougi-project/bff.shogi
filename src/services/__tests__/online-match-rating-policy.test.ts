import { describe, expect, it } from 'bun:test';

import {
  isRatedOnlineMatchEndReason,
  shouldApplyPvpRatingForMatch,
} from '@/services/online-match-rating-policy';

describe('online-match-rating-policy', () => {
  it('rates only decisive shogi outcomes', () => {
    expect(isRatedOnlineMatchEndReason('king_capture')).toBe(true);
    expect(isRatedOnlineMatchEndReason('resign')).toBe(true);
    expect(isRatedOnlineMatchEndReason('checkmate')).toBe(true);
    expect(isRatedOnlineMatchEndReason('disconnect')).toBe(false);
    expect(isRatedOnlineMatchEndReason('disconnect_timeout')).toBe(false);
    expect(isRatedOnlineMatchEndReason('unknown')).toBe(false);
  });

  it('does not rate aborted matches or technical finishes', () => {
    expect(
      shouldApplyPvpRatingForMatch({
        status: 'aborted',
        winnerUserId: 'user-1',
        reason: 'disconnect_timeout',
      }),
    ).toBe(false);
    expect(
      shouldApplyPvpRatingForMatch({
        status: 'finished',
        winnerUserId: 'user-1',
        reason: 'disconnect',
      }),
    ).toBe(false);
    expect(
      shouldApplyPvpRatingForMatch({
        status: 'finished',
        winnerUserId: 'user-1',
        reason: 'king_capture',
      }),
    ).toBe(true);
  });
});
