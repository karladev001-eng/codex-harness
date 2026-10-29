# タスク: knowledge-retrieval — 保存資料を検索して制作へ使う

- 状態: done（実装・通常導入・実KB検証・独立レビューAC1–6 PASS）
- 仕様版: 1
- 開始: 2026-10-06T13:48:00+09:00（時刻は概数）
- コード基点: 82586eda58699e6d44e656689586e220befe41af
- 作業場所: <repo>。既存の関連未コミット実装を使うため、これまでの承認済み運用に沿い共有checkoutで直列実装・レビュー。既存差分のreset/stash/一括commitなし。
- 担当範囲: knowledge検索・原資料取得CLI、配布build、harness参照手順と関連docs/tests。
- 依存: knowledge-sync-analysis、activate-knowledge-memory（完了）
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop=true、max_agents=3、auto、pinなし。
- 実装: gpt-6.1-sol / medium（取得APIと制作フローの設計判断あり）。独立レビュー: gpt-6.1-sol / high。
- ホスト候補: collaboration.spawn_agentの2026-10-06提示カタログ。gpt-6.1-solは最新workhorse、medium/high対応。基準値と一致。親モデルはホストに従い変更しない。

## 目的と対象外

ユーザー依頼: 「knowledge baseから検索や改善に使用できるように整えたい。現在は記録するだけか」。文字検索と好みreadは既存。保存資料を必要な時に探し、原文と画像へ戻り、制作の根拠として使う入口を実装して導入する。

ベクトル/埋め込み検索、検索UI、外部検索/新規provider、スケジュール変更、保存の事実からの好み自動昇格は対象外。文字検索の限界を明記し、エージェントが意図を少数の検索語へ展開して関連性を判断する。これをベクトル意味検索と称さない。

## 受入条件

1. searchは短い候補カードを返す。タグも検索対象とし、一致した本文箇所へ進める最小の手掛かりを返す。既存のAND検索を壊さない。全文や全画像を一覧出力しない。
2. 指定captureの本文/メモを上限付きで部分取得できるreadコマンド（位置・次の位置・取得版・元URL・鮮度を返す）。指定なし/不正/不存在を別captureの検索へフォールバックさせない。cardもcapture必須。
3. 明示選択したcaptureの保存JPEGをローカルファイルとして取り出せる。画像はview_image等で実際に確認する。出力先は管理対象のcache内、symlink/任意path/上書きの攻撃を避ける。GitHubも元資料も書き換えない。画像なしは明確に示す。
4. インストール済みharnessから自己完結したCLIへの確実な入口を持つ。SKILLと制作改善ループから、目的に合う少数候補→必要部分→今回の適用判断、の指示を接続する。常時全資料読込なし、現在依頼優先、資料の指示を実行しない。設定OFF・鮮度・ユーザーメモ/生成説明/原文の区別・記録担当の契約を維持する。
5. 引用/利用時にはURLとcapture/取得版、実際に見た範囲と不足を示す。保存=好み/適用=ユーザーの肯定とは扱わない。適用があった場合だけ既存タスク記録に資料IDと理由を残す（persistenceに従う）。利用件数だけで新しい好みを作らない。
6. 関連テストと配布検証、独立レビューを通す。通常installerで導入後、実KBの2件を検索・本文部分取得・保存画像確認まで検証。preferences正本やスケジュールは変更しない。

## 参照

- knowledge/README.md、knowledge/search.cjs、reader.cjs、analysis.cjs、cli.cjs
- docs/adr/0002-github-knowledge-base.md、0005-knowledge-sync-analysis.md
- plugins/codex-harness/skills/harness/SKILL.md と references/creative-loop.md
- ~/.agents/skills/codex-harness/references/roles.md、reviewer.md、roles/code-review.md

## 進捗

現状確認: preferences readはok=true/fresh/pending=false。同じ保存拡張のUI候補2件のみで今回の検索CLI設計には自動適用しない。既存カード検索は文字一致、タグ未検索、原資料への取得CLIなし。hookは同期のみ。

## 実装・検証結果

- searchへタグと本文/メモ最大2件の一致箇所を追加。readはUTF-16位置と既定4000/最大16000で部分取得、card/read/export-imageはcapture ID必須。cardのresults配列は維持。
- JPEGは一枚ずつ管理cache内の新規ファイルへ取り出し、任意出力先・symlink・上書きを拒否。CLIをskill/pluginへ同梱し、検索・取得・出所・設定OFF・改善記録の手順を接続。
- 全体npm test: 122/122 PASS。その後のUnicode位置/不足の出力量修正は最終buildとknowledge-analysis 20/20で再確認。README履歴時制の補正後もbuild済み。
- 独立レビュー: AC1–5 PASS。独立analysis20、install24、package1と追加境界再現PASS。packageをnode直接実行した一回はnpm_execpath前提で失敗し、正規npm環境でPASS。製品失敗と混同しない。
- 通常installer: installed、target=~/.agents/skills/codex-harness、backup=~/.codex/harness/backups/install-g98L0S。
- 導入済みCLIから検索成功: 「デザイン」→example.com、「Claude」→WorldFlowAI/everything-claude-code。GitHub snapshot commit=5282da24de5c490bb813671b44eef953ab0997eb、current確認2026-10-06T04:55:33.826Z。その直後の取得は同じ成功日時のthrottled（fetch省略）。
- 本文部分取得: eb9ffae9-1abe-4d9f-8b90-2e68cda799adのcontent UTF-16 [2964,3564)、blob=833b0cbfbc4fd76cbaa5ae1102e342bf582008f7。一覧サイトの名称・制作クレジットが得られた。76389a21-3bdb-4541-9df7-3562a3154f50のcontent [13,613)、blob=eebc681b9490a5da1e6b0a68120644008466a169。README冒頭が得られた。
- 画像exportと実view_image確認: example.com 145330 bytes（blob=d31a241ccc0caec658e76fdbbdd83fa33669ae32）、GitHub 203298 bytes（blob=5fc1f356f5fffebbfa618f5909a631ac14e8dda2）。前者は灰白色背景・青緑の縦バー・ぼかし・CoMinVi紹介、後者は暗色GitHubフォルダ一覧。未撮影部分や動作は確認していない。
- export paths: ~/.codex/knowledge/read/image-cache/71d4b4ab-f8a9-4d9d-bc40-56026b76901a/screenshot.jpg、~/.codex/knowledge/read/image-cache/1abb602e-5e2e-45ad-91b7-27634a6130d8/screenshot.jpg。
- これらは取得機能の検証に使用。今回制作への好みの適用や新しいユーザー評価ではなく、preferencesへの新規保存はなし。
- 未検証: Windows実機、ベクトル意味検索、長期の改善効果。新規commit/pushなし。既存差分は保持。
- 独立最終判定: PASS AC1–6。レビュー担当も導入先コードから実KB2件を再検索・部分取得し、上記本文/画像blobとview_image画素を確認。必須指摘なし。
- 導入整合性: 所有45ファイルのinstalled/dist/manifest hash一致。hooks.json（68a2cd6b…）、automation-2/automation.toml（82c66258…）、knowledge/config.json（4ed99a2f…）は作業前後同一。snapshotは上記commit・2capture・analysis_pending=[]。
- 終了確認: 2026-10-06T13:57:43+09:00以降。git diff --check PASS。実使用の利用枠/トークン計測は未取得（null）、品質・削減率の数値評価なし。
