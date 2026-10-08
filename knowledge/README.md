# Knowledge共通基盤

保存資料をPCへ耐久保存し、明示設定した非公開GitHubと同期するNode.js 22以上のCLIです。保存資料は制作指針の記憶とは別に扱います。Codex Harnessから必要箇所を参照するほか、ChromeとRaycastから独立して使えます。

```text
Chrome拡張（個別導入） → Native Messaging → Knowledge CLI → PCの送信待ち
                                                        → 設定済みprivate GitHub
                                                               ↓ Git同期
Codex Harness → Knowledge CLI ← Raycast検索（個別導入） → ローカルsnapshot
```

本体installはKnowledge CLIを同梱します。Chrome拡張の登録やRaycastの登録、GitHub保存先の作成・設定・認証は行いません。

## 目的から選ぶ

| 目的 | 手引き |
| --- | --- |
| 保存内容・保存先・認証・同期を理解する | [ナレッジベース](../docs/guides/knowledge-base.md) |
| Codexから候補・本文・画像を取得する | [保存資料の検索](../docs/guides/search.md) |
| Chromeでページとメモを収集する | [Chrome拡張の紹介と独立導入](extension/README.md) |
| Macで人が保存資料を探す | [Raycast検索の紹介と独立導入](../integrations/raycast-knowledge/README.md) |
| hook・説明生成・毎時実行を設定する | [Knowledge運用](../docs/guides/knowledge-operations.md) |

## CLIの場所

- checkout: `knowledge/cli.cjs`
- tarballを展開した独立ツール: `package/dist/knowledge/cli.cjs`
- 本体の既定導入先: `~/.agents/skills/codex-harness/knowledge/cli.cjs`
- plugin: その `skills/harness/knowledge/cli.cjs`

CLIの隣にある `.cjs` と `schemas/` を一緒に保ちます。移動する場合はNative launcher・hook・Raycastの絶対パス設定も確認してください。CLIのusageはこの索引へ案内します。

## 設定と初回確認

状態は `KNOWLEDGE_HOME`、未指定なら `~/.codex/knowledge`。各コマンドの `--state` でも絶対パスを明示できます。まず次を確認します。

```sh
node "/absolute/path/knowledge/cli.cjs" status
```

`configured=false` は保存先未設定です。検索用snapshotには[共通設定の新規/既存の手順](../docs/guides/knowledge-base.md#保存先と認証)が必要です。新規保存先はconfigure→初回GitHub保存成功→pull、既存KBは既知library UUIDを指定したconfigure→pullの順です。ChromeでPCだけに送信待ちを保存する場合は、GitHub未設定でも[Native登録](extension/README.md#native-messagingの登録)を行えます。

## 以前の案内からの移動先

<a id="配布と準備"></a>
<a id="native-messagingの登録"></a>
<a id="保存と再送"></a>
<a id="取得範囲と容量"></a>

拡張の導入・登録・初回保存・再送・更新・解除・取得範囲は[Chrome拡張ガイド](extension/README.md)へ移しました。

<a id="githubの保存形式と保護"></a>
<a id="エージェントhook同期文字検索説明生成"></a>
<a id="原資料の段階取得"></a>

保存形式は[ナレッジベース](../docs/guides/knowledge-base.md)、段階取得は[検索](../docs/guides/search.md)、hook・生成・共有は[Knowledge運用](../docs/guides/knowledge-operations.md)へ移しました。

<a id="検証範囲"></a>
<a id="macでチャットを増やさず毎時実行"></a>
<a id="raycastから検索閲覧"></a>

隔離試験の詳細と毎時実行は[Knowledge運用](../docs/guides/knowledge-operations.md)、実機を含む検証の読み方は[VALIDATION](../VALIDATION.md)、Raycastは[専用ガイド](../integrations/raycast-knowledge/README.md)を参照してください。
