-- 2026-06 セキュリティ強化: player_stage_clears SELECT policy のみ残す
--
-- player_stage_clears: SELECT policy 以外を削除
DROP POLICY IF EXISTS "player_stage_clears: self insert" ON public.player_stage_clears;
DROP POLICY IF EXISTS "player_stage_clears: self update" ON public.player_stage_clears;
