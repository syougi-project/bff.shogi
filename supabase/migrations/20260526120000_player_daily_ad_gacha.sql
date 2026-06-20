-- 日替わり広告無償ガチャの利用記録（JST 0:00 で date_key が切り替わる）
create table if not exists public.player_daily_ad_gacha (
  player_id uuid not null references public.players(id) on delete cascade,
  date_key text not null,
  used_at timestamptz not null default now(),
  primary key (player_id, date_key)
);

create index if not exists idx_player_daily_ad_gacha_date_key
  on public.player_daily_ad_gacha (date_key);

alter table public.player_daily_ad_gacha enable row level security;

-- BFF (service role) のみ書き込み。クライアントからの直接参照は不要。
create policy "player_daily_ad_gacha: self read"
  on public.player_daily_ad_gacha for select
  using (auth.uid() = player_id);
