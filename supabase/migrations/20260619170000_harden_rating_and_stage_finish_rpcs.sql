-- 2026-06 security hardening: enforce server-recorded match/session state in privileged RPCs.

begin;

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
  v_match public.online_match_results%rowtype;
  v_black_rating int;
  v_white_rating int;
  v_black_delta int;
  v_white_delta int;
  v_black_after int;
  v_white_after int;
  v_black_won boolean;
begin
  select *
    into v_match
  from public.online_match_results r
  where r.match_id = trim(p_match_id)
  limit 1;

  if not found then
    raise exception 'Match result not found for rating apply';
  end if;

  if v_match.status <> 'finished'
    or v_match.winner_user_id is null
    or lower(trim(v_match.reason)) not in ('king_capture', 'checkmate', 'resign', 'disconnect')
  then
    raise exception 'Match is not eligible for rating apply';
  end if;

  if v_match.player_black_user_id <> p_black_user_id
    or v_match.player_white_user_id <> p_white_user_id
    or v_match.winner_user_id <> p_winner_user_id
  then
    raise exception 'Match rating inputs do not match recorded result';
  end if;

  if p_winner_user_id not in (p_black_user_id, p_white_user_id) then
    raise exception 'Winner does not belong to match';
  end if;

  if exists (
    select 1
    from public.player_pvp_rating_events e
    where e.match_id = trim(p_match_id)
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
      where e.match_id = trim(p_match_id)
        and e.player_id in (p_black_user_id, p_white_user_id)
      order by e.player_id;
    return;
  end if;

  select greatest(0, coalesce(p.rating, 0))
    into v_black_rating
  from public.players p
  where p.id = p_black_user_id
  for update;

  if not found then
    raise exception 'Player not found: %', p_black_user_id;
  end if;

  select greatest(0, coalesce(p.rating, 0))
    into v_white_rating
  from public.players p
  where p.id = p_white_user_id
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
    (p_black_user_id, trim(p_match_id), v_black_won, v_black_delta, v_black_after),
    (p_white_user_id, trim(p_match_id), not v_black_won, v_white_delta, v_white_after);

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
  v_match public.online_match_results%rowtype;
begin
  select e.delta, e.rating_after
    into v_existing
  from public.player_pvp_rating_events e
  where e.player_id = p_user_id
    and e.match_id = trim(p_match_id)
  limit 1;

  if found then
    return query select v_existing.rating_after, v_existing.delta, true;
    return;
  end if;

  select *
    into v_match
  from public.online_match_results r
  where r.match_id = trim(p_match_id)
  limit 1;

  if not found then
    raise exception 'Match result not found for rating apply';
  end if;

  if p_user_id not in (v_match.player_black_user_id, v_match.player_white_user_id) then
    raise exception 'User does not belong to match';
  end if;

  if v_match.status <> 'finished'
    or v_match.winner_user_id is null
    or lower(trim(v_match.reason)) not in ('king_capture', 'checkmate', 'resign', 'disconnect')
  then
    raise exception 'Match is not eligible for rating apply';
  end if;

  perform *
  from public.apply_pvp_rating_for_match(
    trim(p_match_id),
    v_match.winner_user_id,
    v_match.player_black_user_id,
    v_match.player_white_user_id
  );

  select e.delta, e.rating_after
    into v_existing
  from public.player_pvp_rating_events e
  where e.player_id = p_user_id
    and e.match_id = trim(p_match_id)
  limit 1;

  if not found then
    raise exception 'Failed to apply rating for match participant';
  end if;

  return query select v_existing.rating_after, v_existing.delta, true;
end;
$$;

create or replace function public.finish_stage_battle_game_session(
  p_game_id uuid,
  p_player_id uuid,
  p_result text,
  p_final_snapshot_hash text default null,
  p_finish_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, master, game
as $$
declare
  v_game game.games%rowtype;
  v_stage_no integer;
  v_first_clear boolean := false;
  v_clear_count integer := 0;
  v_pawn integer := 0;
  v_gold integer := 0;
  v_wallet_pawn integer := 0;
  v_wallet_gold integer := 0;
  v_granted_pieces jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_game_result text;
  v_winner_side text;
begin
  if p_result not in ('cleared', 'failed') then
    raise exception 'INVALID_RESULT'
      using errcode = 'P0001';
  end if;

  select *
  into v_game
  from game.games
  where game_id = p_game_id
    and player_id = p_player_id
    and stage_id is not null
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if v_game.status = 'finished' then
    return coalesce(
      v_game.finish_summary,
      jsonb_build_object(
        'battleSessionId', v_game.game_id,
        'status', v_game.status,
        'result', case when v_game.result = 'player_win' then 'cleared' else 'failed' end
      )
    );
  end if;

  if v_game.status <> 'in_progress'
    or v_game.status = 'aborted'
    or v_game.expires_at is null
    or v_game.expires_at <= now()
  then
    update game.games
    set
      status = 'aborted',
      result = 'abort',
      winner_side = null,
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
    where game_id = v_game.game_id;

    raise exception 'SESSION_EXPIRED'
      using errcode = 'P0001';
  end if;

  select s.stage_no
  into v_stage_no
  from master.m_stage s
  where s.stage_id = v_game.stage_id
    and s.is_active = true
    and (s.published_at is null or s.published_at <= now())
    and (s.unpublished_at is null or s.unpublished_at > now());

  if not found then
    raise exception 'SESSION_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if p_result = 'cleared' then
    update public.player_stage_clears
    set
      clear_count = public.player_stage_clears.clear_count + 1,
      cleared_at = now(),
      updated_at = now()
    where player_id = p_player_id
      and stage_id = v_game.stage_id
    returning clear_count into v_clear_count;

    if not found then
      insert into public.player_stage_clears (
        player_id,
        stage_id,
        clear_count,
        cleared_at,
        updated_at
      )
      values (
        p_player_id,
        v_game.stage_id,
        1,
        now(),
        now()
      );
      v_first_clear := true;
      v_clear_count := 1;
    end if;

    if v_first_clear then
      v_pawn := 20;
      v_gold := 1;
    else
      v_pawn := (v_stage_no / 5) + 2;
      v_gold := 0;
    end if;

    update public.players
    set
      pawn_currency = public.players.pawn_currency + v_pawn,
      gold_currency = public.players.gold_currency + v_gold,
      updated_at = now()
    where id = p_player_id
    returning pawn_currency, gold_currency into v_wallet_pawn, v_wallet_gold;

    if not found then
      raise exception 'SESSION_NOT_FOUND'
        using errcode = 'P0001';
    end if;

    with piece_rewards as (
      select
        r.piece_id,
        sum(sr.quantity)::integer as qty
      from master.m_stage_reward sr
      join master.m_reward r
        on r.reward_id = sr.reward_id
      where sr.stage_id = v_game.stage_id
        and sr.is_active = true
        and r.is_active = true
        and r.reward_type = 'piece'
        and r.piece_id is not null
        and (
          sr.reward_timing = 'clear'
          or (v_first_clear and sr.reward_timing = 'first_clear')
        )
        and (r.published_at is null or r.published_at <= now())
        and (r.unpublished_at is null or r.unpublished_at > now())
      group by r.piece_id
    )
    insert into public.player_owned_pieces (
      player_id,
      piece_id,
      source,
      quantity,
      acquired_at
    )
    select
      p_player_id,
      pr.piece_id,
      'stage_clear',
      pr.qty,
      now()
    from piece_rewards pr
    on conflict (player_id, piece_id) do update
    set
      quantity = public.player_owned_pieces.quantity + excluded.quantity,
      source = 'stage_clear';

    with piece_rewards as (
      select
        r.piece_id,
        sum(sr.quantity)::integer as qty
      from master.m_stage_reward sr
      join master.m_reward r
        on r.reward_id = sr.reward_id
      where sr.stage_id = v_game.stage_id
        and sr.is_active = true
        and r.is_active = true
        and r.reward_type = 'piece'
        and r.piece_id is not null
        and (
          sr.reward_timing = 'clear'
          or (v_first_clear and sr.reward_timing = 'first_clear')
        )
        and (r.published_at is null or r.published_at <= now())
        and (r.unpublished_at is null or r.unpublished_at > now())
      group by r.piece_id
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pieceId', p.piece_id,
          'char', p.kanji,
          'name', p.name,
          'quantity', pr.qty
        )
        order by p.piece_id
      ),
      '[]'::jsonb
    )
    into v_granted_pieces
    from piece_rewards pr
    join master.m_piece p
      on p.piece_id = pr.piece_id;
  else
    select pawn_currency, gold_currency
    into v_wallet_pawn, v_wallet_gold
    from public.players
    where id = p_player_id;
  end if;

  v_game_result := case when p_result = 'cleared' then 'player_win' else 'enemy_win' end;
  v_winner_side := case when p_result = 'cleared' then 'player' else 'enemy' end;

  v_summary := jsonb_build_object(
    'battleSessionId', v_game.game_id,
    'status', 'finished',
    'result', p_result,
    'stageNo', v_stage_no,
    'clearApplied', (p_result = 'cleared'),
    'firstClear', v_first_clear,
    'clearCount', case when p_result = 'cleared' then to_jsonb(v_clear_count) else 'null'::jsonb end,
    'granted', jsonb_build_object(
      'pawn', v_pawn,
      'gold', v_gold,
      'pieces', v_granted_pieces
    ),
    'wallet', jsonb_build_object(
      'pawnCurrency', coalesce(v_wallet_pawn, 0),
      'goldCurrency', coalesce(v_wallet_gold, 0)
    )
  );

  update game.games
  set
    status = 'finished',
    result = v_game_result,
    winner_side = v_winner_side,
    finish_payload = coalesce(p_finish_payload, '{}'::jsonb),
    finish_summary = v_summary,
    final_snapshot_hash = p_final_snapshot_hash,
    reward_granted_at = case when p_result = 'cleared' then now() else null end,
    ended_at = now(),
    updated_at = now()
  where game_id = v_game.game_id;

  return v_summary;
end;
$$;

revoke execute on function public.apply_pvp_rating_for_match(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.apply_pvp_rating_for_user(uuid, text, boolean, int) from public, anon, authenticated;
revoke execute on function public.finish_stage_battle_game_session(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
