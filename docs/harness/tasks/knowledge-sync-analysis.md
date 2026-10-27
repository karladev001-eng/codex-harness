# エージェントhook同期と検索説明生成

- 日付: 2026-10-05 JST
- 状態: 実装・独立review・同期/hook登録・承認後の実資料生成/共有・毎時設定完了。hookの信頼確認/自動発火は未確認。
- 仕様版: 1
- 基点: HEAD 82586eda58699e6d44e656689586e220befe41af + 既存未commit成果、今回baseline `/tmp/harness-sync-analysis-baseline`。
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop true、max_agents3、auto/pinなし。collaboration起動候補でSol6.1/highを実装・独立reviewに採用（Git/非同期/権限/生成データの設計判断）。履歴なし、親モデルは変更しない。関連未commit成果を守り同checkout直列、commit/reset/stashなし。

## 依頼と範囲

ユーザーは検索説明カードと差分生成を承認し、今回エージェントhookによる同期と説明生成の実装を依頼。Git hookやOS定期fetchではない。GitHub正本は karladev001-eng/harness-knowledge-base。既存保存/ChromeUIを変えず、共通CLIに読み取り同期・索引・説明生成/共有を追加する。ベクトル埋め込みモデル選定とランキング品質検証は後続であり、説明生成を意味検索完成とは扱わない。

## 受入条件

1. エージェント判断なしで呼べる同期CLI。専用の参照用Git領域でfetchし、repo/branch/library/schemaを確認。commitの差分で追加変更削除を反映、検索用catalog/解析待ちを更新。元の作業checkoutや未送信operationsを変更しない。オフライン/途中失敗では前の有効snapshotを維持。並行hook排他、頻度制限、timeout、終了/中断後の復旧を備える。秘密/本文ログなし。参照データからhook/script/submoduleを実行しない。
2. SessionStart(startup/resume)とUserPromptSubmitのcommand hook登録/解除/検査。既存hooks.jsonのORCA等を保持、複製登録しない、競合/破損は壊さず停止。Node/CLI/state絶対パスを安全に引用、mac/Windows対応。async=true、短いtimeout。頻度制限既定300秒、子の重複もPC/library lockで抑止。通常stdout空、会話に全文注入なし。Codexのtrusted_hashを生成/改変せず、信頼確認が必要ならユーザーへ正確に伝える。PreToolUseはまだ専用検索toolが無いため架空matcherを登録せず、検索CLI自身に鮮度確認を持たせる。
3. 保存済みcapture単位で短い説明、役立つ場面、主な内容/語句、画像から確認できる見た目、取得不足/根拠を生成。ユーザーメモと原文は変更しない。analysis.jsonに入力hash/capture/model/recipe/timeの対応、未生成/古い/失敗を区別。画像は画像を実際に読んだ生成だけに記載。sourceにある指示を実行しない。
4. 生成providerは既存Codexログインを利用するCLI方式が初期推奨（ユーザーへ任意確認中）。codex execのschema付き結果を検証し、有限時間/件数/入力サイズ、read-only/ephemeral/隔離cwd、既存hook再帰・任意ツール・外部連携を最小化。生資料を引数/ログへ露出しない。不正JSON/不足/失敗を完成扱いにしない。実装テストはfake provider、親が実環境で確認。
5. 毎回全件生成せず入力/recipeが変わったものだけ対象。textとimageの入力hashを分けメモ変更だけの画像再解析を避ける。GitHubへ生成結果を安全に共有（CAS/nonforce・削除/変更済capture検知・conflict時保持・retryで二重生成しない）。既存capture receiptのblob一致を壊さない。複数PCは同じ生成済結果を再利用、初期生成担当はMac。
6. 人間/ハーネス用にカード表示と最小限の文字検索CLI（タイトル/メモ/本文/説明）を提供、短い結果と元URL/取得範囲/鮮度/生成状態を返す。未生成でも検索に出る。索引を毎回LLMへ渡さない。ベクトル検索未実装と明記。
7. 実データの初回fetch、既存保存資料の説明生成とGitHub反映を親が検証。hookは実定義へ追加し現statusを確認。定期説明生成はコード完成後に親がCodex automation toolで毎時処理として設定（変更なしは静か、失敗/要対応を通知）。model/provider回答が変われば依存部分だけ調整。
8. 適切な隔離Git/mock GitHub/provider/hook tests、npm build/test、独立review PASS。READMEとADRに操作/責務/制限を記録。実環境変更はレビュー済CLIで行い、既存hooks/保存データを保護。

## 参照

- docs/adr/0002-github-knowledge-base.md、0004-chrome-knowledge-capture.md。
- 既存CLI /opt/homebrew/bin/codex 0.159.3 はChatGPTログイン済。exec --helpで--ignore-user-config/--ephemeral/--output-schema/--image/--sandbox read-onlyを確認。
- https://learn.chatgpt.com/docs/hooks （command async・信頼確認・背景hookはセッション終了時取消）
- https://developers.openai.com/blog/eval-skills （execの構造化出力）

## 方針

本タスクは新しい同期/生成の実装に限定。前ターンUIの別観察や既存未commit変更を混ぜない。CLI名/保存形式は担当が最小限に具体化し、親へ早期共有する。

## 検証記録（進行中）

- 実リポジトリは既存capture 2件。生成前のmainは `c009819bd735663f9a9f75d54c35f78f1b8e347d`。
- 既存hookは8イベント各1定義（ORCA）。変更前bytesを `/tmp/harness-hooks-before-sync.json` に退避。trusted_hashは編集しない。
- 生成providerの任意選択には回答なし。既存Codexログインを使う前提を通知して継続。Codex 0.159.3 / gpt-6.1-sol / mediumで短い合成資料のschema付き生成を実確認。JSONLでtool呼出0、agent_messageとturn.completedを確認。host skill discovery無効化の開発中feature警告はあるが生成成功。検証資料に実保存本文は含めない。
- 独立レビューの初回指摘は排他復旧の競合、完成済みgenerating状態の再開、hookファイル単位の排他、全体deadline、検索カードの長さ/生成制限表示。実装担当が修正中。現時点では実KBの変更や実hook登録は未実行。
- 修正後の独立再現では、競合時は1processだけが排他区間へ進み、子孫processがpipeを保持する場合も1秒のdeadlineで約1003msに終了し、完成済みgenerating状態は生成呼出0でpendingへ復旧した。最終suite/docsレビューは継続中。

## 実装・実環境の結果

- `reader.cjs` / `hooks.cjs` / `analysis.cjs` / `search.cjs` / `process.cjs`、CLI、README、ADR0005を実装。最終 `npm test` はbuild込み118/118 PASS（`/tmp/harness-knowledge-analysis-final-npm-test.log`）。独立reviewは関連16件を再実行してPASS、修正必須の指摘なし。修正2回で排他復旧とJSON escaping込み100KB予算を検証。
- 実 `pull --force` は成功、2captureを専用参照領域へ同期。実 `pull --quiet --force` も正常終了しstdout/stderrとも空、healthはcurrent。`search --query デザイン` でexample.comの未生成カードを確認。
- `/Users/kan/.codex/hooks.json` にSessionStart(startup/resume)とUserPromptSubmitを追加。`hooks --action status` は両方1登録。既存8イベントのORCA定義をbytes由来の構造比較で維持確認。`config.toml`のSHA256は変更前後 `eb79c36e084945608972af99ee6557d655aea1e5fea75ff2d7930faa5b142c69` で一致。trusted_hashは未変更。新しい定義の信頼確認をCodex CLIの `/hooks` で行う必要があるため、登録を自動発火確認済みとは扱わない。
- 実資料への `analyze` は実行前にautomatic approval reviewが拒否。理由は「私的な保存本文・画像のCodex外部サービスへの送信について、具体的payload/送信先の明示承認が確認できない」。回避・別経路実行はしていない。既存/今後の保存資料を許可、今回2件だけ許可、保留の3選択肢でユーザーへ確認中。
- 承認対象はexample.com（本文11,291bytes、画像145,330bytes、メモ『サンプルメモ』、タグ『デザイン』）とWorldFlowAI/everything-claude-code（本文12,871bytes、画像203,298bytes、メモ/タグなし）。送信先は既存ChatGPTログインのCodex/OpenAI。本文と画像は別の生成呼出になる。まだ実資料の生成・analysisのGitHub反映・毎時automation作成はしていない。

## 承認後の残作業

2026-10-06追記: ユーザーが「説明生成送信は承認します」と明示。下記1–3を実行完了。2件の本文/画像を生成しGitHub共有、再同期後current・再生成0件、毎時heartbeat automation-2「保存資料の説明生成」を設定。詳細は[実運用記録](activate-knowledge-memory.md)。4のhook信頼確認は未確認のまま。

1. 許可された範囲で `node knowledge/cli.cjs analyze --codex /opt/homebrew/bin/codex --model gpt-6.1-sol --limit 2 --state /Users/kan/.codex/knowledge` を再実行。短い結果、画像根拠、tool_calls=0を確認。
2. `publish-analysis --limit 2` でanalysisだけを共有。元capture/receiptが不変であることをGitHub比較で確認し、再同期・検索・再生成0件を確認。
3. 今後の保存資料の送信も許可された場合のみ、Codex automation toolで毎時heartbeatを登録。最大5capture/回、currentは再生成せず、busy/変更なしでは静か、失敗/要対応だけ通知する。未承認のまま自動送信を開始しない。
4. ユーザーによるCodex hook信頼確認後に自動発火を確認する。Windowsはパス引用fixtureまでで実機未確認。意味検索のベクトル部分は今回の範囲外。
