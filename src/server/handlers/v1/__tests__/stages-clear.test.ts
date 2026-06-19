import { describe, expect, it } from 'bun:test';

import { createPostStageClear } from '../stages/clear';
import { readJson } from './test-utils';

describe('POST /api/v1/stages/:stageNo/clear', () => {
  it('returns 410 because direct stage clear reward grants are disabled', async () => {
    const handler = createPostStageClear();
    const response = await handler();
    const payload = await readJson(response);

    expect(response.status).toBe(410);
    expect(payload.error.code).toBe('GONE');
  });
});
