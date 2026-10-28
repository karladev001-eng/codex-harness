# Claude Codeで動かすときの読み替え

本文の共通規則は役割キーとeffortで書いています。Codexを前提にした手順が出てきたら、Claude Code（プラグイン `harness`）ではこのファイルが優先します（Codexでの具体値は[Codex](codex.md)）。ここにない共通規則（承認、レビュー、出典、改善ループ、保存）と上位指示の優先順位は、そのまま適用します。毎回必要な読み替え（`AGENTS.md`→`CLAUDE.md`、子の種類、modelとeffortの指定、権限）はSessionStartの文脈に入っているので、このファイルは委譲・外部相談・下記の個別手順のときに該当節だけ読みます。

## 委譲（coordination手順4〜5の読み替え）

| 役割 | `subagent_type` | 備考 |
|---|---|---|
| 実装 | `harness:implementer` | コード変更はworktreeで隔離 |
| 統合 | `harness:integrator` | 統合worktreeを渡す |
| 独立レビュー | `harness:reviewer` | 編集ツールなし |
| 調査・資料確認 | `harness:researcher` | 読み取りのみ |

- **モデル**：`status.config.models[<役割キー>]` の `model`（`haiku` / `sonnet` / `opus`）をAgentの `model` に、`reasoning_effort` を `effort` に毎回渡します。省略すると子はメインと同じモデルで動くため、プラグインのhookが起動を拒否します。ユーザーの明示指定と設定のpinが優先です。指定したモデルが使えなければ、黙って代替せず報告します。
- **履歴なし起動**：上の役割を指定した通常起動が、Codexの `fork_turns="none"` に当たります。`fork` は親の会話を引き継ぐので使いません。先頭が `HARNESS_WORKER` のプロンプトを `harness:*` 以外（`general-purpose` など）へ送るか、`HARNESS_WORKER` を含むプロンプトを `fork`・種類の省略で送ると、hookが拒否します。
- **worktree**：パケットの基点が現在のHEADなら、Agentの `isolation: "worktree"` を使えます。別の基点が必要なら `runtime.js worktree create --id ID --base COMMIT` で作り、その絶対パスを渡して子に最初に `cd` させます。worktreeを使えなければ理由を報告し、[並列規則](../parallel.md)に従って進め方を決めます。
- **渡す内容**：プロンプトの先頭に `HARNESS_WORKER` と役割を書き、パケット、役割参照の絶対パス、作業ディレクトリ、実効設定、必要な資料だけを渡します。子は親の会話を見られないので、受入条件・承認の範囲と根拠を省略しません。
- **並列と完了待ち**：独立したreadyタスクは、1つのメッセージでAgentを複数呼んで並列にします（`max_agents` 以下）。子はバックグラウンドで動き、終わると通知が来ます。ポーリングや結果の推測はしません。子のエージェント定義はサブエージェントを起動できない前提で、子が再委譲を求めてきたら親が判断します。

## 作業の振り分け（`collaboration`）

`status` の `collaboration.tasks` の値は、実行中のホストから見た `host`（自分）・`peer`（Claude CodeではCodex）・`both`・`off` です。

| 作業 | 既定 | Claude Codeでの動き |
|---|---|---|
| `advice`（発案・相談・批評） | `peer` | [consult-codex](../../consult-codex/SKILL.md) の `ideator` / `consultant` / `critic` |
| `code_review`（独立レビュー） | `both` | `harness:reviewer` とconsult-codexの `reviewer` を並行し、親が統合（consult-codexの「2者レビュー」）。PASSが揃うまで完了にしません |
| `html_mock`（仕様・UIモックのHTML） | `claude` | 自分で作る（`harness:codex-html-plan`） |
| `image_generation`（画像生成） | `codex` | `harness:codex-image` で、Codexの組み込み画像生成を `codex exec` 経由で使います。生成物はプロジェクト内の指定パスへ、既存ファイルを上書きせずにコピーします |

- Codexへ送る前に、各スキルの `--approval` で送信承認を判定します（consult-codexの「送信の承認」）。`approved` なら聞き直しません。それ以外なら、決まった文面で1回だけ確認します。承認が得られない、`codex` CLIがない、ログインを確認できない場合は、そう報告して自分側だけで進めます。黙って省略も代替もしません。
- `off` の作業は自動で行いません。ユーザーが明示的に頼めば従います。
- Claude Code上では `consult-claude` は使いません。Codexを使えずに独立案が必要なときは、親の案を渡さない新しいサブエージェント（`complex` のモデル）に出させ、「同じモデル系統の別インスタンスによる案」と明記します。

## その他の読み替え

- **権限**：Codexの `sandbox_permissions: "require_escalated"` は使いません。Claude Codeの権限モードに従い、拒否された呼び出しは繰り返さず、理由を報告して進め方を変えます。認証情報の読み出しや拒否の迂回はしません。
- **早期compact**：Codexの設定ファイルを編集する手順は適用しません。compactはホストが管理します。compact後に本文が失われたら、必要な参照を読み直します。
- **Knowledgeの説明生成**：`codex` CLIとそのログインが必要です。
- **保存先**：設定・制作記憶・技術的知見は `~/.agents/harness/` をCodexと共有します。
- **authoringスキル**：HTML計画は `harness:codex-html-plan`、ほかのauthoringスキルも同様にプラグインのスキルとして使えます。
- **計測**：`measure record` はホストに依存しないので、そのまま使います。
