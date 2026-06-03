import { deleteMeAccount, optionsMeDeleteAccount } from '@/server/handlers/v1/me/delete-account';

export const runtime = 'nodejs';

export const OPTIONS = optionsMeDeleteAccount;
export const DELETE = deleteMeAccount;
