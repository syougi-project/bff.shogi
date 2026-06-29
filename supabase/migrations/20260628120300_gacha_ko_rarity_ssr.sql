-- 漢検1級ガチャ「膠」のレアリティ表記を UR から SSR に統一

begin;

update master.m_piece
set
  rarity = 'SSR',
  updated_at = now()
where kanji = '膠'
  and coalesce(rarity, '') <> 'SSR';

commit;
