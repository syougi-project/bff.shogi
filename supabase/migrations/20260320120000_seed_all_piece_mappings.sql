-- Normalize master.m_piece_mapping into a single source of truth.
-- display_char uses one ASCII-code policy everywhere.
-- sfen_code becomes an extended-SFEN token (P, +P, C, ZAA, ...).

begin;

alter table master.m_piece_mapping
  drop constraint if exists m_piece_mapping_sfen_promoted_uq;

-- The original inline column check was auto-named with the `_check` suffix.
alter table master.m_piece_mapping
  drop constraint if exists m_piece_mapping_sfen_code_check;

alter table master.m_piece_mapping
  drop constraint if exists m_piece_mapping_sfen_code_chk;

alter table master.m_piece_mapping
  alter column sfen_code type text using sfen_code::text;

alter table master.m_piece_mapping
  add constraint m_piece_mapping_sfen_code_chk
  check (sfen_code is null or sfen_code ~ '^[A-Za-z+]{1,3}$');

create unique index if not exists m_piece_mapping_piece_id_uq
  on master.m_piece_mapping (piece_id);

create unique index if not exists m_piece_mapping_sfen_code_uq
  on master.m_piece_mapping ((upper(sfen_code)))
  where sfen_code is not null;

create temp table tmp_normalized_piece_mapping (
  piece_id bigint primary key,
  sfen_code text not null,
  display_char text not null,
  canonical_piece_code text not null,
  is_special boolean not null,
  is_promoted boolean not null
) on commit drop;

insert into tmp_normalized_piece_mapping (
  piece_id,
  sfen_code,
  display_char,
  canonical_piece_code,
  is_special,
  is_promoted
)
with piece_inventory as (
  select
    p.piece_id,
    p.piece_code,
    p.kanji,
    exists (
      select 1
      from master.m_piece_promotion pp
      where pp.promoted_piece_id = p.piece_id
        and pp.is_active = true
    ) as is_promoted
  from master.m_piece p
  where p.is_active = true
),
explicit_mapping_defs as (
  select *
  from (
    values
      ('歩',   'FU',  'P',  'pawn',         false),
      ('香',   'KY',  'L',  'lance',        false),
      ('桂',   'KE',  'N',  'knight',       false),
      ('銀',   'GI',  'S',  'silver',       false),
      ('金',   'KI',  'G',  'gold',         false),
      ('角',   'KA',  'B',  'bishop',       false),
      ('飛',   'HI',  'R',  'rook',         false),
      ('玉',   'OU',  'K',  'king',         false),
      ('と',   'TO',  '+P', 'prom_pawn',    false),
      ('成香', 'NY',  '+L', 'prom_lance',   false),
      ('成桂', 'NK',  '+N', 'prom_knight',  false),
      ('成銀', 'NG',  '+S', 'prom_silver',  false),
      ('馬',   'UM',  '+B', 'prom_bishop',  false),
      ('龍',   'RY',  '+R', 'prom_rook',    false),
      ('忍',   'NIN', 'C',  'ninja',        true),
      ('影',   'KAG', 'D',  'shadow',       true),
      ('砲',   'HOU', 'E',  'cannon',       true),
      ('竜',   'RYU', 'F',  'dragon',       true),
      ('鳳',   'HOO', 'H',  'phoenix',      true),
      ('炎',   'ENN', 'I',  'flame',        true),
      ('火',   'FIR', 'J',  'fire',         true),
      ('水',   'SUI', 'M',  'water',        true),
      ('波',   'NAM', 'Q',  'wave',         true),
      ('木',   'MOK', 'T',  'tree',         true),
      ('葉',   'HAA', 'U',  'leaf',         true),
      ('光',   'HIK', 'V',  'light',        true),
      ('星',   'HOS', 'W',  'star',         true),
      ('闇',   'YAM', 'X',  'dark',         true),
      ('魔',   'MAK', 'Y',  'demon',        true)
  ) as v(kanji, display_char, sfen_code, canonical_piece_code, is_special)
),
explicit_rows as (
  select
    p.piece_id,
    d.sfen_code,
    d.display_char,
    d.canonical_piece_code,
    d.is_special,
    p.is_promoted
  from piece_inventory p
  join explicit_mapping_defs d
    on d.kanji = p.kanji
),
auto_target_rows as (
  select
    p.piece_id,
    p.piece_code,
    p.is_promoted,
    row_number() over (order by p.piece_id) as auto_no
  from piece_inventory p
  left join explicit_rows e
    on e.piece_id = p.piece_id
  where e.piece_id is null
),
display_candidates as (
  select
    candidate.display_char,
    row_number() over (order by candidate.display_char) as candidate_no
  from (
    select 'PC' || lpad(gs::text, 3, '0') as display_char
    from generate_series(1, 999) gs
  ) candidate
  where not exists (
    select 1
    from explicit_rows e
    where e.display_char = candidate.display_char
  )
),
sfen_candidates as (
  select
    candidate.sfen_code,
    row_number() over (order by candidate.sfen_code) as candidate_no
  from (
    select
      'Z' || chr(65 + first_idx) || chr(65 + second_idx) as sfen_code
    from generate_series(0, 25) first_idx
    cross join generate_series(0, 25) second_idx
  ) candidate
  where not exists (
    select 1
    from explicit_rows e
    where upper(e.sfen_code) = upper(candidate.sfen_code)
  )
)
select
  e.piece_id,
  e.sfen_code,
  e.display_char,
  e.canonical_piece_code,
  e.is_special,
  e.is_promoted
from explicit_rows e

union all

select
  a.piece_id,
  s.sfen_code,
  d.display_char,
  a.piece_code as canonical_piece_code,
  true as is_special,
  a.is_promoted
from auto_target_rows a
join display_candidates d
  on d.candidate_no = a.auto_no
join sfen_candidates s
  on s.candidate_no = a.auto_no;

do $$
declare
  expected_count integer;
  mapping_count integer;
  display_count integer;
  sfen_count integer;
begin
  select count(*) into expected_count
  from master.m_piece
  where is_active = true;

  select count(*) into mapping_count
  from tmp_normalized_piece_mapping;

  select count(distinct display_char) into display_count
  from tmp_normalized_piece_mapping;

  select count(distinct upper(sfen_code)) into sfen_count
  from tmp_normalized_piece_mapping;

  if mapping_count <> expected_count then
    raise exception 'piece mapping row count mismatch: expected %, actual %', expected_count, mapping_count;
  end if;

  if display_count <> mapping_count then
    raise exception 'display_char collision detected in tmp_normalized_piece_mapping';
  end if;

  if sfen_count <> mapping_count then
    raise exception 'sfen_code collision detected in tmp_normalized_piece_mapping';
  end if;
end $$;

delete from master.m_piece_mapping
where piece_id in (
  select piece_id
  from master.m_piece
  where is_active = true
);

insert into master.m_piece_mapping (
  piece_id,
  sfen_code,
  display_char,
  canonical_piece_code,
  is_special,
  is_promoted,
  is_active,
  created_at,
  updated_at
)
select
  piece_id,
  sfen_code,
  display_char,
  canonical_piece_code,
  is_special,
  is_promoted,
  true,
  now(),
  now()
from tmp_normalized_piece_mapping
order by piece_id;

commit;
