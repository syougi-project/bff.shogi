/** レート変動の対象となる終了理由（勝敗確定。意図的切断 disconnect 含む）。 */
const RATED_ONLINE_MATCH_END_REASONS = new Set([
  'king_capture',
  'checkmate',
  'resign',
  'disconnect',
]);

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
