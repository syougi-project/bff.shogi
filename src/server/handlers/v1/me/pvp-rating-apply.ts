import { resolveBearerUserId } from '@/lib/auth';
import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { applyPvpRatingForUser } from '@/services/pvp-rating';

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
