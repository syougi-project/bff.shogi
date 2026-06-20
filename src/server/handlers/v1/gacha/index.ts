import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { measure } from '@/lib/perf';
import { getGachaLobby, rollGacha } from '@/services/gacha';
import { resolveUserId } from '@/server/handlers/v1/deck';

export function optionsGacha() {
  return optionsResponse();
}

export async function getGachaLobbyHandler(req: Request) {
  return measure('request.GET /api/v1/gacha/lobby', async () => {
    const userId = await measure('request.gachaLobby.resolveUserId', () => resolveUserId(req));
    if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

    try {
      const snapshot = await measure(
        'request.gachaLobby.getGachaLobby',
        () => getGachaLobby(userId),
        {
          userId,
        },
      );
      return jsonOk(snapshot);
    } catch (error: any) {
      return jsonError('INTERNAL_ERROR', error?.message ?? 'Failed to load gacha lobby', 500);
    }
  });
}

type RollBody = {
  gachaId?: unknown;
  /** 0=白, 1=青, 2=赤, 3=金, 4=黒（ホームのガチャ玉表示と同期） */
  gachaBallColorIndex?: unknown;
  adFreeRoll?: unknown;
};

export async function postGachaRollHandler(req: Request) {
  const userId = await resolveUserId(req);
  if (!userId) return jsonError('UNAUTHORIZED', 'Authentication required', 401);

  let body: RollBody;
  try {
    body = (await req.json()) as RollBody;
  } catch {
    return jsonError('INVALID_JSON', 'Request body must be JSON', 400);
  }

  const gachaId = typeof body.gachaId === 'string' ? body.gachaId.trim() : '';
  if (!gachaId) return jsonError('INVALID_INPUT', 'gachaId is required', 400);

  const colorIndex =
    typeof body.gachaBallColorIndex === 'number' && Number.isFinite(body.gachaBallColorIndex)
      ? Math.floor(body.gachaBallColorIndex)
      : 0;

  const adFreeRoll = body.adFreeRoll === true;

  try {
    const result = await rollGacha(userId, gachaId, {
      gachaBallColorIndex: colorIndex,
      adFreeRoll,
    });
    return jsonOk(result);
  } catch (error: any) {
    const message = String(error?.message ?? '');
    if (message === 'INSUFFICIENT_CURRENCY') {
      return jsonError('INSUFFICIENT_CURRENCY', 'Not enough currency to roll this gacha', 400);
    }
    if (message === 'AD_GACHA_UNAVAILABLE') {
      return jsonError('AD_GACHA_UNAVAILABLE', '本日の広告無償ガチャは利用できません', 400);
    }
    if (message.includes('not found')) {
      return jsonError('NOT_FOUND', message, 404);
    }
    return jsonError('INTERNAL_ERROR', message || 'Failed to roll gacha', 500);
  }
}
