import { jsonError, optionsResponse } from '@/lib/http';

export function optionsStageClear() {
  return optionsResponse();
}

export function createPostStageClear() {
  return async function postStageClear() {
    return jsonError('GONE', 'This endpoint is no longer available.', 410);
  };
}

export const postStageClear = createPostStageClear();
