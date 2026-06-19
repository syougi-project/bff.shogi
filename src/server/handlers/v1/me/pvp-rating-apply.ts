import { jsonError, optionsResponse } from '@/lib/http';

export function optionsMePvpRatingApply() {
  return optionsResponse();
}

export async function postMePvpRatingApply() {
  return jsonError('GONE', 'This endpoint is no longer available.', 410);
}
