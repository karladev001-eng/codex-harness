# Codex Harness

Codexで仕様を共有し、実装・独立レビュー・制作の改善を進めるための実行手順とローカル補助ツールです。保存した資料を必要な分だけ検索・取得し、次の作業へ引き継げます。

## できること

- **仕様と承認** — 実装前に範囲・受入条件を示し、UIには視覚モックを添えます。
- **実装と独立レビュー** — 担当へ必要な情報だけを渡し、Git worktreeで独立したコード作業を隔離します。
- **Claudeへの相談** — 開かれたアイデア、重要な判断、提案の批評で必要な役割を選び、Codexが助言を統合します。
- **改善ループ** — UI・文書へのフィードバックを、用途を限った候補・制作指針として次回へ使います。
- **ナレッジベースと検索** — 保存した本文・メモ・画像・説明から少数の候補を探し、必要な箇所だけ読みます。
- **再利用可能な6スキル** — ルール・担当・調整手順の作成、構成の確認、仕様計画とスライド制作を個別に使えます。

```text
仕様・モック → 明示承認 → 実装 → 独立レビュー → 統合・検証
     ↑                保存した判断・資料・制作指針を次回に参照
```

Codexが手順を読み、利用可能なツールで担当の起動やレビューを行います。常駐の自動実行サービスではなく、CLIが承認やモデル起動を機械的に強制するものでもありません。

## 自分に合う使い方を選ぶ

| 使い方 | 向いている用途 | 導入と次に読む資料 |
| --- | --- | --- |
| ハーネス本体 | 仕様・分業・レビュー・改善を通して使う | [導入ガイド](docs/guides/installation.md)。個人用スキルとAGENTSの入口を登録 |
| スキルのみ | 必要なルール、担当、計画を作成・確認する | [既定5スキルと任意追加の一覧](authoring-skills/README.md)と[単独導入](authoring-skills/INSTALL.md)。本体を有効化しない |

### 関連ツール

| ツール | できること | 独立した紹介・説明・導入 |
| --- | --- | --- |
| Chrome拡張 | 表示したページの資料とメモを収集・保存する | [Chrome拡張ガイド](knowledge/extension/README.md)。macOS/Windows向け |
| Raycast検索 | 利用者が保存資料を検索し、元ページを開く | [Raycast検索ガイド](integrations/raycast-knowledge/README.md)。macOS向け |

どちらも個別に導入します。本体の必須依存ではなく、本体installによるChrome/Raycastへの自動登録も行いません。連携先は[共通Knowledge基盤](knowledge/README.md)です。

## 必要な環境

本体にはNode.js **22以上**・npmと、スキルに対応したCodexが必要です。コードの隔離にはGit、分業にはサブエージェント・モデル指定・担当別作業場所を扱えるホストを使います。実行時の追加npm依存、Python、利用者側のTypeScriptコンパイルは不要です。

Knowledgeの同期にはGit・GitHub CLIと設定済みの非公開リポジトリ、説明生成にはログイン済みCodex CLIを追加で使います。利用権とモデル候補はホストごとに確認します。macOS以外の実機状況は[検証記録](VALIDATION.md)を参照してください。

<a id="別のpcに導入する"></a>

## クイックスタート

2026-10-10にGitHub Packagesへ非公開npm版0.4.2を配布しました。**0.4.3では既定5スキルと任意追加のcodex-slide-planを収録します。** registryからの取得には指定版の配布完了とpackageアクセス権が必要です。各PCで[初回認証](docs/guides/installation.md#github-packagesの初回認証)を済ませ、ホームなどpackage.jsonのない場所から次の1コマンドを実行します。初回導入と更新は同じコマンドです。

`codex-slide-plan` は任意追加スキルです。本体install/updateと指定なしのauthoring操作では配置・更新・削除しません。0.4.3のnpmパッケージまたはtgzから `--skill codex-slide-plan` で単独導入します。[別PC向けの導入手順](authoring-skills/INSTALL.md#codex-slide-planを任意追加する)を参照してください。

```sh
npm exec --yes --prefer-online --registry=https://npm.pkg.github.com --package=@karladev001-eng/codex-harness@latest -- codex-harness install
```

`latest`は配布者が指定する安定版です。取得したCLIが本体を `~/.agents/skills/codex-harness` にコピーし、`$CODEX_HOME/AGENTS.md`（未設定なら `~/.codex/AGENTS.md`）へ恒久runtimeの入口を追加します。既存の指示・設定・制作記憶を保持します。同版は `unchanged`、未編集の旧版は更新します。npm cacheを消した後も導入先runtimeを使えます。

Claude Codeでは同じコマンドに `--host claude` を付けると、プラグイン `harness` として導入します（[Claude Codeに導入する](docs/guides/installation.md#claude-codeに導入する)）。設定と制作記憶はCodexと共有します。

現在使える[ローカルtarball経路](docs/guides/installation.md#受け取ったローカルtarballから導入)も維持しています。認証・確認・版固定・解除・PowerShell・競合対応は[導入ガイド](docs/guides/installation.md)、clone/cdからの開発手順は[CONTRIBUTING](CONTRIBUTING.md)へ。ソースcheckoutの `private: true`・`UNLICENSED` を維持し、配布用stagingだけにGitHub Packages向けmanifestを生成します。非公開npm配布を行い、一般公開・ライセンス変更は行っていません。

## 最初の依頼

導入後は新しいCodexチャットで、対象プロジェクトを開いて依頼します。

> この機能を追加したいです。まず仕様と受入条件を説明してください。画面変更があるのでモックも提示してください。

> 今後の社内報告は結論から始めてください。今回の修正と、次回にも使う制作指針を分けて扱ってください。

> 保存資料から「カード」の例を3件探し、必要な本文と画像を確認して、出典と取得時点を示してください。

## スキル一覧

| スキル | 用途 |
| --- | --- |
| `create-rulebooks` | 継続して使う規則をMarkdownにする |
| `create-subagent` | 再利用可能な担当定義を作る |
| `create-harness` | 規則・担当・ワークフローを最小の索引でつなぐ |
| `inspect-harness` | 既存の構成を読み取り専用で確認する |
| `codex-html-plan` | 仕様・モック・未解決事項を単一HTMLで提示する |
| `codex-slide-plan`（任意追加） | 話の流れ、発表原稿、出典とデザイン案をHTMLスライド・レビューにまとめる |

呼出し例と成果物は[スキル一覧](authoring-skills/README.md)を参照してください。

Claude連携の[consult-claude](plugins/codex-harness/skills/harness/consult-claude/SKILL.md)は本体に同梱されます。Claude CLIと既存ログインが必要です。activeかつdelegation ONの親が使用条件を判定し、`「Claudeにも独立した案を出してもらって」`、`「この設計をClaudeに批評してもらって」` と明示しても使えます。`「今回は外部相談を使わないで」` を優先します。本体install/updateでは同梱資材を更新し、plugin版では個別スキルとしても公開します。CLI診断は `node "<導入先>/consult-claude/scripts/consult.mjs" --check`、モデル指定は必要なときだけ行います。外部へ渡すのはCodexが選んだ必要な文脈だけで、Claudeにプロジェクトの読書きやツール実行をさせません。

## 詳しい使い方

<a id="動作と設定"></a>
<a id="作業の流れ"></a>
<a id="制作フィードバックから学ぶ"></a>
<a id="githubで制作の記憶を共有する"></a>
<a id="記録とpc間の引継ぎ"></a>
<a id="更新削除"></a>

- [設定](docs/guides/configuration.md)：機能のON/OFF、モデル、保存先
- [作業の流れ](docs/guides/workflow.md)：仕様・承認・担当・レビュー・引継ぎ
- [改善ループ](docs/guides/improvement-loop.md)：フィードバック、指針、訂正・忘却、GitHub共有
- [ナレッジベース](docs/guides/knowledge-base.md)：保存形式・認証・同期・取得版と鮮度
- [保存資料の検索](docs/guides/search.md)：候補→カード→本文・画像の段階取得
- [トラブルシューティング](docs/guides/troubleshooting.md)：診断と競合・未送信への対応
- [文書索引](docs/README.md)：利用者・開発者・保守者ごとの入口

## 対応状況

ローカルCLI、6スキル、改善記録、Knowledgeの同期・文字検索・本文/画像取得、Chrome拡張、Raycast検索の実装があります。検証は[VALIDATION.md](VALIDATION.md)に日付と対象を分けて記載します。利用枠削減、長期的な制作改善、すべてのOS・別PCでの動作は確認済みとは扱いません。ベクトル意味検索、独自の使用量監視やcompact API、会話削除は実装対象外です。早期compactは配布スキルの指示ベース運用で、実行にはホストの正式な機能が必要です。

<a id="開発検証"></a>
<a id="参考"></a>
<a id="chromeから資料を保存する"></a>

## 開発・出典・ライセンス

開発は[CONTRIBUTING.md](CONTRIBUTING.md)、配布物は[リリース手順](docs/maintainers/releasing.md)、将来公開時の判断は[公開前の整理](docs/maintainers/publication.md)を参照してください。[SPEC.md](SPEC.md)は実装仕様、[ADR](docs/adr/0001-portable-skill-harness.md)とタスク記録は設計・開発の履歴です。

全体への利用ライセンスは未付与です。`codex-html-plan`のApache-2.0由来部分など、個別の出典とライセンスは[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)に分けて示します。

### 必要な手順だけ読む

active時は[短い入口](plugins/codex-harness/skills/harness/SKILL.md)のYes/No表を各行独立に判定し、該当する本文から必要な詳細へ進みます。複合依頼では複数Yesです。純相談・Web調査には実装工程を追加せず、範囲や版が変わったら再判定し、要約で失った内容は再確認します。人向けの[チャート](plugins/codex-harness/skills/harness/references/routing/chart.md)と[旧規則の対応表](plugins/codex-harness/skills/harness/references/routing/rule-map.md)もあります。図は入口表から生成し、配布には参照本文をすべて同梱します。

読込量の比較は `node scripts/context-routing.cjs --write`、生成物の一致確認は `node scripts/context-routing.cjs --check`。開発checkoutの `benchmarks/context-routing.md` とJSONには入口単体/依頼別の文書量、範囲・前提・SHA-256を残します。これは会話トークン・利用枠・速度の測定ではありません。
