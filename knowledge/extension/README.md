# Chromeから資料を保存する

Windows/Mac向けのChrome MV3拡張です。閲覧中の通常ページ、YouTube、GitHub、Xから取得できた本文・参照・不足と、ユーザーメモ・任意の画像/HTMLを保存します。資料を集める独立ツールで、Codex Harnessの導入や有効化は必須ではありません。

```text
Chromeパネル → 拡張の送信待ち → Native Messaging → PCへ耐久保存
                                            → 設定した非公開GitHubへ送信
```

取得内容と制作指針は別です。保存メモから好みへ自動転記しません。同期・文字検索・説明生成は[共通Knowledge基盤](../README.md)へ。

## 前提条件と配布物

Node.js 22以上とChromeを用意します。GitHub送信を使う場合はGitHub CLIと[専用非公開repoの設定](../../docs/guides/knowledge-base.md#保存先と認証)が必要です。Native登録はmacOS/Windows向けで、Linuxへの登録をCLIは実装していません。Windows実機の検証状況は[検証記録](../../VALIDATION.md)へ。

## 配布と準備

`npm run build` / `npm pack` のtarballを展開し、`package/dist/knowledge` を移動しない恒久フォルダへ置いてください。Chromeへ渡すのはその `extension/` フォルダです。Node 22+とGitHub CLIを各PCへ導入し、`gh auth login --hostname github.com` を済ませます。GUI起動時にPATHが短くても動くよう、登録launcherはNodeの絶対パス、設定はghの絶対パスを使います。ghの既存認証を利用し、トークンを拡張/KB/ツールのログへ書きません。

Chromeの `chrome://extensions` でデベロッパーモードを有効にして「パッケージ化されていない拡張機能を読み込む」から `extension/` を選びます。表示された32文字の拡張IDを記録してください。各PCのIDが違う場合は各PCで登録します。常時の全サイトアクセス権、遠隔コード、追加npm依存は要求しません。

保存先は**専用の非公開GitHubリポジトリと既存branch**です。リポジトリ作成はこのツールが行いません。空のbranchはGitHubのREADMEなどで初回commitを作ってください。初期化前に許容する既存ファイルはREADME.mdと.gitignoreのみ。他用途のリポジトリへ混ぜません。

以下のID/パス/repoは実値に置き換えます。`KNOWLEDGE_HOME` 未指定時の状態は `~/.codex/knowledge/`（Windowsではユーザーホーム配下）です。

macOS:

```sh
node "/absolute/path/knowledge/cli.cjs" register --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --output "/absolute/path/knowledge-host"
node "/absolute/path/knowledge/cli.cjs" configure --repo OWNER/PRIVATE_REPO --branch main --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --gh /opt/homebrew/bin/gh
```

Windows PowerShell:

```powershell
node "C:\Tools\knowledge\cli.cjs" register --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --output "C:\Tools\knowledge-host"
node "C:\Tools\knowledge\cli.cjs" configure --repo OWNER/PRIVATE_REPO --branch main --extension aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --gh "C:\Program Files\GitHub CLI\gh.exe"
```

`configure` が返す `library_id` を控え、**既存KBへの接続では、2台目でも同じPCの新stateでも、同じrepo/branchに既知の `--library UUID` を指定**します。再設定でlibrary省略時はそのPCの既存libraryを保持します。repo/branchを設定できるのはPCのCLIのみ。ページや拡張から変更できません。

## Native Messagingの登録

`register` は既定ではlauncher/manifest生成だけです。Nodeと状態ディレクトリを絶対パスで埋め込みます。Macはシェルlauncher、Windowsはcmd launcherです。Windowsのlauncherパスに `% ! " & | < > ^` を含む場合は生成を拒否します。配布フォルダ/Nodeを移動したら再生成してください。

確認後、同じregisterコマンドへ `--install` を加えると、Macは `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.codex_harness.knowledge.json` へmanifestをコピーし、Windowsは `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.codex_harness.knowledge` の既定値へmanifest絶対パスを登録します。既存登録は生成ファイル/呼出originを変える前に拒否し、登録失敗時は以前の生成ファイル/呼出originを復元します。既存登録の更新は手動確認が必要です。別のChromeプロファイル/Chromium/Chrome for Testingには対応する登録先を別途用意してください。

保存済みの拡張IDがある場合、`--install` の有無や出力先に関係なく別IDへの変更を拒否します。同じIDの `register`（`--install` なし）ならNodeパス等のlauncher再生成が可能です。拡張IDを変更する場合は、実行中のhostがないことを確認し、状態をバックアップしてからMacの登録manifest/Windowsの登録キーを手動で削除し、状態ディレクトリの `native.json` だけを削除してください。その後、新IDでregister/configureを行い、生成物を確認してinstallします。`operations/` の送信待ち・receiptや `config.json` は削除しません。library_idを維持してください。

生成manifestの `allowed_origins` は指定した拡張一つだけでwildcardなし。hostも呼出originを照合します。先にregisterだけ行えば、GitHub未設定でもPCへ送信待ちを保存できます。

アンインストールはChromeの拡張を削除し、Macの上記manifestまたはWindowsの上記レジストリキーを確認して削除します。ローカル状態/未送信資料は自動削除しません。

## 初回保存と再送

<a id="保存と再送"></a>

1. 通常のWebページで拡張アイコンを押すか、MacはCommand+Shift+Y、WindowsはCtrl+Shift+Yで右下の角丸パネルを開きます。幅320px・余白16pxの非モーダル表示で、ページを暗くせずメモへフォーカスします。キーは `chrome://extensions/shortcuts` で変更できます。開くだけではアップロードしません。
2. メモを必要に応じて入力し「保存する」またはCmd/Ctrl+Enterで保存します。IME変換中のEnterでは保存しません。タグ・画像/HTMLオプション・本文・取得量・不足は詳細を開いて確認できます。画像/HTMLは既定で有効、変更を記憶して再取得します。メモは再取得で消えません。ページ本文とメモは別ファイルへ保存します。
3. 先に拡張storageへoperationを保存し、次にPCへ耐久化して確認応答。その後にGitHub送信を試みます。「PCへ保存済み・GitHub送信待ち」と「GitHubへ保存しました」を区別します。

新規保存先のconfigureはPC設定のみです。初回GitHub保存成功で `kb.json` を初期化した後に `pull --force` を実行すると検索できます。[新規/既存KBの共通手順](../../docs/guides/knowledge-base.md#保存先と認証)を確認してください。

GitHub保存完了は小さな完了表示へ切り替わり、約800ms後にパネルが自動で閉じます。PC送信待ち・保存中・エラーでは自動で閉じません。完了後に開き直したり新しいメモを開始した場合、前の自動close予約は取り消されます。送信中にパネルを×またはEscで閉じてもworkerは続行し、badgeの「…」（送信中）/「✓」（保存済み）/「!」（待ち・エラー）で確認できます。開いたままコマンドを繰り返すと同じメモへフォーカスし、閉じて開き直しても未保存のメモを保持します。保存済み表示を確認した後のコマンドでは、新しいメモの入力を始められます。手動で閉じると可能なら元のページ要素へフォーカスを戻します。自動closeではパネル内にフォーカスがある場合だけ元の要素へ戻し、ページの別要素を操作中ならフォーカスを動かしません。再び開くと拡張の送信待ちや同じページの未確認結果を表示します。一度確認した完了を次の保存結果として表示しません。サービスworker再起動で応答が失われても、送信待ちの同じoperation IDを再送します。


接続不能/応答紛失で拡張に残った一件は「拡張の送信待ちを再送」。PC側に渡ったpendingは次のCLIで確認/明示再送します。常駐・自動再送はありません。

```sh
node "/absolute/path/knowledge/cli.cjs" status
node "/absolute/path/knowledge/cli.cjs" retry
# GitHub未設定時に取得したpendingを、現在の設定先へ明示的に割り当てる
node "/absolute/path/knowledge/cli.cjs" retry --bind
```

`--operation UUID` で再送を一件に限定できます。既に保存先が割り当てられたpendingは、設定変更後に別repo/branch/libraryへ自動転送しません。元設定へ戻して再送してください。statusは内容/認証情報を出力しません。

operation IDは拡張/host再起動や応答紛失でも同じものを再利用します。明示的にページを再取得して保存すると新しいcaptureになり、以前のcapture/メモを上書きしません。item IDは正規化URLのSHA256先頭32桁で日付/PCに依存しません。YouTubeはvideo ID、Xは対象status、GitHubはrepoを正規化します。通常ページはfragmentだけ除去します。

## 更新・解除

ローカルtarball利用者は、新版アーカイブの `dist/knowledge/` 全体をこれまでと同じ恒久配置へ更新し、`chrome://extensions` でその `extension/` の再読み込みを押します。受取側でnpm buildは不要です。

checkout利用者は更新したcheckoutで `npm run build` を実行し、`chrome://extensions` で読み込み元の再読み込みを押します。sourceから読み込んだ場合は `knowledge/extension/`、ビルド出力からなら `dist/knowledge/extension/` が読み込み元です。ページも一度リロードして、新しいパネルを開いてください。ページリロードでは未保存のメモ・タグは消えるため、再読み込み前に内容を控えてください。保存できる場合は先に保存しても構いません。PCツールの再登録は不要です。

CLIも更新する場合は新しい配布物の全ファイルを恒久配置へ反映します。Node/CLI/state/launcherのパスが変わればregisterで再生成し、既存登録を手動確認します。単なる同一パスの拡張更新でPC登録をやり直す必要はありません。

解除はChromeの拡張を削除し、macOSでは `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.codex_harness.knowledge.json`、Windowsでは `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.codex_harness.knowledge` を確認して対象登録だけ削除します。ローカル状態・未送信資料・GitHub資料は自動削除しません。必要なretryを先に行い、取得内容の削除は別に判断します。

## 取得範囲と容量

- 画像は表示範囲JPEG（quality55）、最大base64 1.5MB。全ページ撮影はしません。取得前後のactive tab・URL・document timeOriginが変わったら保存を中止します。
- HTMLは本文領域の構造のみ。スクリプト、全属性、CSS、フォーム、iframe、埋込、外部資源は除去します。HTMLを完全再現/実行可能アーカイブと扱いません。保存HTMLは引き続き不信なデータとして扱ってください。
- 通常本文は表示DOMで最大UTF8 200KB、HTML200KB、選択40KB。切詰め/未取得を記録します。hostの総入力上限4MiB、出力64KB（Chrome上限より小さく設定）。メモは保存前にUTF8 50KBまで検証し、超過時は短く編集して再保存できます。拡張queueは一件に制限。storage容量不足ではPCに送信しません。
- YouTubeは表示済み概要/文字起こしと注目時刻。文字起こしをユーザーが開く必要があります。動画本体/未表示字幕は保存しません。
- GitHubはhostのgh読取APIでrepo情報/READMEを優先。API失敗時は表示DOMのREADME範囲と不足を保存します。READMEのblob SHA/path/取得時刻を記録します。全repo cloneはしません。
- XはURLのstatus IDと最初の投稿日時リンクが一致するarticle一件。引用/おすすめを本文へ混ぜず、判断不能なら本文不足。サイトDOM変更によって不足になる場合があります。
- chrome://、Chrome Web Storeなどの制限ページではツールバーのpopupへ切り替え、取得できないことを表示します。通常のWebページで開き直してください。タブ移動/リロードでは取得し直してください。
- パネルはユーザー操作後にactiveTabのisolated worldへ注入し、closed ShadowRootでページCSS/JSとの干渉を抑えます。ページからのpostMessage橋渡しやweb-accessible iframeは使いません。workerは拡張sender・最上位frame・document・tab・sessionを照合します。HTMLはパネル自身のnodeを除外し、再取得時の画像はパネルを一時非表示にして2描画フレーム待ってから取得します。保存直前にもページidentityを再確認します。SPA内のURL移動後は拡張アイコン/コマンドで開き直して現在ページを取得します。同じoriginの同一documentにある未送信メモ・タグ・保存オプションは引き継ぎ、勝手に保存しません。取得失敗したパネルの再表示でも再取得します。sender URLは同originを照合し、現在URL・timeOrigin・session tokenはdocumentIdで指定したisolated worldのlive probeで検証します。

hostのlockが残ったら、実行中のhost/retryがないこととoperation JSONを確認し、状態をバックアップしてからlockディレクトリだけを手動で扱います。未知lock/壊れたJSONをツールは消しません。成功receiptを含むローカルoperationは再送防止のため保持するので容量は手動管理です。ログへ生のページ本文やgh stderrを出しません。

## 検証と設計の根拠

隔離したfake transport・DOM fixture・mock APIの回帰試験と、現機での確認を分けます。[Knowledge運用の検証範囲](../../docs/guides/knowledge-operations.md#検証範囲)・[VALIDATION](../../VALIDATION.md)を参照してください。実サービスの現在のDOMやすべてのページの網羅取得を保証するものではありません。

[保存ADR](../../docs/adr/0004-chrome-knowledge-capture.md)・[同期ADR](../../docs/adr/0005-knowledge-sync-analysis.md)・[Knowledge索引](../README.md)
