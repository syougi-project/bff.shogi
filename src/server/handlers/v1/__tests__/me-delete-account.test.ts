import { describe, expect, it } from 'bun:test';

import { createDeleteMeAccount } from '../me/delete-account';
import { readJson } from './test-utils';

describe('DELETE /api/v1/me/account', () => {
  it('returns 401 when auth is missing', async () => {
    const handler = createDeleteMeAccount({
      resolveUserId: async () => null,
      deleteAuthUser: async () => {},
    });

    const response = await handler(
      new Request('http://localhost/api/v1/me/account', { method: 'DELETE' }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('deletes the authenticated user', async () => {
    let deletedUserId: string | null = null;
    const handler = createDeleteMeAccount({
      resolveUserId: async () => 'user-1',
      deleteAuthUser: async (userId) => {
        deletedUserId = userId;
      },
    });

    const response = await handler(
      new Request('http://localhost/api/v1/me/account', { method: 'DELETE' }),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      data: { deleted: true },
    });
    expect(deletedUserId).toBe('user-1');
  });
});
