-- 虹スキル: 移動時に周囲8マスの敵駒を4ターン縦横1マスに制限する。

begin;

update master.m_skill s
set
  skill_desc = '移動時、周囲8マスにいる敵駒の行動範囲を4ターン縦横1マスに制限する。',
  updated_at = now()
where s.skill_code = 'skill_fe412b11a3a5';

commit;
