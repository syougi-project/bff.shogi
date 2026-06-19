import { optionsStageClear } from '@/server/handlers/v1/stages/clear';

export const runtime = 'nodejs';

export const OPTIONS = optionsStageClear;

// このAPIはセキュリティ強化のため廃止されました。
export async function POST() {
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
}
