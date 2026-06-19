-- 2026-06 セキュリティ強化: player_stage_clears, player_owned_pieces, players の RLS 書き込み権限最小化
--
-- player_stage_clears: INSERT/UPDATE policy を削除（BFF/RPC専用に）
-- player_owned_pieces: INSERT/DELETE policy を削除（BFF/RPC専用に）
-- players: UPDATE policy を削除（表示名更新も BFF service role 経由に限定）

-- player_stage_clears
DROP POLICY IF EXISTS "player_stage_clears: self insert" ON public.player_stage_clears;
DROP POLICY IF EXISTS "player_stage_clears: self update" ON public.player_stage_clears;

-- player_owned_pieces
DROP POLICY IF EXISTS "player_owned_pieces: self insert" ON public.player_owned_pieces;
DROP POLICY IF EXISTS "player_owned_pieces: self delete" ON public.player_owned_pieces;

-- players
DROP POLICY IF EXISTS "players: self update" ON public.players;
DROP POLICY IF EXISTS "players: self update_display_name_only" ON public.players;
