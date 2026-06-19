import { optionsMePvpRatingApply } from '@/server/handlers/v1/me/pvp-rating-apply';

export const runtime = 'nodejs';

// このAPIはセキュリティ強化のため廃止されました。
// 410 Gone を返します。

export const OPTIONS = optionsMePvpRatingApply;

export const POST = async () => {
  return new Response(
    JSON.stringify({
      ok: false,
      error: { code: 'GONE', message: 'This endpoint is no longer available.' },
    }),
    {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
