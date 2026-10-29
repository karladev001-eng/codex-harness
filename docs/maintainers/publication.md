# 公開に関して残る判断

リポジトリの可視性は公開（2026-10-29。閲覧用で、利用ライセンスは未決定）です。ユーザーの承認に基づく変更で、全体を公開してよいという確認済み判定やsecret監査の完了とは分けます。Release公開、npm publish、ライセンス変更は行いません。npmパッケージはGitHub Packagesの非公開配布のままです。

## 公開対象の候補

| 対象 | 役割・公開前に確認する点 |
| --- | --- |
| README、目的別ガイド、CONTRIBUTING、テンプレート | 利用者と開発者の入口。個人パスや未確定の受付先を例へ残さない |
| src、scripts、plugins、authoring-skills | ソース・手順。実行配布物はdistから生成する |
| knowledge、integrations/raycast-knowledge | 共通CLIと独立ツール。依存・OS・登録先を分ける |
| tests、fixtures、package/lockfile | 再現性。最小fixtureを使い実資料/認証情報と区別する |
| 同梱LICENSE/UPSTREAM、THIRD_PARTY_NOTICES | 由来・変更と個別の許諾。全体のライセンスとは別 |
| SPEC、VALIDATION、ADR | 実装契約と日付別の証拠。歴史的な将来計画と現在を区別する |

## 別途判断する履歴・実験成果物

`docs/harness/tasks/`、`docs/harness/previews/`、`benchmarks/`、Git履歴には作業時点のパス、環境、検証結果や提示物があります。公開向け説明の例の一般化とは別に、公開範囲と資料の内容を確認します。今回、一括削除・履歴改変・実個人設定の書換えは行いません。履歴に残す意味のある情報を公開ガイドへ無条件に移さないでください。

## 未決定の公開方針

- リポジトリ全体のライセンスと、各構成部分・Raycastの既存MIT表記の扱い。
- 履歴・実験成果物・スクリーンショットをどこまで公開するか。
- 非公開npm配布先はGitHub Packagesへ確定済み。リポジトリの可視性は公開（2026-10-29）、ライセンスは未決定。Release/プラグイン導入経路、Issueの受付先は別途判断。
- 実データ・認証・権利・依存ライセンスの公開範囲に応じた確認。
- Windows/Linux・別物理PC・ホスト機能の追加検証と表明範囲。

`private: true` と `UNLICENSED`を今回維持します。公開npmへpublish可能とは案内しません。個別ライセンスは[THIRD_PARTY_NOTICES](../../THIRD_PARTY_NOTICES.md)で参照します。ローカルpack成功、独立レビュー成功を全面的なsecret監査・公開可判定と読み替えません。

[ローカル配布](releasing.md)・[検証記録](../../VALIDATION.md)・[文書索引](../README.md)
