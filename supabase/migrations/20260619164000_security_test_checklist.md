# 2026-06 セキュリティ強化: テスト追加・更新チェックリスト

- anon/authenticated から RPC が呼べないことを SQL/integration test で確認
- `/api/v1/me/pvp-rating/apply` が無効化されていること
- `/api/v1/stages/[stageNo]/clear` が無効化されていること
- 所持駒・クリア履歴・通貨・レートが direct Supabase client から更新できないこと
- 正規フロー（internal match result, stage-battles finish）では引き続き更新できること
