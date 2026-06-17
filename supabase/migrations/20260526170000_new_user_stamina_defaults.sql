-- 新規プレイヤーはスタミナ満タン（50/50）で開始する（trigger でも明示）

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.players (id, rating, stamina, max_stamina, stamina_updated_at)
  values (new.id, 0, 50, 50, now())
  on conflict (id) do nothing;

  perform public.seed_initial_owned_pieces(new.id);

  perform public.ensure_default_my_deck_for_user(new.id);

  return new;
end;
$$;
