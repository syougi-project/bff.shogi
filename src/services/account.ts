import { supabaseAdmin } from '@/lib/supabase-admin';

async function deletePlayerGames(userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .schema('game')
    .from('games')
    .delete()
    .eq('player_id', userId);
  if (error) throw error;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

/** プレイヤーに紐づくランタイムデータを消してから Auth ユーザーを削除する。 */
export async function deletePlayerAccount(userId: string): Promise<void> {
  await deletePlayerGames(userId);
  await deleteAuthUser(userId);
}
