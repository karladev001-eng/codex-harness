---
name: harness
description: Coordinate Codex coding tasks through compact specifications, isolated parallel implementers, independent reviews, and resumable records. Use for coding work when the installed harness is enabled or the user invokes it; delegated workers execute only their assigned role.
---

# Codex Harness

仕様を引継ぎの単位とし、メインは判断と調整、子は実装と検証を担当する。これは指示による運用であり、強制スケジューラではない。

## 起動と機能切替

委譲プロンプトに `HARNESS_WORKER` がある場合、割り当てられた役割だけを実行し、この調整手順や子の起動を繰り返さない。

最初に、このSKILL.mdと同じディレクトリの `runtime.js` を使い、`node "<skill-dir>/runtime.js" status --project <absolute-project-path>` を実行する。Node.js 22以上を使い、空白を含むパスはホストのシェルに合わせて引用する。設定不備は報告し、黙って有効化しない。個人設定、プロジェクト設定、上位の指示、ユーザーの指定を確認する。

- `active=false`：状態確認で終了し、通常の作業へ戻る。追加の委譲・文書・レビュー・計測は行わない。
- `delegation=false`：メインが実装可能。`review=true` の独立レビューは残す。
- `persistence=false`：仕様はインラインで渡し、タスク文書やADRを保存しない。
- `measurement=false`：利用情報や計測ログを保存しない。
- 次の作業単位の開始時に設定を再評価する。実行中の変更を破棄しない。

## 調整手順

1. メインは目的・対象外・番号付き受入条件を確定する。[タスク雛形](assets/task.md)に従い、担当範囲、依存タスク、仕様版、コミット済み基点、参照資料、未解決事項を含むパケットを作る。探索が大きい場合だけ調査担当へ委譲する。
2. 永続保存が有効なら必要な記録だけ `docs/harness/` に置く。主要な入口と検証方法は[プロジェクト案内](assets/project-map.md)、後に影響する判断は[ADR](assets/adr.md)を使う。全ファイル一覧や会話全文を作らない。
3. 依存グラフの欠落・循環を解決し、準備のできたタスクを並列実行する。実装・調査・レビュー・統合の合計を `max_agents`（既定3）とホスト上限の小さい方以下に保つ。並列化の詳細は[並列実行](references/parallel.md)を読む。
4. モデルは[役割とモデル](references/roles.md)の基準で実効設定から選び、ホストで利用可能か確認する。履歴を引き継がない起動方式（対応ホストでは `fork_turns="none"`）を明示する。利用不能なら制約を報告し、黙って別モデルや全履歴継承へ置き換えない。
5. 子への指示は `HARNESS_WORKER`、担当役割、パケット、役割参照への絶対パス、作業ディレクトリ、実効設定、必要な資料参照だけとする。未コミットのパケットは子worktreeにないため、インラインまたは調整元checkoutの絶対パスで渡す。実効設定も子の基点から再解決させず渡す。インライン手渡しでも受入条件を省略しない。別タスクは新しい子、同一タスクの修正は同じ子を継続可能。子の再委譲は禁止。
6. `review=true` なら各実装を別のレビュー担当に渡す。[レビュー手順](references/reviewer.md)を使い、実差分とコードを読ませる。修正と再レビューは最大2巡。それでも未解決ならメインが仕様・方針を判断し、完了扱いにしない。
7. 承認済みの変更を統合担当に委譲する。依存順に統合・結合検証し、レビュー有効時は最終的な変更間の整合性も独立レビューする。メインは統合コードを代筆しない（委譲OFF時を除く）。
8. 最新の仕様版・コード版で受入条件と必要なレビューPASSを確認する。結果・変更ファイル・検証と証拠・未解決事項・コミットIDだけをメインへ返す。仕様改訂で影響を受けた結果と依存する統合は再検証する。

## 記録と再開

状態は `planned → ready → implementing → reviewing → done`。レビューOFFでは検証後doneへ進める。`needs_work` は修正へ戻し、`blocked` には理由を付ける。状態遷移と受入判断はエージェントの責務であり、補助CLIだけで完了を証明できない。

永続保存が有効なら[完了記録](assets/completion.md)をパケットへ追記する。長いログはホスト側の保存先を使う。再開時はタスクIDから現在のパケット・必要なADR・実際のコード状態だけを読む。別PCへの引継ぎはコードと文書をGit等で同期し、ローカルworktreeや稼働中エージェントの移動を前提にしない。compactや会話ログ削除は自動化しない。

補助CLIの操作時は[コマンド](references/commands.md)、計測が有効な場合は[計測](references/measurement.md)を読む。Designer、ブラウザ操作評価、外部ナレッジ連携はv1の自動工程に含まれない。
