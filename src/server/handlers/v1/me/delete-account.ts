import { jsonError, jsonOk, optionsResponse } from '@/lib/http';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { deletePlayerAccount } from '@/services/account';

export function optionsMeDeleteAccount() {
  return optionsResponse();
}

type DeleteMeAccountDeps = {
  resolveUserId: (req: Request) => Promise<string | null>;
  deletePlayerAccount: typeof deletePlayerAccount;
};

async function resolveUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function createDeleteMeAccount(
  deps: DeleteMeAccountDeps = { resolveUserId, deletePlayerAccount },
) {
  return async function deleteMeAccount(req: Request) {
    const userId = await deps.resolveUserId(req);
    if (!userId) {
      return jsonError('UNAUTHORIZED', 'Authentication required', 401);
    }

    try {
      await deps.deletePlayerAccount(userId);
      return jsonOk({ deleted: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete account';
      return jsonError('INTERNAL_ERROR', message, 500);
    }
  };
}

export const deleteMeAccount = createDeleteMeAccount();
