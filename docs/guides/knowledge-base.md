# ナレッジベース

保存した資料を、元URLと取得時点を保って必要なときに参照する基盤です。全文を常にCodexへ投入せず、[文字検索と段階取得](search.md)から利用します。[Chrome拡張](../../knowledge/extension/README.md)は資料を入れる別ツール、[Raycast](../../integrations/raycast-knowledge/README.md)は人が検索する別ツールです。

## 保存される情報

| 情報 | 内容と使う際の区別 |
| --- | --- |
| 原文 `content.md` | 取得できた表示本文。現在のWebページ全文とは限らない |
| メモ `note.md` | ユーザーが入力した記録。原文・生成説明と区別する |
| 取得詳細 `capture.json` | 取得時刻、対象範囲、切り詰め、未取得・不足 |
| 任意の画像/HTML | 表示範囲JPEGと除去済み構造HTML。全ページ再現ではない |
| 生成説明 `analysis.json` | Codexが別工程で生成した短い説明。原文や画像を実際に見たことの代わりにしない |

資料を保存したこと、何回使ったかを好みとは見なしません。継続的な制作指針はユーザーの根拠をもとに[改善ループ](improvement-loop.md)で管理します。

## ローカル保存とGitHub同期

状態は `KNOWLEDGE_HOME`、未指定なら `~/.codex/knowledge`。`--state` に絶対パスを渡すと別の状態領域を使えます。`CODEX_HOME` の変更とは別です。

Chromeの保存では先に拡張storage、次にPCの `operations/` へ耐久保存し、その後にGitHubへ送信を試みます。PC保存完了とGitHub送信完了は別です。PC送信待ちは検索用snapshotへ混ぜません。GitHub未設定で保存した操作は、設定後に `retry --bind` で明示的に送信先を割り当てます。

## 保存先と認証

各PCにNode.js 22以上、GitHub CLI、検索用同期にはGitを用意します。GitHub.comに**専用の非公開リポジトリと既存branch**を用意してください。初期化前に許容する既存ファイルはREADME.mdと.gitignoreのみです。CLIはリポジトリを作成せず、他用途へ混ぜません。

```sh
gh auth login --hostname github.com
```

tokenは設定やログへ書かず、そのPCのgh認証を使います。CLIへghの絶対パスを指定します。Chromeを使う場合は実際の拡張IDを指定します。現行の共通設定形式は、Chromeを登録しないCLI利用でも32文字の `extension_id` 値を必要としますが、Chromeの導入・Native登録は不要です。下の `a` 32文字は形式例です。

### 新しい保存先を初期化する

以下は専用repo/branchを初めて使う設定です。`configure` はPC内の設定だけを書き、GitHubの `kb.json` はまだ作りません。

macOS/Linux：

```sh
node "/absolute/path/knowledge/cli.cjs" configure --repo OWNER/PRIVATE_REPO --branch main --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --gh "/absolute/path/gh"
```

Windows PowerShell：

```powershell
node "C:\Tools\knowledge\cli.cjs" configure --repo OWNER/PRIVATE_REPO --branch main --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --gh "C:\Program Files\GitHub CLI\gh.exe"
```

`configure` の `library_id` を控えます。[Chromeで初回保存](../../knowledge/extension/README.md#初回保存と再送)を行い、「GitHubへ保存しました」を確認してから次を実行します。初回capture送信の成功時に `kb.json` とlibraryを初期化します。PC送信待ちなら先にretryを完了します。

```sh
node "/absolute/path/knowledge/cli.cjs" pull --force
```

PowerShellではCLIのパスを `C:\Tools\knowledge\cli.cjs` 等に置き換えます。初回GitHub保存前のpullは未初期化エラーになります。

### 既存の保存先へ接続する

2台目、または同じPCの新しいstateから既存KBへ接続する場合は、初期化したPCのconfigure出力等で確認した既知library UUIDを指定します。

macOS/Linux：

```sh
node "/absolute/path/knowledge/cli.cjs" configure --repo OWNER/PRIVATE_REPO --branch main --library UUID --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --gh "/absolute/path/gh"
node "/absolute/path/knowledge/cli.cjs" pull --force
```

Windows PowerShell：

```powershell
node "C:\Tools\knowledge\cli.cjs" configure --repo OWNER/PRIVATE_REPO --branch main --library UUID --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --gh "C:\Program Files\GitHub CLI\gh.exe"
node "C:\Tools\knowledge\cli.cjs" pull --force
```

新しいUUIDで既存KBを初期化し直さないでください。再設定でlibraryを省略するとそのPCの既存値を保持します。repo/branchはPCのCLIからだけ設定でき、Webページや拡張から変更できません。明示的な設定後の保存・retryはGitHubへ書き込みます。

## GitHubの保存形式と保護

`kb.json` はformat/schema_version/library_id、`schemas/capture-v1.json` は入力スキーマ。`items/<item-id>/metadata.json` と `note.md` は初回保存の内容で保持し、各再保存の最新タイトル/タグ/メモは `captures/<operation-id>/metadata.json` と `note.md` にあります。capture.jsonには取得日時・取得範囲・不足、content.mdには原文/見出し/選択、任意でstructure.html/screenshot.jpg。`operations/<operation-id>.json` が再送receiptです。後処理で生成する `analysis.json` はこれらの保存ファイルやreceiptを変更しません。

入力の保存はGit Data APIでblob群→tree→commit→ref更新を行い、force=falseで更新します。private・既存branch・schema・libraryを検証し、他PCの変更を取り込んだheadから再試行します。曖昧な応答はreceipt/保存ファイルで確認し、3回で確認できなければpendingを保持します。未知schema、capture衝突、branch保護による書込拒否も停止理由になります。

item IDは正規化URLのSHA256先頭32桁です。同じ資料を再取得して保存すると新しいcaptureになり、以前のcapture/メモを上書きしません。operation IDを再送では維持することで応答紛失後の二重保存を避けます。

## 読取版と鮮度

`pull` は独立したbare Git領域でfetchし、schema/library/repositoryを検証して有効snapshotをrenameで切り替えます。作業checkoutや `operations/` は変更しません。通常のpull/search/card等は前回確認試行から300秒以内なら同期確認を省略し、明示的な `pull --force` で再確認できます。

通信失敗でも以前のsnapshotから読むことがあります。`offline/busy/throttled/not_checked`、最後の成功 `checked_at`、snapshot `commit`、capture ID・取得時刻を確認してください。失敗時刻を成功した鮮度とは扱いません。read/imageにはblob SHAも付きます。保存版を読んでも、現在ページや未取得動画・全コードを見たことにはなりません。

## 初回利用・更新・解除

同期後に「保存資料からカードの例を3件探して」と依頼します。CLIでの候補→本文/画像の例は[検索ガイド](search.md)へ。説明の生成は別途[Knowledge運用](knowledge-operations.md)で設定します。検索・同期だけではAI生成を追加しません。

本体同梱CLIは本体installの再実行で更新します。独立 `dist/knowledge` は恒久配置を更新し、絶対パスが変わる場合はlauncher/hook/Raycast設定を確認します。各ツールの登録解除は[Chrome](../../knowledge/extension/README.md)と[Raycast](../../integrations/raycast-knowledge/README.md)で行います。hook・毎時実行の解除は[Knowledge運用](knowledge-operations.md)へ。本体uninstallだけでは外部登録とKnowledge状態は削除されません。送信待ち・snapshot・共有先資料の削除は自動では行いません。

[Knowledge索引](../../knowledge/README.md)・[保存ADR](../adr/0004-chrome-knowledge-capture.md)・[同期ADR](../adr/0005-knowledge-sync-analysis.md)
