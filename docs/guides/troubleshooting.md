# トラブルシューティング

最初に、実行したコマンド、Nodeの版、対象プロジェクトと設定の場所を確認します。本文・認証情報を貼らず、再現に必要なエラーと一般化したパスを記録してください。

## 本体の導入・設定

```sh
node --version
node dist/skill/runtime.js doctor --project .
node dist/skill/runtime.js status --project .
```

上のruntime例はビルド済みcheckout用です。導入済みの場合のmacOS/Linux・PowerShellコマンドは[導入の確認](installation.md#確認)へ。

| 状況 | 確認と対応 |
| --- | --- |
| runtimeがない | checkoutなら `npm run build`。配布物はコンパイル済みdistを使う |
| statusが設定エラー | `.harness.json`と個人settingsの型・schema・未知キーを確認。エラー時に自動有効化しない |
| active=false | enabledと5機能フラグを確認。意図的なOFFを導入失敗と扱わない |
| 更新後も旧モデル | 個人/プロジェクトのmodel pinをstatusで確認。新既定を使う項目だけ上書きを取り除く |
| install/uninstallが編集済み・未所有を拒否 | 内容・所有記録・バックアップを比較。勝手な削除・manifest書換え・自動マージをしない |
| AGENTS.override.mdがある | 既存指示が入口を隠すため停止。元の指示を保持して読込方針を判断する |
| worktreeがdirtyを拒否 | 未コミット変更を保持し直列実行、または利用者が選んだチェックポイントを使う |
| 指定モデルが起動できない | 実際のホスト候補・対応effort・利用権を確認。無断で別モデルへ置き換えない |

## 制作記憶

`preferences read` の `ok/revision/freshness/pending` を確認します。初回remote失敗のnullと、内容なしは別です。cached/stale/pendingを自動適用できるfreshとは扱いません。

writeには直前readのrevisionが必要です。競合はremote内容/SHAを読み、根拠IDを保って再評価します。移行後にGitHub設定を外すと旧localはretiredとなるため、設定を復元して現在の正本を使います。未知lockや破損を削除して回避しません。詳細は[改善ループ](improvement-loop.md)へ。

## Knowledgeと関連ツール

```sh
node "/absolute/path/knowledge/cli.cjs" status
node "/absolute/path/knowledge/cli.cjs" pull --force
```

| 状況 | 確認と対応 |
| --- | --- |
| configured=false | [保存先と認証](knowledge-base.md#保存先と認証)を設定。自動でrepoを作成しない |
| ChromeがPCに接続できない | 拡張ID、Native manifest、Node/CLI/stateの絶対パスと登録先を確認 |
| PC保存済み・GitHub送信待ち | statusでoperation確認、認証/branch/libraryを解決してretry。未割当だけ `retry --bind` |
| 拡張側に一件残る | パネルの「拡張の送信待ちを再送」。同じoperation IDで再送する |
| 検索結果が古い/空 | snapshot・checked_at・freshnessを確認してforce pull。同期失敗と候補なしを分ける |
| busy | 別の同期/生成を確認して後で再実行。未知lockやstateを消さない |
| capture_not_found/image_unavailable | 選択IDと取得不足を確認。別資料へ代替せず不足を示す |
| RaycastのCLIエラー | 拡張設定のNode/CLI/state絶対パスを確認。AI生成やGitHub書込は検索に不要 |
| 定期生成の未完了 | background/last-run.jsonとlaunchctl終了状態、analysis pendingを確認 |

[Chromeガイド](../../knowledge/extension/README.md)・[Raycastガイド](../../integrations/raycast-knowledge/README.md)・[Knowledge運用](knowledge-operations.md)。問題を報告する際は[CONTRIBUTING](../../CONTRIBUTING.md)の再現情報を使います。
