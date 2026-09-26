# Authoring Skills

`create-rulebooks`、`create-subagent`、`create-harness` は、規則、再利用可能な担当定義、作業の調整手順をMarkdownとして作成・更新する独立スキルです。`inspect-harness` はそれらと既存のCodex Harness構成を読み取り専用で確認します。作成用3スキルと確認用1スキルは、既存の `plugins/codex-harness/`、runtime、モデル設定、導入スクリプトに依存せず、変更もしません。

## 導入

既存プロジェクトへ Git clone なしで4スキルを導入する場合は、[INSTALL.md](INSTALL.md) を使います。対象プロジェクトをCodexで開いて依頼する方法と、macOS/Linux・Windows PowerShell向けの手動手順を載せています。

この4スキルはOS固有のコードを含まないMarkdownです。ただし、利用先のCodexがスキルに対応している必要があります。macOSでの4スキル一括導入と `inspect-harness` 単体の個人用導入は検証済みですが、WindowsとLinuxの実機ではまだ検証していません。Node.jsとGitを使うCodex Harness本体とは独立して利用できます。Markdownスキルの使用自体にNode.jsは不要ですが、導入CLIにはNode.js 22以上とnpmが必要です。

各スキルのフォルダをそのまま個人用スキル領域へコピーして使えます。作成用3スキルを併用する場合は、まず `create-harness` で最小構成と索引を作り、必要に応じて他の2スキルで定義を追加します。`inspect-harness` は現在の構成、規則、担当、手順、記録と確認可能な状態を変更せずに説明します。入口は、明示指定、`AGENTS.md` などが参照する既存索引、既定の `HARNESS.md` の順に解決します。新規プロジェクトに読込入口がない場合は、利用者が対象索引を読むか、「運用可能にして」と依頼された場合だけ最小の `AGENTS.md` 参照を作ります。入口の内容や上位指示は壊さず、明示された名称・場所を優先します。

既定の配置は次のとおりです。実際に使う定義がないフォルダは作りません。

| 種別 | 既定の保存先 |
| --- | --- |
| 索引 | `HARNESS.md` |
| 規則 | `harness/rulebooks/<id>.md` |
| 担当定義 | `harness/subagents/<id>.md` |
| 実行手順 | `harness/workflows/<id>.md` |

これらのMarkdownは自動実行、ホスト上の担当登録、権限付与、設定変更を行いません。担当定義の作成は担当の起動ではなく、親が必要時に読むための資料の作成です。

保存先はプロジェクトルートからの相対パスです。索引と定義の間のリンクは、そのリンクを書いた文書からの相対パスにします。

例: 「本番データへ触れる変更には復旧手順を残す」を規則にするには `create-rulebooks` を使います。「リリース候補を確認して証拠を返す担当」を再利用したい場合は `create-subagent` を使います。両方を依存順に動かす必要が生じた時点で `create-harness` を使ってワークフローを作ります。単発の作業結果や会議メモは、恒久的な規則や担当へ変換しません。
