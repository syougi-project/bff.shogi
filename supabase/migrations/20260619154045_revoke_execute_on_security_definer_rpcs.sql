-- 2026-06 セキュリティ強化: SECURITY DEFINER RPC の EXECUTE 権限制限
-- このマイグレーション以降、SECURITY DEFINER 関数は public/anon/authenticated から EXECUTE を禁止し、
-- service role からのみ許可すること。
-- 新規追加時も同様の revoke を必ず行うこと。

-- 1. apply_pvp_rating_for_match
REVOKE EXECUTE ON FUNCTION public.apply_pvp_rating_for_match(text, uuid, uuid, uuid) FROM public, anon, authenticated;

-- 2. apply_pvp_rating_for_user
REVOKE EXECUTE ON FUNCTION public.apply_pvp_rating_for_user(uuid, text, boolean, int) FROM public, anon, authenticated;

-- 3. finish_stage_battle_game_session
REVOKE EXECUTE ON FUNCTION public.finish_stage_battle_game_session(uuid, uuid, text, text, jsonb) FROM public, anon, authenticated;

-- 4. finish_stage_battle_session（旧名が残っている場合も revoke）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'finish_stage_battle_session'
      AND pg_get_function_identity_arguments(oid) = 'uuid, uuid, text, text, jsonb'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.finish_stage_battle_session(uuid, uuid, text, text, jsonb) FROM public, anon, authenticated;';
  END IF;
END $$;

-- 必要に応じて service role への GRANT を明示する（Supabase CLI/console で管理している場合は不要なこともある）
-- GRANT EXECUTE ON FUNCTION public.apply_pvp_rating_for_match(text, uuid, uuid, uuid) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.apply_pvp_rating_for_user(uuid, text, boolean, int) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.finish_stage_battle_game_session(uuid, uuid, text, text, jsonb) TO service_role;
-- GRANT EXECUTE ON FUNCTION public.finish_stage_battle_session(uuid, uuid, text, text, jsonb) TO service_role;
