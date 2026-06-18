import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { shouldApplyPvpRatingForMatch } from '@/services/online-match-rating-policy';
import { applyPvpRatingForUser, ensureOnlineMatchRecordedForRating } from '@/services/pvp-rating';

export function optionsMePvpRatingApply() {
  return optionsResponse();
}

async function resolveUserId(req: Request): Promise<string | null> {
  return resolveBearerUserId(req);
}

type ApplyBody = {
  matchId?: string;
  won?: boolean;
  opponentRating?: number;
  recordMatch?: {
    playerBlackUserId?: string;
    playerWhiteUserId?: string;
    winnerUserId?: string;
    reason?: string;
    startedAt?: string;
    finishedAt?: string;
  };
};

export async function postMePvpRatingApply(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) {
    return jsonError('UNAUTHORIZED', 'Authentication required', 401);
  }

  let body: ApplyBody;
  try {
    body = (await req.json()) as ApplyBody;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  const matchId = typeof body.matchId === 'string' ? body.matchId.trim() : '';
  if (!matchId) {
    return jsonError('INVALID_INPUT', 'matchId is required', 400);
  }
  if (typeof body.won !== 'boolean') {
    return jsonError('INVALID_INPUT', 'won must be a boolean', 400);
  }

  try {
    const opponentRating =
      typeof body.opponentRating === 'number' && Number.isFinite(body.opponentRating)
        ? body.opponentRating
        : undefined;

    const record = body.recordMatch;
    if (record) {
      const playerBlackUserId =
        typeof record.playerBlackUserId === 'string' ? record.playerBlackUserId.trim() : '';
      const playerWhiteUserId =
        typeof record.playerWhiteUserId === 'string' ? record.playerWhiteUserId.trim() : '';
      const winnerUserId =
        typeof record.winnerUserId === 'string' ? record.winnerUserId.trim() : '';
      const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
      const finishedAt =
        typeof record.finishedAt === 'string' && record.finishedAt.trim()
          ? record.finishedAt.trim()
          : new Date().toISOString();
      const startedAt =
        typeof record.startedAt === 'string' && record.startedAt.trim()
          ? record.startedAt.trim()
          : finishedAt;

      if (
        playerBlackUserId &&
        playerWhiteUserId &&
        winnerUserId &&
        reason &&
        shouldApplyPvpRatingForMatch({
          status: 'finished',
          winnerUserId,
          reason,
        })
      ) {
        await ensureOnlineMatchRecordedForRating({
          matchId,
          playerBlackUserId,
          playerWhiteUserId,
          winnerUserId,
          status: 'finished',
          reason,
          startedAt,
          finishedAt,
        });
      }
    }

    const result = await applyPvpRatingForUser({
      userId,
      matchId,
      won: body.won,
      opponentRating,
    });
    return jsonOk({
      rating: result.rating,
      delta: result.delta,
      alreadyApplied: result.alreadyApplied,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to apply PvP rating';
    if (message.includes('not found')) {
      return jsonError('PLAYER_NOT_FOUND', message, 404);
    }
    return jsonError('INTERNAL_ERROR', message, 500);
  }
}
