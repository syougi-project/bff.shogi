-- 刀・銃: m_piece.skill_id が NULL のままだと BFF が skill_definitions_v2 を付与しない。
-- 20260319210000 等の left join で skill 未登録だったケースや、部分適用 DB を修復する。
-- あわせて m_skill_effect / m_skill_condition が無いと定義が空になりやすいため、V2 行を保証する。

begin;

-- 1) 駒マスタとスキルマスタの紐付け（kanji + skill_code で決定）
update master.m_piece p
set
  skill_id = s.skill_id,
  updated_at = now()
from master.m_skill s
where s.skill_code = 'skill_dc1e194f434b'
  and p.kanji = '刀'
  and (p.skill_id is null or p.skill_id is distinct from s.skill_id);

update master.m_piece p
set
  skill_id = s.skill_id,
  updated_at = now()
from master.m_skill s
where s.skill_code = 'skill_a517ef7b8361'
  and p.kanji = '銃'
  and (p.skill_id is null or p.skill_id is distinct from s.skill_id);

-- 2) 刀: V2 条件（参照用。実処理は app エンジン intrinsic）
--    既に別条件が order=1 を占有している DB でも衝突しないよう、次の空き order に入れる。
insert into master.m_skill_condition (
  skill_id,
  condition_order,
  condition_group,
  condition_type,
  params_json,
  is_active
)
select
  s.skill_id,
  (select coalesce(max(c.condition_order), 0) + 1 from master.m_skill_condition c where c.skill_id = s.skill_id),
  'board_state',
  'adjacent_enemy_exists',
  '{}'::jsonb,
  true
from master.m_skill s
where s.skill_code = 'skill_dc1e194f434b'
  and not exists (
    select 1
    from master.m_skill_condition c
    where c.skill_id = s.skill_id
      and c.condition_type = 'adjacent_enemy_exists'
      and c.is_active = true
  );

insert into master.m_skill_effect (
  skill_id,
  effect_order,
  effect_group,
  effect_type,
  target_group,
  target_selector,
  params_json,
  is_active
)
select
  s.skill_id,
  (select coalesce(max(e.effect_order), 0) + 1 from master.m_skill_effect e where e.skill_id = s.skill_id),
  'capture_rule',
  'multi_capture',
  'adjacent',
  'adjacent_enemy',
  '{"captureMode":"adjacent_after_capture"}'::jsonb,
  true
from master.m_skill s
where s.skill_code = 'skill_dc1e194f434b'
  and not exists (
    select 1
    from master.m_skill_effect e
    where e.skill_id = s.skill_id
      and e.is_active = true
      and e.effect_group is not null
      and e.target_group is not null
      and e.target_selector is not null
  );

-- 3) 銃: 連続ルール（表示・registry 用。貫通の実処理は app エンジン）
insert into master.m_skill_effect (
  skill_id,
  effect_order,
  effect_group,
  effect_type,
  target_group,
  target_selector,
  params_json,
  is_active
)
select
  s.skill_id,
  (select coalesce(max(e.effect_order), 0) + 1 from master.m_skill_effect e where e.skill_id = s.skill_id),
  'capture_rule',
  'multi_capture',
  'line',
  'front_enemy',
  '{"captureMode":"forward_chain"}'::jsonb,
  true
from master.m_skill s
where s.skill_code = 'skill_a517ef7b8361'
  and not exists (
    select 1
    from master.m_skill_effect e
    where e.skill_id = s.skill_id
      and e.is_active = true
      and e.effect_group is not null
      and e.target_group is not null
      and e.target_selector is not null
  );

-- 4) メタが欠けている環境向けに V2 判定トリガを再保証（既存値は尊重）
update master.m_skill s
set
  implementation_kind = coalesce(nullif(trim(s.implementation_kind), ''), 'primitive'),
  trigger_group = coalesce(nullif(trim(s.trigger_group), ''), 'event_capture'),
  trigger_type = coalesce(nullif(trim(s.trigger_type), ''), 'after_capture'),
  parse_status = coalesce(s.parse_status, 'rule_only_v2'::master.skill_parse_status_enum),
  updated_at = now()
where s.skill_code = 'skill_dc1e194f434b'
  and (
    s.implementation_kind is null
    or trim(s.implementation_kind) = ''
    or s.trigger_group is null
    or trim(s.trigger_group) = ''
    or s.trigger_type is null
    or trim(s.trigger_type) = ''
  );

update master.m_skill s
set
  implementation_kind = coalesce(nullif(trim(s.implementation_kind), ''), 'primitive'),
  trigger_group = coalesce(nullif(trim(s.trigger_group), ''), 'continuous'),
  trigger_type = coalesce(nullif(trim(s.trigger_type), ''), 'continuous_rule'),
  parse_status = coalesce(s.parse_status, 'rule_only_v2'::master.skill_parse_status_enum),
  updated_at = now()
where s.skill_code = 'skill_a517ef7b8361'
  and (
    s.implementation_kind is null
    or trim(s.implementation_kind) = ''
    or s.trigger_group is null
    or trim(s.trigger_group) = ''
    or s.trigger_type is null
    or trim(s.trigger_type) = ''
  );

commit;
