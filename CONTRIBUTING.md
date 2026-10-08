# 開発・変更提案

まず[README](README.md)で用途、[SPEC](SPEC.md)で実装契約、[文書索引](docs/README.md)で対象機能を確認してください。API、承認手順、モデル既定、所有管理の振る舞いを変える場合は仕様と対応する検証を更新します。

## 開発環境

Node.js 22以上・npm・Gitを用意し、手元のcheckoutのルートで実行します。

```sh
npm ci
npm run build
npm test
node dist/skill/runtime.js --help
```

TypeScriptと型定義は開発依存のみです。ビルドはdistを再生成します。配布用distを直接編集せず、src・pluginsのMarkdown・authoring-skills・knowledgeの対応するソースを変更してください。

Raycastは独立した依存と検証を持ちます。[専用README](integrations/raycast-knowledge/README.md)に従います。root `npm test`だけでRaycast実機の登録や検索を確認したことにはしません。

## 検証の原則

テストは一時ホームと使い捨てGitリポジトリを使い、実個人設定を変更しません。Knowledgeのremoteはfake transportを使い、外部へテスト資料を書き込みません。OS・別PC・モデル起動・Chrome/Raycast実機の確認は自動試験と分けて[VALIDATION](VALIDATION.md)へ記録します。未検証の項目を成功と扱いません。

配布・導入・更新・解除・同梱文書リンクの確認は[ローカル配布手順](docs/maintainers/releasing.md)へ。実ホームへの導入を試験代わりにしません。

## 提案や不具合の報告

リポジトリのIssue/PR機能が利用できる環境では同梱テンプレートを使えます。現時点で公開の受付URLや対応時間は約束していません。提案には目的・対象範囲・期待動作・対象外、問題には実行環境・再現手順・実際/期待結果を記します。秘密・実資料・個人設定を含めず、必要なら一時環境の最小例を添えてください。

PRには変更理由、結果の振る舞い、検証内容と未確認事項、仕様/ADRへの参照を記載します。無関係な整形や履歴の書換えを混ぜず、既存の未コミット変更を保持してください。ライセンス・外部公開の変更は別の判断です。

[出典とライセンス](THIRD_PARTY_NOTICES.md)・[公開前の判断](docs/maintainers/publication.md)
