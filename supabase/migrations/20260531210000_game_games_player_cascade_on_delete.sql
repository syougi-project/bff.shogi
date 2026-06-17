-- アカウント削除時に game.games の RESTRICT が Auth 削除を妨げないようにする。

alter table game.games
  drop constraint if exists games_player_id_fkey;

alter table game.games
  add constraint games_player_id_fkey
  foreign key (player_id)
  references public.players(id)
  on delete cascade;

notify pgrst, 'reload schema';
