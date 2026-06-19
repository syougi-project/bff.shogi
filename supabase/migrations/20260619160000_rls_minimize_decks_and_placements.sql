-- 2026-06 セキュリティ強化: player_decks, player_deck_placements の RLS 書き込み権限最小化
--
-- player_decks, player_deck_placements: INSERT/UPDATE/DELETE policy を削除（BFF/RPC専用にする場合）
-- 配置piece_idが本人所有であることをwith checkで保証する場合は、必要に応じて追加

-- player_decks
DROP POLICY IF EXISTS "player_decks: self insert" ON public.player_decks;
DROP POLICY IF EXISTS "player_decks: self update" ON public.player_decks;
DROP POLICY IF EXISTS "player_decks: self delete" ON public.player_decks;

-- player_deck_placements
DROP POLICY IF EXISTS "player_deck_placements: self insert" ON public.player_deck_placements;
DROP POLICY IF EXISTS "player_deck_placements: self update" ON public.player_deck_placements;
DROP POLICY IF EXISTS "player_deck_placements: self delete" ON public.player_deck_placements;

-- 必要に応じてwith check制約を追加する場合の例:
-- CREATE POLICY "player_deck_placements: owned_piece_only" ON public.player_deck_placements
--   FOR INSERT, UPDATE
--   USING (EXISTS (
--     SELECT 1 FROM public.player_owned_pieces pop
--     WHERE pop.player_id = (SELECT player_id FROM public.player_decks d WHERE d.deck_id = player_deck_placements.deck_id)
--       AND pop.piece_id = player_deck_placements.piece_id
--   ))
--   WITH CHECK (EXISTS (
--     SELECT 1 FROM public.player_owned_pieces pop
--     WHERE pop.player_id = (SELECT player_id FROM public.player_decks d WHERE d.deck_id = player_deck_placements.deck_id)
--       AND pop.piece_id = player_deck_placements.piece_id
--   ));
