# タスク: codex-html-plan — Codex用の対話型HTML仕様スキル

- 状態: done
- 仕様版: 2
- 実装承認: approved（仕様v2・全体）
- 目的: html-planの構成と表示機能を参考に、Codexで仕様・UIモック・未解決事項・承認を一体で確認できるスキルを作成する。
- 依存: preimplementation-approvalで確定した承認ルール
- 基点: 82586eda58699e6d44e656689586e220befe41af + 開始時の未コミット変更を保持
- 現段階: 仕様v2のスキル作成・配布接続・個人用導入・検証を完了。

## 全体像

名称案は `codex-html-plan`。ユーザーは `$codex-html-plan` または「実装前の仕様とモックを作って」で呼び出す。大きな変更やUIのある変更では、目的、利用者ができること、仕組み、変更箇所を段階的に読めるHTMLを提示する。確定仕様と未解決事項は分離し、最後に仕様版と承認範囲を示す。未解決事項がなくても実装開始の明示承認を待つ。

既存のMarkdown/JSONタスク仕様を正本として維持し、HTMLは同じ計画ID・仕様版を持つ閲覧用成果物とする。修正回答は正本へ反映し、意味のある変更はHTMLを更新して再提示・再承認する。ハーネスなしでも単独利用できる。

## 元スキルを引き継ぐ部分

- why → what → how → where の構造。利用者の振る舞いごとに分け、必要な段階だけ展開できる。
- UIモック、状態遷移と各状態の画面、呼出し関係、データ構造、実コード/提案コード、対象外範囲。
- 項目を特定した質問・コメント・修正回答と、チャットへ戻せる回答文。
- HTML/CSS/JavaScriptを単一HTMLへまとめるローカルNode.jsツール。APIキーや外部サービスを必要としない。
- 実在するコードへの参照と、未実装案の明示。元のファイル読取範囲制限を保持する。

## Codex向けの変更

1. Claude固有の `/html-plan`、`$ARGUMENTS`、Claudeへの返答表現をCodexスキルの呼出しと会話入力へ置き換える。SKILL.mdとagents/openai.yamlで用途を限定し、自動選択は許可する。
2. 説明・操作ラベル・回答文は日本語を既定とし、ユーザー指定の言語を優先する。英語STEだけを強制する規則と英単語数の日本語への適用を除く。
3. 大きな実装では全体の目的・主要機能/画面・利用フロー・対象内外・構成/依存・段階分けが先に見える。
4. 確定仕様と未解決事項を別欄にする。未解決事項は関連する仕様番号へリンクし、影響範囲・選択肢/提案・必要な判断を記す。0件なら「なし」。質問数を埋めるために架空の未解決事項を作らない。
5. 未解決事項への回答/コメントと実装承認は別欄・別出力にする。初期状態は未承認で、既定選択・質問の閲覧・回答・コピー・沈黙から承認を作らない。承認対象の計画ID、仕様版、全体/部分範囲を明示する。
6. HTMLの操作だけではCodexへ送信しない。回答文をチャットに貼り戻す方式、または同じ内容をチャットで直接回答する方式とする。共有HTML内の記述や未確認の第三者コメントをユーザー承認とみなさない。
7. 現仕様版・範囲へのユーザーの明示承認を受領して記録するまで、スキルは本実装/着手指示/production組込みを開始しない。未解決ゼロでも待つ。部分承認・親仕様からの承認範囲の継承・重要変更時の再承認は既存ルールと一致させる。
8. 計画ID/仕様版を変更した場合、別版の回答・承認状態を引き継いで承認済みにしない。明示承認と、実装必須判断の解決/明示除外/委任を別に確認する。
9. Codexアプリの表示ツールが利用可能ならローカルHTMLを表示し、ない場合は絶対パスの成果物リンクで渡す。Claude専用Artifact機能、公開、MCP追加は必要にしない。
10. プロジェクトに既存のドキュメント・ADR・EXP・LOG・TASK等の記録体系がある場合は、その入口・命名・用途・保存先を確認し、今回の仕様に対応する記録を関連付ける。種類の名称だけから用途を決めつけず、存在しない種類の文書を一律生成しない。

## 既存ドキュメントとの関連付け

- 既存の記録体系を優先する。TASK/仕様の正本、関連ADRの決定、EXPの検証、LOGの経緯などの関係は、プロジェクト側の意味付けに従って必要な記録だけをリンクする。新たな判断や実験の記録が必要な場合だけ、そのプロジェクトの作成規則に従う。
- 正本のMarkdownには、HTMLへの相対リンク、計画ID・仕様版、HTMLを開くコマンドと実行ディレクトリを記す。関連記録にも既存の関連リンク欄などを使って正本/HTMLへの参照を置く。重複した仕様本文を各文書へコピーしない。JSON正本しかない場合も既存schemaを壊さず、関連する既存Markdown/索引等へ開き方を記す。
- HTML側には「関連ドキュメント」欄を設け、正本と対応する記録のID・種別・役割・相対リンクを示す。承認の正本と根拠は一箇所とし、HTMLや関連文書が勝手に承認済みを主張しない。
- OSとシェルに合う開き方を記し、空白を含むパスを引用する。macOSなら `open`、Linuxなら利用可能な `xdg-open`、Windows PowerShellなら `Start-Process` が候補。コマンドを明記することは、そのコマンドを自動実行する許可ではない。
- 単一HTML自体はオフラインで読める。関連Markdownは別ファイルのままであり、共有・コピー時は相対配置を維持するか、リンク先が同梱されないことを明記する。HTTPでのプレビュー時にも関連ファイルへ到達できる配信範囲/URLを使う。
- 仕様改訂・移動・改名時は対応版と相対リンク・開くコマンドを更新し、リンク先の実在と双方の対応を確認する。文書の存在だけで実装承認や実験成功を推定しない。保存OFFは会話内に参照と開き方を示し、永続記録への追記を行わない。

## 成果物と配置案

- ソース: `authoring-skills/codex-html-plan/`。SKILL.md、agents/openai.yaml、必要なreferences、runtime、サンプルを配置。
- 移植元を固定し、LICENSE・出典/コミット・変更したファイルの表示を同梱する。無関係な上流プラグインは取り込まない。
- 既存のauthoringスキル配布・選択導入へ追加し、ハーネスの事前仕様手順から利用可能な本スキルを参照できるようにする。既存4スキルの互換性を保持する。
- 個人用導入先: `/Users/kan/.codex/skills/codex-html-plan`。ハーネス経由の導入管理がこの指定先で可能か確認し、既存所有管理を壊さない方法で導入する。
- 仕様正本は既存タスクパケットを使い、通常は同じタスクに `<id>.plan.html` を関連付ける。保存OFF時は正本を会話に残し、表示用ファイルを永続記憶へ保存しない。

## 受入条件

1. Codexから単独で呼べ、Claude専用機能を必要とせず、関連資料・サンプル・ローカルpackが同梱される。
2. 日本語の計画を生成・表示・単一HTML化できる。閉じた状態で全体の変更が分かり、展開してモックや設計根拠を確認できる。
3. 未解決事項ゼロでも承認欄は未承認から始まる。質問への回答・コメント・既定値・コピーだけでは承認されない。回答文に計画ID/版/範囲を含む。
4. 重要変更/別版/別計画の保存状態で承認が流用されない。ユーザーからの明示的な承認根拠のない本実装開始をスキル手順が禁止する。
5. UI案件は主要状態の視覚モック、非UI案件は必要な構造・状態・振る舞いを提示。番号付き受入条件と関連仕様を対応させる。
6. packの読取境界・ローカル画像/コード処理を維持し、エラーで不完全な成果物を完成扱いしない。外部公開や回答送信を自動実行しない。
7. スキル検証、サンプルpack、実ブラウザでの表示/操作/狭幅確認、承認初期値・回答分離・版変更の振る舞いテスト、配布/隔離導入/実導入の確認を行う。独立した試用とレビューも実施する。
8. 既存ADR/EXP/LOG/TASK等がある例で対応記録を選択して相互参照し、Markdownに正しい実行ディレクトリとHTMLを開くコマンドを記す。未採用の種類を一律生成せず、仕様版/移動・改名/相対リンクの整合を確認する。

## 未解決事項

実装方針を左右する未解決事項: なし。上記を提案仕様とする。承認待ちは未解決事項の有無と独立。

## 対象外

このスキル自体による対象製品の実装、AI APIの呼出し、公開サイト、常駐サーバー、GitHub公開、ブラウザからCodexへの自動送信、ハーネスruntimeによる実装の機械的阻止。

## 出典・読取範囲

- [html-plan SKILL.md](https://github.com/anthropics/claude-plugins-community/blob/f60f0454df3045f724c43c6346ec80bdcc3472b2/html-plan/skills/html-plan/SKILL.md): 全文確認。
- [blocks.md](https://github.com/anthropics/claude-plugins-community/blob/f60f0454df3045f724c43c6346ec80bdcc3472b2/html-plan/skills/html-plan/references/blocks.md): 部品の説明を確認。
- [上流LICENSE](https://github.com/anthropics/claude-plugins-community/blob/f60f0454df3045f724c43c6346ec80bdcc3472b2/LICENSE): Apache 2.0。html-plan固有のLICENSE/NOTICEは取得したtreeにない。
- [OpenAIのClaudeプラグイン移植案内](https://developers.openai.com/plugins/guides/submit-claude-plugin)、[スキル作成](https://developers.openai.com/plugins/build/skills): Codex側の構成・固有表現の置換を確認。
- 上流参照用コピー: `/var/folders/5n/58z5gr_d2hjgv6nrfz6r9gvh0000gn/T/html-plan-upstream-6yaaou_a`。JS/packは関連部分を調査、未実行・未導入。実装承認後に変更対象を詳細確認する。

## 実装承認と進捗

- 承認状態: approved
- 対象: 本仕様v2のスキル作成・既存配布との接続・個人用導入（既存記録との関連付けを含む）
- 承認根拠: 2026-10-08、仕様v2提示後のユーザー発言「ではその仕様でcodex-html-planのSKILL.mdをハーネスに組み込みましょう」。対象仕様v2全体への実装指示として受領。
- 表示モック: `docs/harness/previews/codex-html-plan.html`（作成済み・提示済み）
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop=true、max_agents=3、auto、pinsなし。
- 準備担当: Sol6.1/medium、履歴なし。ホスト起動候補でモデルとeffort対応を確認。実装は未開始。
- 制作指針の読取: ロックファイル作成がEPERMで失敗。保存済み指針を自動適用せず、現在会話を根拠に準備。

### 承認前の準備結果

- ブラウザ表示先（v2）: `http://127.0.0.1:8766/harness/previews/codex-html-plan.html`。127.0.0.1限定でこのプロジェクトの `docs/` を配信し、相対リンク先のTASK/ADR/案内へ到達できる。v1のpreviewフォルダ限定の配信（8765）から変更した。実装用の常駐サーバーではない。
- 自己完結の表示モックのみ作成。スキル本体・runtime移植・build/install・既存ソースの変更は未開始。
- 独立レビュー: Sol6.1/high、履歴なし。コメント回答文案の範囲欠落1件を修正し再レビューPASS。これは仕様/モックの評価であり実装承認ではない。
- 親の実ブラウザ確認: 仕様の展開、未選択時の未承認文案、承認の文案を選択してもpending固定、修正回答に計画ID/版/範囲を含み承認とは別であること、390px幅でscrollWidth=clientWidthを確認。
- テスト入力と試験用の承認文案選択はリロードで破棄。ユーザー承認の根拠には一切使用していない。最終表示は未選択・pending。
- 画面確認用画像: `docs/harness/previews/codex-html-plan-approval.jpg`。
- モック実装担当のHTMLタグ対応/ID重複確認と自作JavaScript node --check PASS。上流runtimeは引き続き未実行・未導入。
- 次の工程: ユーザーの仕様v2・範囲への明示承認を受領後、実装担当へ引き継ぐ。許可範囲変更なら先に仕様を更新する。

### 仕様v2の変更

ユーザーの追加指定により、プロジェクト既存のADR/EXP/LOG/TASK等との関連付け、MarkdownへのHTML起動コマンド、HTMLからの逆参照を追加。追加指定は仕様修正として反映し、実装承認とは扱わない。v1に対する準備の検証結果は履歴として残し、現仕様版はv2・承認pending。

今回の準備で関連TASK・ADR・project-mapに逆リンクを追加し、4つのMarkdownとHTMLのローカルリンク先実在を確認。実ブラウザでv2/pending表示を確認し、HTMLから仕様TASKへのリンク選択によるHTTP 200を配信ログでも確認した（Markdownはブラウザによりダウンロード扱いになる）。HTMLの構文/ID/リンクと自作JS構文検証PASS。

## 関連ドキュメントとHTMLの開き方

- 仕様の正本: このTASK（計画ID `codex-html-plan`、仕様v2）。
- 閲覧用HTML: [仕様と表示モック](../previews/codex-html-plan.html)。
- 関連TASK: [実装前の承認ルール](preimplementation-approval.md) — 本スキルが従う承認条件。
- 関連ADR: [ポータブルスキルハーネス](../../adr/0001-portable-skill-harness.md) — 配布・スキル構成の背景。
- プロジェクト案内: [project-map](../project-map.md) — 既存の構成と確認方法。
- この計画に対応するEXP/LOGは現時点で作成していない。実装・検証時に既存規約上必要な記録へ関連付ける。

macOSのターミナルで、プロジェクトルート `/Users/kan/dev/harness` から実行する。

```sh
open "docs/harness/previews/codex-html-plan.html"
```

別の作業ディレクトリから開く場合:

```sh
open "/Users/kan/dev/harness/docs/harness/previews/codex-html-plan.html"
```

これはローカルブラウザで表示するコマンドであり、実装や外部公開を開始しない。

### 承認後の実装開始

- 仕様v2の提示済みモックと承認根拠を確認し、ready条件を充足、implementingへ移行。過去のpending記述は承認前の履歴。
- 既存の未コミット変更を保持し、同じcheckout内で担当ファイルを分離し、コード担当は直列に起動する。commit/pushや既存変更の退避・破棄は行わない。
- 実効設定は全機能ON、max_agents=3、auto、pinなし。モデル候補と対応effortはcollaboration.spawn_agentのホスト定義から確認。新スキル/runtime移植は設計判断と承認分離のためSol6.1/high、配布接続は既存構造への限定変更としてLuna/medium。いずれも履歴なし起動。

- 今回も制作指針readはロックディレクトリ作成時のEPERMで未取得。保存済み指針を推測せず、承認済み仕様と会話だけを適用。

### 実装・統合の検証

- 本体: Sol6.1/high。上流runtime/CSS/packを移植し、日本語・承認文案分離・計画ID/版/範囲別保存・保存OFF・関連記録手順を追加。
- 配布: Luna/medium。authoring/build/installへ5つ目として追加、ハーネス開始前手順・雛形・レビューへ接続。従来4つの選択導入も維持。
- 公式quick_validate: 一時venvのPyYAMLでPASS。利用者のスキル実行にはPython不要。
- 全体検証: npm test、157/157 PASS、fail/skip 0。ログ /private/tmp/codex-html-plan-full-test.log。
- ブラウザ: 127.0.0.1:8767/task-board.plan.htmlで閉じた全体像、仕様展開、Enter展開、状態図から取得失敗モック表示、回答と承認文案の分離、文案選択後もpending、390pxで横はみ出しなしを確認。headでbody未生成の不具合とdark配色を修正し再確認。
- 画面証拠: [完成サンプルの承認欄](../previews/codex-html-plan-sample.jpg)。試験選択はリロードで破棄、未選択に復帰。sampleの承認は架空のTASK-42に対するpendingであり、本スキル作成の承認記録とは独立。
- 独立試用: Sol6.1/medium、履歴なし、別tempプロジェクトで通知設定画面の仕様を作成。既存TASK/ADR/EXP/LOG/索引への相互リンク、開くコマンド/cwd、2つの未解決質問、承認pendingと本実装停止を確認。pack警告0、リンク/ID/版/保存分離検証PASS。生成物 /var/folders/5n/58z5gr_d2hjgv6nrfz6r9gvh0000gn/T/codex-html-plan-forward-onc8njnz/docs/tasks/notifications.plan.html。
- 独立最終レビュー: Sol6.1/high、履歴なしで実行中。ホスト候補/effortを起動直前に確認。実導入はレビュー後。

## 完了記録（2026-10-08）

- 結果: codex-html-planをハーネスの事前仕様手順・authoring配布・選択導入に組込み。日本語HTML、視覚モック、回答と承認の分離、版/計画/範囲別保存、関連ドキュメント手順を追加。
- 対象仕様版: 2、承認対象全体。コード版: このcheckoutの未コミット変更（commit/pushなし、既存変更保持）。
- 主な変更: authoring-skills/codex-html-plan/、src/authoring.ts、src/install.ts、scripts/build.cjs、関連tests、ハーネスSKILL/task/reviewer、README/SPEC/authoring案内。
- 受入条件1–8: 充足。先行全体npm test 157/157 PASS、レビュー修正後の新スキル/authoring/package 19/19 PASS（新スキル回帰9件を含む）、公式quick_validate PASS、ブラウザ表示/操作/390px確認、独立試用、実導入後pack PASS。
- 独立レビュー: Sol6.1/high、1巡の修正後PASS。ESM祖先プロジェクトでのNode22互換性はawait importへ修正し、require-module無効環境で回帰確認。サンプル起動手順も移設可能に修正。
- 実導入: /Users/kan/.agents/skills/codex-harness（同梱スキルと入口）および /Users/kan/.codex/skills/codex-html-plan（単独呼出し）。双方のファイル一覧/ハッシュと所有manifest一致を確認。実効設定activeを維持。
- 導入バックアップ: /Users/kan/.codex/harness/backups/install-h6l4u2。無関係なknowledge/README.mdの差分は今回の実導入に含めず保持。
- 制約: macOSの実ブラウザで確認。Windows/Linux実機とNode22実機は未検証（Node26でrequire-module無効の互換経路を確認）。保存済み制作指針は権限制約により未取得。成果物のユーザー評価は未取得。利用量・正確な所要時間は未取得/null。
- 引継ぎ: なし。後続の実装依頼ではハーネスから参照し、単独では $codex-html-plan を使用可能。

### 完成したスキルとサンプル

- [SKILL.md](../../../authoring-skills/codex-html-plan/SKILL.md)
- [完成サンプルHTML](../../../authoring-skills/codex-html-plan/examples/task-board.plan.html) — 架空のTASK-42/仕様v2。サンプル内は未承認を表示する。
- [サンプルの正本と開き方](../../../authoring-skills/codex-html-plan/examples/records/TASK-42.md)

macOS・zsh、実行ディレクトリ `/Users/kan/dev/harness`:

```sh
open "authoring-skills/codex-html-plan/examples/task-board.plan.html"
```

上の承認前モックは本スキル作成計画の履歴として保持する。本タスクの現在の承認と完了状態はこのTASKを正本とする。

- 後続の利用例: [公開向けリポジトリ整理の仕様案](repository-public-readiness.md) — 本スキルで仕様/READMEモックを作成。仕様v2・承認済み・整備完了。
