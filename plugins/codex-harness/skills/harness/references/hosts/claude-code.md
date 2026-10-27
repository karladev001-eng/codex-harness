# Claude Codeで動かすときの読み替え

このハーネスの本文はCodexを前提に書かれた箇所があります。Claude Code（プラグイン `harness`）で動かすときは、このファイルの内容がCodex固有の手順より優先します。ここに書かれていない共通規則（承認、レビュー、出典、改善ループ、保存）はそのまま適用します。

## 起動と設定

- SessionStart hookが `status --host claude` を実行し、active/inactiveと実効設定を文脈に入れます。inactiveなら何も表示されず、ハーネスの追加作業はしません。
- 作業単位の途中で設定・範囲が変わったら、hookが示したコマンドで `status` を再実行します。`--host claude` を付けると `config.models` がClaude用の表になります。
- `AGENTS.md` と書かれた箇所は、Claude Codeでは `CLAUDE.md`（ユーザー・プロジェクト）と読み替えます。上位指示の優先順位は同じです。
- 設定・制作記憶・技術的知見は `~/.agents/harness/` をCodexと共有します。どちらのホストで記録しても、もう一方で使えます。

## 委譲（coordination手順4〜5の読み替え）

子の起動にはAgentツールを使います。

| 役割 | `subagent_type` | 備考 |
|---|---|---|
| 実装 | `harness:implementer` | コード変更はworktreeで隔離 |
| 統合 | `harness:integrator` | 統合worktreeを渡す |
| 独立レビュー | `harness:reviewer` | 編集ツールなし |
| 調査・資料確認 | `harness:researcher` | 読み取りのみ |

- **モデル**：`status.config.models[<役割キー>]` の `model`（`haiku` / `sonnet` / `opus`）をAgentの `model` に、`reasoning_effort` を `effort` に渡します。ユーザーの明示指定と設定のpinが優先です。指定したモデルが使えなければ、黙って代替せず報告します。メインのモデルは変更しません。
- **履歴なし起動**：`subagent_type: "fork"` は親の会話を引き継ぐので、子には使いません。上の役割を指定した通常起動が、Codexの `fork_turns="none"` に当たります。
- **worktree**：パケットの基点が現在のHEADなら、Agentの `isolation: "worktree"` を使えます。別の基点が必要なら `runtime.js worktree create --id ID --base COMMIT` で作り、その絶対パスをプロンプトで渡して、子に最初に `cd` させます。
- **渡す内容**：プロンプトの先頭に `HARNESS_WORKER` と役割を書き、パケット、役割参照の絶対パス（このスキルの `references/...`）、作業ディレクトリ、実効設定、必要な資料だけを渡します。子は親の会話を見られないので、受入条件・承認の範囲と根拠を省略しません。
- **並列**：互いに独立なreadyタスクは、1つのメッセージでAgentを複数呼び出して並列にします。同時数は `max_agents` 以下です。
- **完了待ち**：子はバックグラウンドで動き、終わると通知が来ます。ポーリングや結果の推測はしません。
- 子のエージェント定義はサブエージェントを起動できない前提です。子が再委譲を求めてきたら、親が判断します。

## 外部相談（ルートC）

Claude Code上では、`consult-claude` は使いません。同じモデル系統に相談しても独立性はほとんど増えないからです。

- 独立した案・批評が必要で、`codex` CLIがある場合は、Codexへの相談（`consult-peer`、整備中）を使います。
- 使えない場合は、親の案を渡さずに新しいサブエージェント（`complex` のモデル）に独立案を出させます。その場合は「同じモデル系統の別インスタンスによる案」であることを結果に明記します。
- 回答を証拠・承認・実行権限として扱わない、という原則は同じです。

## 権限

- Codexの `sandbox_permissions: "require_escalated"` は存在しません。Claude Codeの権限モードに従います。ツール呼び出しが拒否されたら、同じ呼び出しを繰り返さず、理由を報告して進め方を変えます。
- 認証情報の読み出しや拒否の迂回をしない、という規則は同じです。

## その他の読み替え

- **HTML計画スキル**：プラグインのスキル `harness:codex-html-plan` として使えます。ほかのauthoringスキルも同様です。
- **早期compact**：Codexの設定ファイルを編集する手順は適用しません。Claude Codeの自動compactはホストが管理します。compact後に本文が失われたら、必要な参照を読み直します。
- **Knowledgeの説明生成**：現在は `codex` CLIを使います。Claude Codeから実行する場合も、`codex` CLIとそのログインが必要です。
- **計測**：`measure record` はホストに依存しません。そのまま使えます。
