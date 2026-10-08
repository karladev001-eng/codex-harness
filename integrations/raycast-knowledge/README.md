# Raycast 保存資料を検索

既存Knowledge CLIのローカルsnapshotから、本文・生成説明・メモ・タグを検索する独立Raycast拡張です。空欄では最近の資料を最大50件表示します。検索方式とGitHub認証は既存CLIを使用します。

## 前提条件

この拡張はmacOS向けの独立ツールです。Codex Harness本体やChrome拡張の導入は必須ではありません。既存のKnowledge CLIと同じ保存先・snapshotを使います。

## checkoutから導入

必要: Raycast、Node.js **22.22.2以上**（使用するRaycast APIの要件）、設定済みKnowledge CLI、Git・既存のgh認証。通常は[CLIの共通設定と最初のpull](../../docs/guides/knowledge-base.md#保存先と認証)を済ませてください。新規保存先は初回GitHub保存成功後にpullします。既存KBへ新しいstateで接続する場合は、既知library UUIDを指定してconfigureしてからpullします。CLI未設定でも拡張は状態を表示します。

```sh
cd "/path/to/harness/integrations/raycast-knowledge"
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

本体tarballにはRaycastの実行ソース/依存を同梱しません。この手順は手元のcheckoutから別に導入します。利用可能なRaycast Store公開を前提にしません。

`npm run dev` がRaycastへ開発拡張を登録します。コマンド「保存資料を検索」を開いてください。再導入も同じディレクトリで `npm ci` と `npm run dev` を実行します。build/developは `~/.config/raycast/extensions/codex-knowledge` へ成果物を生成します。開発監視の停止はターミナルのCtrl-Cです。ローカル登録はRaycastのExtensions設定で確認できます。

既定パスは次のとおりです。別PCではRaycastのActions（⌘K）の「拡張設定を開く」から各絶対パスを変更できます。`~/` も使えます。

- Node: `/opt/homebrew/bin/node`。存在しない場合 `/usr/local/bin/node`。
- CLI: `~/.agents/skills/codex-harness/knowledge/cli.cjs`
- State: `~/.codex/knowledge`

CLIを別の場所へ導入している場合、その `knowledge/cli.cjs` を設定してください。gh認証はCLI側の既存設定を使います。

## 初回利用と操作

- 入力すると250ms待って検索します。選択すると右側に説明、メモ抜粋、一致箇所、タグ、出所と取得日時が表示されます。
- Enter: 選択資料のHTTP(S)元ページを開く。
- ⌘C: 元URLをコピー。
- ⌘R: 手動同期（`pull --force`）。
- ⌘K: Actionsから「拡張設定を開く」を選択。

未設定、未同期、同期中/busy、同期失敗/offline、CLIエラーを画面に表示します。同期失敗でもCLIにsnapshotがあれば検索を続けられます。前回確認から300秒以内の検索はCLIが同期確認を省略するため、「キャッシュ表示」と最終成功日時を表示します。失敗後の省略もofflineとして表示し、失敗時刻を最新日時にしません。CLI実行自体が失敗した場合は表示済みカードを保持し、エラーを表示します。

資料のMarkdownは文字としてエスケープして表示し、画像やHTMLを外部取得しません。元ページの閲覧は明示的なEnter操作です。検索と手動同期ではAI呼出、説明生成、保存、GitHub書込みを追加しません。既存スケジュール・好み・原文も変更しません。

## 更新・解除

同じcheckoutの拡張ソースを更新し、`npm ci`・`npm run typecheck`・`npm test`・`npm run build`・`npm run dev`を再実行します。開発監視の停止はCtrl-Cで、拡張の解除とは別です。

登録解除はRaycastのExtensions設定で対象「保存資料」を選び、削除します。Knowledgeの設定・ローカルsnapshot・送信待ち・GitHub資料は削除しません。本体uninstallもRaycastの登録解除を行いません。

## 検証

`npm test` はシェルを使わないCLI境界、HTTP(S) URL制限、Markdown画像の無効化、古い検索応答の抑止、offline cache・状態表示・不正応答・パスを検証します。`npm run typecheck` と `npm run build` はインストール済みRaycast APIの型とmanifest/buildを検証します。実機の登録・検索・Enter操作は別途Raycastで確認してください。

[Knowledge索引](../../knowledge/README.md)・[検索方式と取得](../../docs/guides/search.md)・[出典とライセンス表記](../../THIRD_PARTY_NOTICES.md)
