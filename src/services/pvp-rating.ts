import { supabaseAdmin } from '@/lib/supabase-admin';
import { measure } from '@/lib/perf';
import {
  applyEloRatingDelta,
  calculateEloRatingDelta,
  ELO_K_FACTOR,
  normalizePvpRating,
} from '@/lib/elo-rating';
import { shouldApplyPvpRatingForMatch } from '@/services/online-match-rating-policy';

export const PVP_RATING_INITIAL = 0;
export { ELO_K_FACTOR, calculateEloRatingDelta, normalizePvpRating };

export type PvpRatingApplyResult = {
  rating: number;
  delta: number;
  alreadyApplied: boolean;
};

export type PvpRatingMatchApplyResult = {
  userId: string;
  rating: number;
  delta: number;
  alreadyApplied: boolean;
};

export async function applyPvpRatingForMatch(input: {
  matchId: string;
  winnerUserId: string;
  playerBlackUserId: string;
  playerWhiteUserId: string;
}): Promise<PvpRatingMatchApplyResult[]> {
  const matchId = input.matchId.trim();
  if (!matchId) throw new Error('matchId is required');

  const { data, error } = await measure(
    'players.applyPvpRatingForMatch.rpc',
    () =>
      supabaseAdmin.rpc('apply_pvp_rating_for_match', {
        p_match_id: matchId,
        p_winner_user_id: input.winnerUserId,
        p_black_user_id: input.playerBlackUserId,
        p_white_user_id: input.playerWhiteUserId,
      }),
    { matchId },
  );

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    user_id?: unknown;
    rating?: unknown;
    delta?: unknown;
    already_applied?: unknown;
  }>;

  return rows.map((row) => ({
    userId: String(row.user_id ?? ''),
    rating: normalizePvpRating(row.rating),
    delta: Number(row.delta ?? 0),
    alreadyApplied: Boolean(row.already_applied),
  }));
}

export async function applyPvpRatingForUser(input: {
  userId: string;
  matchId: string;
  won: boolean;
  opponentRating?: number;
}): Promise<PvpRatingApplyResult> {
  const matchId = input.matchId.trim();
  if (!matchId) {
    throw new Error('matchId is required');
  }

  const eligibility = await resolveRecordedMatchRatingEligibility(matchId);
  if (eligibility === false) {
    const profile = await getPublicPlayerProfile(input.userId);
    return {
      rating: profile?.rating ?? PVP_RATING_INITIAL,
      delta: 0,
      alreadyApplied: true,
    };
  }

  const { data, error } = await measure(
    'players.applyPvpRatingForUser.rpc',
    () =>
      supabaseAdmin.rpc('apply_pvp_rating_for_user', {
        p_user_id: input.userId,
        p_match_id: matchId,
        p_won: input.won,
        p_opponent_rating:
          input.opponentRating === undefined ? null : normalizePvpRating(input.opponentRating),
      }),
    { userId: input.userId, matchId, won: input.won },
  );

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as {
    rating?: unknown;
    delta?: unknown;
    already_applied?: unknown;
  } | null;
  if (!row) {
    throw new Error('Failed to apply PvP rating');
  }

  return {
    rating: normalizePvpRating(row.rating),
    delta: Number(row.delta ?? 0),
    alreadyApplied: Boolean(row.already_applied),
  };
}

/** ローカルテストや RPC 未適用環境向けのフォールバック（本番は RPC を使用）。 */
export function calculatePvpRatingApplyPreview(input: {
  playerRating: number;
  opponentRating: number;
  won: boolean;
}): { rating: number; delta: number } {
  const delta = calculateEloRatingDelta(input.playerRating, input.opponentRating, input.won);
  return {
    delta,
    rating: applyEloRatingDelta(input.playerRating, delta),
  };
}

export const PVP_RATING_LEADERBOARD_DEFAULT_LIMIT = 20;
export const PVP_RATING_LEADERBOARD_MAX_LIMIT = 100;

export type PvpRatingLeaderboardEntry = {
  rank: number;
  playerId: string;
  displayName: string;
  rating: number;
};

export type PvpRatingLeaderboardSnapshot = {
  entries: PvpRatingLeaderboardEntry[];
  snapshotAt: string;
};

export async function fetchPvpRatingLeaderboard(
  limit: number = PVP_RATING_LEADERBOARD_DEFAULT_LIMIT,
): Promise<PvpRatingLeaderboardSnapshot> {
  const safeLimit = Math.min(PVP_RATING_LEADERBOARD_MAX_LIMIT, Math.max(1, Math.floor(limit)));

  const { data, error } = await measure(
    'players.fetchPvpRatingLeaderboard.query',
    () =>
      supabaseAdmin
        .from('players')
        .select('id,display_name,rating')
        .order('rating', { ascending: false })
        .order('updated_at', { ascending: true })
        .limit(safeLimit),
    { limit: safeLimit },
  );

  if (error) throw error;

  const snapshotAt = new Date().toISOString();
  const entries = (data ?? []).map((row, index) => {
    const playerId = String(row.id ?? '').trim();
    const displayName = ((row.display_name as string | null) ?? '').trim() || playerId;
    return {
      rank: index + 1,
      playerId,
      displayName,
      rating: normalizePvpRating(row.rating),
    };
  });

  return { entries, snapshotAt };
}

export async function getPublicPlayerProfile(userId: string): Promise<{
  userId: string;
  displayName: string;
  rating: number;
} | null> {
  const { data, error } = await measure(
    'players.getPublicPlayerProfile.query',
    () =>
      supabaseAdmin
        .from('players')
        .select('display_name,rating')
        .eq('id', userId)
        .limit(1)
        .maybeSingle(),
    { userId },
  );

  if (error) throw error;
  if (!data) return null;

  const displayName = ((data.display_name as string | null) ?? '').trim() || userId;
  return {
    userId,
    displayName,
    rating: normalizePvpRating(data.rating),
  };
}

async function resolveRecordedMatchRatingEligibility(matchId: string): Promise<boolean | null> {
  const { data, error } = await supabaseAdmin
    .from('online_match_results')
    .select('status,winner_user_id,reason')
    .eq('match_id', matchId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return shouldApplyPvpRatingForMatch({
    status: data.status === 'aborted' ? 'aborted' : 'finished',
    winnerUserId: typeof data.winner_user_id === 'string' ? data.winner_user_id : null,
    reason: typeof data.reason === 'string' ? data.reason : null,
  });
}
