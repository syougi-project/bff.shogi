# Backend (Next.js BFF)

TypeScript + Next.js Route Handler で構築する BFF（Backend For Frontend）です。

## Stack
- Next.js (App Router)
- TypeScript
- Supabase JS (service role)

## Setup
```bash
npm install
npm run dev
```

開発サーバー: `http://localhost:3000`

## Environment Variables
`.env`（または `.env.local`）に以下を設定してください。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_ENGINE_BASE_URL`（例: `http://127.0.0.1:8080`）

`app.shogi` の `.env` にある `SUPABASE_URL` / `SUPABASE_ANON_KEY` はクライアント認証用です。**マイグレーション適用には使いません**（CLI は Supabase アカウントで認証します）。

## Supabase マイグレーション（リモート DB 更新）

### 【2026/06 セキュリティ強化対応 TODO】

このリポジトリの Supabase/BFF セキュリティ強化のため、以下の対応を順次実施します。

#### 1. SECURITY DEFINER RPC の EXECUTE 権限制限
- 指定関数（apply_pvp_rating_for_match, apply_pvp_rating_for_user, finish_stage_battle_game_session, finish_stage_battle_session）は public/anon/authenticated からの EXECUTE を revoke し、service role のみ許可します。
- 今後追加する SECURITY DEFINER 関数も同様に EXECUTE 権限を閉じること。

#### 2. クライアント向け PvP レート適用 API の無効化
- `/api/v1/me/pvp-rating/apply` は廃止または 404/410 を返すようにします。
- レート更新は内部APIまたは信頼できる対戦サーバ由来の確定結果のみ許可します。
- applyPvpRatingForUser の fallback も本番では削除または test-only に限定します。

#### 3. ステージクリア旧 API の無効化
- `/api/v1/stages/[stageNo]/clear` は廃止または 404/410 を返すようにします。
- 報酬付与は `/api/v1/stage-battles/finish` のみ許可します。
- 旧 grantStageClearRewards(userId, stageNo) は公開ハンドラから呼ばないようにします。

#### 4. public schema の RLS 書き込み権限最小化
- players: authenticated の UPDATE は表示名のみ許可、rating/pawn_currency/gold_currency は直接更新不可に。
- player_owned_pieces: INSERT/DELETE policy を削除。
- player_stage_clears: INSERT/UPDATE policy を削除。
- player_decks/player_deck_placements: 配置piece_idが本人所有であることをwith checkで保証、またはBFF専用にwrite policy削除。

#### 5. RPC 側の検証強化
- apply_pvp_rating_for_match: match_id, winner等のDB整合性検証を追加。
- apply_pvp_rating_for_user: 記録済みmatch参加者以外は更新不可、未記録match+opponentRating自己申告は本番禁止。
- finish_stage_battle_game_session: p_result='cleared'だけでなく、サーバ保存セッション状態・所有者・未付与状態を検証。

#### 6. Supabase exposed schema/Storage の確認
- Exposed schemasがpublic, graphql_publicのみであること、画像以外のbucketはprivateであることを確認。

#### 7. テスト追加・更新
- 不正経路からの更新不可テスト、正規フローのテスト維持。

---

このTODOを完了後、不要なpublic/client routeが閉じられ、BFF正規フローの既存テストが通り、不正更新ケースを防ぐテストが追加されていることを確認します。

---

スキーマ・マスタデータの変更は `supabase/migrations/*.sql` に追加し、リモートへ反映します。

### 初回セットアップ（1 回だけ）

1. [Supabase CLI](https://supabase.com/docs/guides/cli) を使う（グローバル未インストールでも `npm run` 経由で `npx` 実行可）
2. ログイン（ブラウザが開きます）

```bash
cd bff.shogi
npx supabase@latest login
```

3. プロジェクトとリンク（DB パスワードを聞かれたら Dashboard → Project Settings → Database で確認）

```bash
npm run db:link
```

### 未適用 migration をリモートに反映

```bash
cd bff.shogi
npm run db:push
```

適用済みか確認:

```bash
npm run db:status
```

### 新しい migration を作る

```bash
cd bff.shogi
npm run db:migration:new -- add_my_feature
# → supabase/migrations/<timestamp>_add_my_feature.sql ができる
# SQL を書いたあと
npm run db:push
```

### 注意

- ファイル名のタイムスタンプは **重複しない** ようにする（同じ `20260519120000_...` が複数あると順序が分かりにくい）
- 本番反映前に SQL の内容を必ず確認する
- `SUPABASE_SERVICE_ROLE_KEY` は Dashboard → Project Settings → API の `service_role`（**anon とは別**）。BFF の `.env` に設定する

## 駒図鑑 → Supabase 同期（`shogi_game/piece_info.html`）

参照元: `../shogi_game/piece_info.html` の `ALL_PIECES_DATA` と `gachaPieceInfo`。

```bash
cd bff.shogi
# 1) マスタ SQL 生成 + migration 生成
npm run db:sync:piece-catalog

# 2) リモート DB（未適用 migration があれば）
npm run db:push

# または REST で直接 upsert
npm run seed:pieces:catalog:apply

# 3) 駒画像を Storage にアップロード（image_key: pieces/piece-{piece_id}.png）
npm run seed:pieces:catalog:images:apply
```

- ショップ駒の `move` は DB の `shop_*` / ガチャ駒は `move_gacha_*` にエイリアス済み
- Storage キーは ASCII のみのため日本語ファイル名は `pieces/piece-{id}.png` にマッピング
