-- 影(shadow) の誤った前方1マスベクトル (0,-1) を削除する。
-- seed_master_piece.sql のプレースホルダーと reseed マイグレーションの重複により、
-- 斜め2+左右1 に加えて前方1マスが混入していた。

delete from master.m_move_pattern_vector v
using master.m_move_pattern p
where v.move_pattern_id = p.move_pattern_id
  and p.move_code = 'shadow'
  and v.dx = 0
  and v.dy = -1
  and v.max_step = 1;
