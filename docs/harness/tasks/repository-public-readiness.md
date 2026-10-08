# タスク: repository-public-readiness — 初めて使う人のためのリポジトリ整理

- 状態: done
- 計画ID: repository-public-readiness
- 仕様版: 2
- 実装承認: approved（仕様v2、S1–S5）
- 承認対象: 下記S1–S5のドキュメント・案内・最小限の配布整合修正。公開・push・ライセンス変更は含まない。
- 基点: 82586eda58699e6d44e656689586e220befe41af + 現在の未コミット変更を保持
- 目的: 他の利用者が内容・導入・最初の使い方を理解できる、公開に向けたリポジトリの入口を整える。
- ユーザー依頼: 「このハーネスを公開して他のユーザーが見ても、内容や導入方法がわかりやすいように、リポジトリを整えて欲しいです。まだ公開はしなくていいです。他の公開されているハーネスやスキルなどのように綺麗にまとめて欲しいです。」

## 全体像

READMEを利用者の入口、docsを目的別の手引き、既存SPEC/ADR/TASKを設計・開発履歴として整理する。ハーネスの主要機能として仕様と承認・分業とレビュー・改善ループ・ナレッジベース・保存資料の検索を説明する。5つの単独スキルも用途から選べるようにする。Chrome拡張機能（資料の収集）とRaycast検索（利用者が資料を探す入口）は、ハーネスとは別のツールとしてそれぞれ紹介・説明・導入を用意する。見た目はGitHub上でそのまま読めるMarkdownの見出し、比較表、コードブロック、短いフロー図を中心にする。

読む順番は「何ができる → 自分の用途を選ぶ → 必要環境 → 導入 → 最初の依頼 → 詳細設定」。公開URLやReleaseが存在する前提のコマンドは作らず、手元のcheckout/配布アーカイブから再現できる経路を先に示す。

言語はユーザーの明示指定を優先し、なければ普段の会話で使っている言語を使う。言語を毎回選択させる必要はない。今回の説明・ドキュメントは会話に合わせて日本語で作成する。名称はCodex Harnessを維持。

## 現状の確認

- READMEは約25KB。初期導入と高度な設定・移行・資料収集の説明が同じ入口に混在する。
- package/plugin/READMEは0.4.1だが、authoring-skills/INSTALL.mdの配布例は0.4.0。
- READMEはローカル配布物をコピーする手順、SPECの一部は非公開GitHub Releaseとgh認証を前提にしている。
- runtimeのhelpには4スキルとあるが、現在の実体は5スキル。
- READMEには資料収集・拡張機能を未実装とする古い記述と、実装済み機能の案内が併存する。
- ルートpackageのlicenseはUNLICENSED、private=true。html-plan由来の部分はApache-2.0でLICENSE/UPSTREAMを持つ。公開方針や全体ライセンスは未決定。
- 既存TASK等にはローカル絶対パスや開発時の記録がある。公開向け説明と内部履歴を同じものとして扱わない。

## 確定仕様案

### S1: READMEを短い入口に再構成

冒頭の短い説明、主な特長（仕様と承認、実装と独立レビュー、改善ループ、ナレッジベースと検索、再利用可能なスキル）、処理フロー、用途別導入表、クイックスタート、最初の依頼例、スキル一覧、詳細資料、対応状況、出典/ライセンスへの案内を置く。

実在する機能と検証状況だけを表示し、効果の数字、合格バッジ、未公開のダウンロード先を作らない。サンプル画像/フローは実成果物または正確な構造図を使う。凝ったWebサイト向けレイアウトはREADMEに持ち込まず、GitHubの表示可能な範囲に収める。

### S2: 導入経路を選べるようにする

ハーネス本体と特定スキルだけの導入を案内し、それとは別の「関連ツール」欄でChrome拡張機能とRaycast検索をそれぞれ紹介する。各ツールに、何ができるか・仕組み/連携先・前提条件・導入・初回利用・更新/解除の独立した説明を用意する。本体のインストール先とAGENTSへの変更、単体スキルが本体を有効化しないことも説明する。

ナレッジベース/検索はハーネスから保存資料を利用する機能として説明し、Chrome拡張は資料を入れる別ツール、Raycastは同じ保存資料を人が検索する別ツールとする。本体導入だけでChrome/Raycastが登録される、またはChrome/Raycastがハーネスの必須依存であると書かない。共通Knowledge CLI・保存設定・同期先との依存関係は図で示す。

導入ガイドではcheckoutからnpm ci/build/doctor/installへ進む経路と、ローカルtarballを受け取った経路を区別する。導入確認、最初の依頼、更新、解除、未所有/編集済みファイルの競合時の扱いまで揃える。macOS/LinuxとPowerShellで異なる環境変数・パス記法を混ぜない。公開済みRelease、npm公開、ワンクリックプラグイン導入は現在の機能と混同しない。

### S3: 目的別ドキュメントとスキル一覧

以下の構成を基準に、本文の重複を避けて移す。

```text
README.md                         初見向けの入口
CONTRIBUTING.md                    開発環境、検証、変更提案
THIRD_PARTY_NOTICES.md             同梱/参考資料とライセンスへの参照
docs/README.md                    読み手・目的別索引
docs/guides/installation.md        導入・確認・更新・解除
docs/guides/configuration.md       設定、モデル、保存と機能切替
docs/guides/workflow.md            仕様→モック→承認→実装→レビュー
docs/guides/improvement-loop.md    フィードバック→指針→次回適用
docs/guides/knowledge-base.md      保存資料、同期、取得版/鮮度
docs/guides/search.md              ハーネスから候補検索→必要箇所取得
docs/guides/troubleshooting.md     よくあるつまずきと確認コマンド
docs/maintainers/releasing.md      ローカル配布物の作成・検証
docs/maintainers/publication.md    将来公開時に残る判断と対象の整理
authoring-skills/README.md         5スキルの用途・呼出し例・成果物
authoring-skills/INSTALL.md        単独導入の正規手順
knowledge/README.md                Knowledge共通基盤・関連ツールの索引
knowledge/extension/README.md      Chrome拡張の紹介・説明・独立導入
integrations/raycast-knowledge/README.md  Raycast検索の紹介・説明・独立導入
```

改善ループでは、ユーザーのフィードバックを根拠として候補と指針を分け、適用範囲を確認して次回へ使う流れ、ON/OFF、保存先、訂正/忘却、未評価を成功扱いしないことを説明する。

ナレッジベースでは、保存される本文・メモ・画像・生成説明の違い、ローカル保存と明示設定したGitHub同期、必要な認証/設定、保存先と取得版・鮮度を説明する。制作指針と保存資料は別の情報として扱う。

検索では、文字検索による少数候補→説明カード→必要な本文/画像の取得と出典確認を例示する。現在の実装をベクトル意味検索と表現しない。ハーネスによる自動参照の適用条件と、ユーザーが明示的に依頼する検索を分ける。Chrome/Raycastの利用画面は各ツールの文書で扱う。

SPEC.mdとVALIDATION.mdは正本/検証記録の役割を保ち、現行情報と過去の結果を区別する。ADR/TASK/benchmarksの履歴は削除せず、利用者の導線から明確に分ける。既存文書のリンクや重要な説明を保ち、対応するTASK/ADR/索引へ相互参照する。

### S4: 説明と配布の整合を取る

古い版表記、実装状況、helpのスキル数を現実に合わせる。新しいガイドがtarball内でも参照可能になるようpackage.filesと既存packageテストを必要範囲で更新する。製品のAPI、承認動作、モデル既定、所有管理仕様は変更しない。

軽いMarkdownリンク検証を用意し、少なくとも公開向け入口・移動対象・同梱ガイドの相対リンクと参照ファイルを確認する。古い履歴内の過去環境への参照を現行手順の不具合と混同しない。

### S5: 公開前のメンテナンス案内

CONTRIBUTINGと簡潔なIssue/PRテンプレートを用意し、再現手順・期待結果・検証内容を記せるようにする。受付先URL/メールや対応時間の約束は捏造しない。

読者向け例の個人環境依存は汎用パス/例へ置換し、実際の個人設定や作業履歴は勝手に書き換えない。現行の公開対象候補（入口/ガイド/コード/テスト/同梱ライセンス）と、公開前に別途判断する履歴・実験成果物をpublication文書で整理する。ルートのUNLICENSED/private=trueは維持し、Apache-2.0由来部分の出典・LICENSEを保つ。

## 対象外

GitHubの公開設定変更、push、PR作成、Release公開、npm publish、ライセンス付与/変更、Git履歴改変、履歴/ベンチマークの一括削除、実装の大きな移動、製品機能の追加、個人環境への再インストール、Webサイトの公開は行わない。今回の完了は「公開向けの説明・導線が整った状態」であり「すべて公開可と確認済み」ではない。

## 入出力と異常時

入力は現在の実装/CLI/配布設定/既存文書。出力は上記Markdownと必要な図/画像、リンク検証、配布参照修正。製品UIの変更はなし。文書レイアウトはHTMLモックで提示する。利用環境によって実行できない手順は未検証と明記し、実導入テストは一時ホーム/一時プロジェクトだけを使う。リンク切れ/配布漏れ/古い説明が残る場合は該当条件を完了にしない。

## 未解決事項

今回の整理方針を左右する未解決事項: なし。言語はユーザー回答により解決済み。実装承認は別にpending。

将来の公開ライセンスと、既存の開発履歴/実験成果物を公開する範囲は公開前の判断として残す。今回の変更対象から明示除外し、現状を維持する。

## 受入条件

1. READMEの冒頭で目的・主機能・導入先・次に読む資料を判断できる（S1）。
2. 本体/スキルのみの導入と、Chrome拡張/Raycast検索それぞれの紹介・説明・独立導入を分け、初期導入→確認→初回利用→更新/解除の手順がある（S2）。
3. 実装状況・版・5スキル・必須依存が現行実装と一致し、未公開の配布物を入手可能と書かない（S2/S4）。
4. 改善ループ・ナレッジベース・検索に専用案内と利用例があり、保存/認証/機能切替/同期/検索の依存が現行実装と一致する。索引/相互リンク/既存入口を維持し、Markdownとモックが対応する（S1/S3）。
5. 文書内の実行例を一時環境で検証し、同梱文書のリンク、npm packの内容、関連回帰テストを確認する（S4）。
6. 公開向け例の個人環境依存を解消し、内部履歴・公開待ちの判断・同梱ライセンスを明示する（S5）。
7. 外部公開・push・権限設定・ライセンス変更・履歴削除・実ホーム導入を行わない（S5）。
8. 初見の利用者役による導線確認と独立レビューを通し、未検証OS等の制約を正確に報告する（全体）。

## 参考資料

- [OpenAI Plugins](https://github.com/openai/plugins): READMEの目的説明、標準構成、代表例への短い導線を参照。
- [Anthropic Skills](https://github.com/anthropics/skills): スキルの説明、一覧、導入、最小例、個別ライセンスの区別を参照。
- [Everything Claude Code](https://github.com/worldflowai/everything-claude-code): 詳細ガイドへの入口、構成ツリー、用途別の導入案内を参照。製品固有の機能/効果は転用しない。
- [Codexスキルの公式資料](https://developers.openai.com/plugins/build/skills): スキル構成とプラグインの関係を確認。
- openai/skillsは現在deprecatedと案内されていたため、現行例はopenai/pluginsを参照。

## 関連記録と表示

- [対話型仕様とREADMEモック](repository-public-readiness.plan.html)
- [codex-html-planの作成記録](codex-html-plan.md)
- [プロジェクト案内](../project-map.md)
- [既存構成ADR](../../adr/0001-portable-skill-harness.md)
- [ナレッジベースADR](../../adr/0002-github-knowledge-base.md)・[改善記録ADR](../../adr/0003-github-improvement-records.md)・[Chrome保存ADR](../../adr/0004-chrome-knowledge-capture.md)・[検索と取得ADR](../../adr/0006-knowledge-retrieval.md): 設計の根拠。現行の実装状態は後続ADRとコードで確認する。

macOS・zsh、実行ディレクトリ `/Users/kan/dev/harness`:

```sh
open "docs/harness/tasks/repository-public-readiness.plan.html"
```

## 承認と準備記録

- 承認状態: pending。今回の一般的依頼を、未提示の仕様版の実装承認とは扱わない。
- 仕様/モックの提示: 対話型HTMLとREADMEの全体/部分モックを作成し、会話で提示。実装承認はpending。
- 調査: Sol6.1/medium、履歴なし。実効全機能ON/max_agents3/auto/pinなし。ホスト起動候補を確認。準備段階につき本実装は開始しない。
- 保存済み制作指針はruntime readがEPERMで失敗。今回の会話と現物を基準とする。

### 読取調査の結果

独立担当が上記の版/help/導入経路不整合を確認。KnowledgeのCLI同梱とChrome拡張登録は別、Raycastは本体tarball非同梱かつMac向けであるため案内を分ける。限定範囲の公開向け資料ではRaycastのREADMEに個人checkoutパスを確認。内部TASK/benchmarksには未追跡成果物が多く、今回一括追加/削除しない。Raycast manifestのMITとrootのUNLICENSED、html-planのApache-2.0は区別して案内する。これは全面的なsecret監査/公開可判定ではない。

- 準備担当: Sol6.1/medium、履歴なし。公開例3件と現行実装を調査、仕様HTMLを生成。pack成功・警告0。関連リンク先実在と仕様版対応を確認。
- 表示確認: http://127.0.0.1:8766/harness/tasks/repository-public-readiness.plan.html 。実ブラウザで仕様の展開とREADMEモックを確認、390pxでscrollWidth=clientWidth。未解決の言語選択は未操作、承認pendingを維持。
- [提示画像](../previews/repository-public-readiness.jpg)。本体README/導入ガイド/ソースコードの整備は未開始、外部公開なし。

### 仕様v2 — フィードバック反映

- ユーザーから仕様v1への修正回答を受領。「実装承認: この回答には含みません」と明記されているため承認はpendingを維持。
- 言語: 「ユーザーの指定した言語や普段使用している言語でいい」「指定まではしなくていい」に従い、言語質問を撤去し、今回の会話言語で作成する。
- 機能案内: 改善ループ・ナレッジベース・検索を主要機能と専用ガイドに追加。
- 関連ツール: Chrome拡張とRaycast検索はハーネスから分け、それぞれ紹介・説明・導入手順を用意。
- 過去のv1/言語未選択/画像の記録は準備履歴。現行はv2、未解決事項なし、承認pending。本体README等は未変更。

- v2提示確認: HTMLを再pack（警告0）、関連する相対リンク9件の実在を確認。ブラウザで主要機能5項目、本体/スキルの2経路、Chrome/Raycastの独立案内を確認。390px幅で横はみ出しなし、仕様版2・質問0件・承認pending。
- [仕様v2の提示画像](../previews/repository-public-readiness-v2.jpg)。対話型HTMLも同じURLへ更新して提示。本体整備は未開始、公開/pushなし。

### 仕様v2 — 実装承認と着手

- ユーザー本人が仕様/モック提示後にチャットで承認: 「計画 repository-public-readiness の仕様版 2、範囲『S1–S5のドキュメント・案内・最小限の配布整合修正（公開・push・ライセンス変更除外）』の実装開始を承認します。」
- 承認状態: approved。全S1–S5、仕様v2。未解決事項なし。HTMLは承認の記録元ではないためpending表示を維持し、この正本を承認根拠とする。過去のpending記述は準備履歴。
- 提示根拠: 前ターンのv2 HTMLリンク、READMEモック提示画像、ブラウザでの確認。
- 既存未コミット変更を保持するため、現在checkoutで担当を直列実行。commit/stash/reset/push、外部公開、ライセンス変更、実ホーム導入は行わない。着手前hash一覧と主要ファイルの控えは /tmp/repository-public-readiness-baseline に保存。
- 実効設定: active、全機能ON、max_agents=3、model_selection=auto、pinなし。候補元はcollaboration.spawn_agentのホスト一覧。編集の構成判断はSol6.1/high、決定的な整合修正/統合はLuna/medium、独立レビューはSol6.1/highを選択する。履歴なし・再委譲なし。

- 文書担当 public_docs_implementation: Sol6.1/high、履歴なしで起動。S1/S2/S3/S5とS4文書部分を担当。preferences readはEPERMで失敗したため保存済み指針を適用せず、承認済み仕様を使用。

- 文書担当完了: 公開向け25ファイルを整備、相対リンク186件/アンカー15件の欠落なし。詳細引継ぎ /tmp/public-docs-implementation.md。
- 配布・統合担当 public_package_integration: Sol6.1/medium、履歴なし。文書の複数配置への配布設計が必要なため当初予定のLunaから選択理由を更新。S4整合修正・npm test・一時環境検証を担当。
- 独立担当 public_readiness_review: Sol6.1/high、履歴なし。初見利用者役として完成した文書導線を読み取り専用で確認。配布コードの最終レビューは統合結果の完成後に実施。いずれも同じホスト候補/実効設定を再確認して起動。

### 統合・検証とレビュー

- 統合担当が文書の配置ごとの参照を解決し、公開向けガイドを配布と恒久導入先へ同梱。runtime helpを5スキルへ訂正し、軽量リンク検証と実tarball/導入先の検証を追加。製品API・承認・モデル・所有管理は変更なし。
- 一次独立レビュー: NEEDS_WORK。Knowledge新規初期化/既存library接続と、LaunchAgent停止/恒久解除の文書にP2指摘。Chrome更新経路の明確化も同じ修正巡で反映。個人の過去automation状態への仮定も条件付きに修正。
- 検証: npm test 158 PASS、修正後package試験1 PASS、check:docs 167文書/788参照・欠落0。隔離home/project/cacheで本体・5スキル/単体の導入再実行解除、旧JS更新、Knowledge status/configure例、plist形式を確認。詳細は [VALIDATION](../../../VALIDATION.md#2026-10-08-公開向け文書とローカル配布の整合)。
- 最終配布物: /tmp/public-package-final/karladev001-eng-codex-harness-0.4.1.tgz（ローカルのみ）。既定npm cacheの権限エラーは一時cacheで解消。ライセンス/公開設定/実個人環境は変更なし。
- 最終独立レビューは一次担当に修正と配布差分を渡して実施中。開始前hashとの比較で削除なし、変更は計画の文書/最小配布修正/関連記録の範囲内。

### 完了記録

- 最終独立レビュー: PASS（public_readiness_review、Sol6.1/high）。AC1–AC8すべて充足。一次の必須2件と更新経路の改善は解消、修正巡1回。
- レビュー独立確認: check:docs 167文書/788参照・欠落0、git diff --check成功、standalone/plugin全ファイル一致、最終tarball主要6ファイルのbyte一致、対象外TASK/benchmarks/状態ファイル/Raycast実行sourceの非混入。全体158件PASSと修正後package1件PASSの証拠を照合。
- 主成果物: [README](../../../README.md)、[文書索引](../../README.md)、[導入ガイド](../../guides/installation.md)、[Chrome拡張](../../../knowledge/extension/README.md)、[Raycast検索](../../../integrations/raycast-knowledge/README.md)、[検証記録](../../../VALIDATION.md)。
- 今回の変更は公開入口・目的別ガイド・保守文書・テンプレートと、help/配布/リンク検証の最小修正。既存未コミット変更は保持し、削除なし。commit IDは新規なし。外部公開/push/ライセンス変更/実ホーム導入なし。
- 制約: 実施はmacOS arm64 / Node26.10。今回のNode22再実行、Windows/Linux/別PC実機、実Chrome/Raycast/GitHub/Codex検出、LaunchAgent再ログイン、長期効果は未検証。現行ガイドの可読性とローカル配布整合が今回の完了範囲。
- ユーザーの成果物評価は未受領。テスト/レビューPASSをユーザー評価や長期改善効果に置き換えない。

- 後続: [npmのみの導入・更新](npm-distribution.md)。仕様v2（GitHub Packages非公開）・N1–N4の準備完了、実配布は別工程。完了済みの本計画と承認範囲を分ける。
