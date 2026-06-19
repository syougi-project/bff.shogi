-- ステージ39: 青鬼・黒鬼の m_piece / m_skill を登録し、初期配置の piece_id を揃える。

begin;

insert into master.m_skill (skill_code, skill_name, skill_desc, is_active, created_at, updated_at)
values
  (
    'skill_708f4c98616b',
    '青鬼',
    '移動時に周囲の敵駒を凍結させ、3ターン行動範囲を前後1マスに制限する。',
    true,
    now(),
    now()
  ),
  (
    'skill_3a95dc5e937f',
    '黒鬼',
    '移動時に移動元のマスを闇マスにし、侵入した敵駒を30％の確率で消滅させる。',
    true,
    now(),
    now()
  )
on conflict (skill_code) do update
set
  skill_name = excluded.skill_name,
  skill_desc = excluded.skill_desc,
  is_active = true,
  updated_at = now();

insert into master.m_piece (
  piece_code,
  kanji,
  name,
  move_pattern_id,
  skill_id,
  is_active,
  created_at,
  updated_at
)
select
  v.piece_code,
  v.kanji,
  v.name,
  mp.move_pattern_id,
  sk.skill_id,
  true,
  now(),
  now()
from (
  values
    ('blueOni', '青鬼', '青鬼', 'blueOni', 'skill_708f4c98616b'),
    ('blackOni', '黒鬼', '黒鬼', 'blackOni', 'skill_3a95dc5e937f')
) as v(piece_code, kanji, name, move_code, skill_code)
join master.m_move_pattern mp on mp.move_code = v.move_code
join master.m_skill sk on sk.skill_code = v.skill_code
on conflict (piece_code) do update
set
  kanji = excluded.kanji,
  name = excluded.name,
  move_pattern_id = excluded.move_pattern_id,
  skill_id = excluded.skill_id,
  is_active = true,
  updated_at = now();

update master.m_piece
set
  kanji = '赤鬼',
  name = '赤鬼',
  updated_at = now()
where piece_code = 'piece_533b7fec5456';

-- 既存の stage39 配置を左右=青/黒、中央=赤に再割当（20260508172500 と同ロジック）
with stage39 as (
  select stage_id
  from master.m_stage
  where stage_no = 39
  limit 1
),
targets as (
  select
    p.stage_id,
    p.side,
    p.row_no,
    p.col_no,
    row_number() over (order by p.col_no asc, p.row_no asc) as left_rank,
    row_number() over (order by p.col_no desc, p.row_no desc) as right_rank
  from master.m_stage_initial_placement p
  join stage39 s on s.stage_id = p.stage_id
  join master.m_piece piece on piece.piece_id = p.piece_id
  where p.side = 'enemy'
    and piece.kanji in ('鬼', '赤鬼', '青鬼', '黒鬼')
),
piece_ids as (
  select
    max(case when piece_code in ('redOni', 'piece_533b7fec5456') then piece_id end) as red_piece_id,
    max(case when piece_code = 'blueOni' then piece_id end) as blue_piece_id,
    max(case when piece_code = 'blackOni' then piece_id end) as black_piece_id
  from master.m_piece
  where piece_code in ('redOni', 'blueOni', 'blackOni', 'piece_533b7fec5456')
)
update master.m_stage_initial_placement p
set piece_id = case
  when t.left_rank = 1 and t.right_rank = 1 then coalesce(ids.red_piece_id, p.piece_id)
  when t.left_rank = 1 then coalesce(ids.blue_piece_id, p.piece_id)
  when t.right_rank = 1 then coalesce(ids.black_piece_id, p.piece_id)
  else coalesce(ids.red_piece_id, p.piece_id)
end
from targets t
cross join piece_ids ids
where p.stage_id = t.stage_id
  and p.side = t.side
  and p.row_no = t.row_no
  and p.col_no = t.col_no;

commit;
