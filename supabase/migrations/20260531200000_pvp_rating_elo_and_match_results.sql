-- オンライン対戦結果の永続化と Elo レート更新 RPC

create table if not exists public.online_match_results (
  match_id              text        primary key,
  player_black_user_id  uuid        not null references public.players(id) on delete cascade,
  player_white_user_id  uuid        not null references public.players(id) on delete cascade,
  winner_user_id        uuid        references public.players(id) on delete set null,
  status                text        not null,
  reason                text        not null,
  started_at            timestamptz not null,
  finished_at           timestamptz not null,
  created_at            timestamptz not null default now(),
  constraint online_match_results_status_chk check (status in ('finished', 'aborted'))
);

create index if not exists online_match_results_black_user_idx
  on public.online_match_results (player_black_user_id, finished_at desc);

create index if not exists online_match_results_white_user_idx
  on public.online_match_results (player_white_user_id, finished_at desc);

alter table public.online_match_results enable row level security;

create or replace function public.elo_rating_delta(
  p_player_rating int,
  p_opponent_rating int,
  p_won boolean
)
returns int
language sql
immutable
as $$
  select round(
    32.0 * (
      (case when p_won then 1.0 else 0.0 end)
      - (1.0 / (1.0 + power(10.0, (greatest(0, p_opponent_rating) - greatest(0, p_player_rating)) / 400.0)))
    )
  )::int;
$$;

create or replace function public.apply_pvp_rating_for_match(
  p_match_id text,
  p_winner_user_id uuid,
  p_black_user_id uuid,
  p_white_user_id uuid
)
returns table (
  user_id uuid,
  rating int,
  delta int,
  already_applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_black_rating int;
  v_white_rating int;
  v_black_delta int;
  v_white_delta int;
  v_black_after int;
  v_white_after int;
  v_black_won boolean;
begin
  if exists (
    select 1
    from public.player_pvp_rating_events e
    where e.match_id = p_match_id
      and e.player_id in (p_black_user_id, p_white_user_id)
    limit 1
  ) then
    return query
      select
        e.player_id,
        e.rating_after,
        e.delta,
        true
      from public.player_pvp_rating_events e
      where e.match_id = p_match_id
        and e.player_id in (p_black_user_id, p_white_user_id)
      order by e.player_id;
    return;
  end if;

  select greatest(0, coalesce(rating, 0))
    into v_black_rating
  from public.players
  where id = p_black_user_id
  for update;

  if not found then
    raise exception 'Player not found: %', p_black_user_id;
  end if;

  select greatest(0, coalesce(rating, 0))
    into v_white_rating
  from public.players
  where id = p_white_user_id
  for update;

  if not found then
    raise exception 'Player not found: %', p_white_user_id;
  end if;

  v_black_won := p_winner_user_id = p_black_user_id;
  v_black_delta := public.elo_rating_delta(v_black_rating, v_white_rating, v_black_won);
  v_white_delta := public.elo_rating_delta(v_white_rating, v_black_rating, not v_black_won);
  v_black_after := greatest(0, v_black_rating + v_black_delta);
  v_white_after := greatest(0, v_white_rating + v_white_delta);

  update public.players
  set rating = v_black_after, updated_at = now()
  where id = p_black_user_id;

  update public.players
  set rating = v_white_after, updated_at = now()
  where id = p_white_user_id;

  insert into public.player_pvp_rating_events (player_id, match_id, won, delta, rating_after)
  values
    (p_black_user_id, p_match_id, v_black_won, v_black_delta, v_black_after),
    (p_white_user_id, p_match_id, not v_black_won, v_white_delta, v_white_after);

  return query
    select p_black_user_id, v_black_after, v_black_delta, false
    union all
    select p_white_user_id, v_white_after, v_white_delta, false;
end;
$$;

create or replace function public.apply_pvp_rating_for_user(
  p_user_id uuid,
  p_match_id text,
  p_won boolean,
  p_opponent_rating int default null
)
returns table (
  rating int,
  delta int,
  already_applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_match record;
  v_opponent_id uuid;
  v_player_rating int;
  v_opponent_rating int;
  v_delta int;
  v_after int;
begin
  select e.delta, e.rating_after
    into v_existing
  from public.player_pvp_rating_events e
  where e.player_id = p_user_id
    and e.match_id = p_match_id
  limit 1;

  if found then
    return query select v_existing.rating_after, v_existing.delta, true;
    return;
  end if;

  select
    r.player_black_user_id,
    r.player_white_user_id,
    r.winner_user_id
    into v_match
  from public.online_match_results r
  where r.match_id = p_match_id
  limit 1;

  if found and v_match.winner_user_id is not null then
    perform *
    from public.apply_pvp_rating_for_match(
      p_match_id,
      v_match.winner_user_id,
      v_match.player_black_user_id,
      v_match.player_white_user_id
    );

    select e.delta, e.rating_after
      into v_existing
    from public.player_pvp_rating_events e
    where e.player_id = p_user_id
      and e.match_id = p_match_id
    limit 1;

    if found then
      return query select v_existing.rating_after, v_existing.delta, true;
      return;
    end if;
  end if;

  if found then
    if p_user_id = v_match.player_black_user_id then
      v_opponent_id := v_match.player_white_user_id;
    elsif p_user_id = v_match.player_white_user_id then
      v_opponent_id := v_match.player_black_user_id;
    else
      raise exception 'User does not belong to match';
    end if;

    select greatest(0, coalesce(rating, 0))
      into v_opponent_rating
    from public.players
    where id = v_opponent_id;
  elsif p_opponent_rating is not null then
    v_opponent_rating := greatest(0, p_opponent_rating);
  else
    raise exception 'Match result not found for rating apply';
  end if;

  select greatest(0, coalesce(rating, 0))
    into v_player_rating
  from public.players
  where id = p_user_id
  for update;

  if not found then
    raise exception 'Player not found';
  end if;

  v_delta := public.elo_rating_delta(v_player_rating, v_opponent_rating, p_won);
  v_after := greatest(0, v_player_rating + v_delta);

  update public.players
  set rating = v_after, updated_at = now()
  where id = p_user_id;

  insert into public.player_pvp_rating_events (player_id, match_id, won, delta, rating_after)
  values (p_user_id, p_match_id, p_won, v_delta, v_after);

  return query select v_after, v_delta, false;
end;
$$;

notify pgrst, 'reload schema';
