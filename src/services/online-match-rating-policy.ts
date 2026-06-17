/** レート変動の対象となる正常終了理由（将棋の勝敗が確定したケースのみ）。 */
const RATED_ONLINE_MATCH_END_REASONS = new Set(['king_capture', 'checkmate', 'resign']);

export function isRatedOnlineMatchEndReason(reason: string | null | undefined): boolean {
  const normalized = (reason ?? '').trim().toLowerCase();
  if (!normalized) return false;
  return RATED_ONLINE_MATCH_END_REASONS.has(normalized);
}

export function shouldApplyPvpRatingForMatch(input: {
  status: 'finished' | 'aborted';
  winnerUserId: string | null;
  reason: string | null | undefined;
}): boolean {
  if (input.status !== 'finished' || !input.winnerUserId) return false;
  return isRatedOnlineMatchEndReason(input.reason);
}
