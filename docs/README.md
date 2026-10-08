# 文書案内

## 使い始める

| 目的 | 読む資料 |
| --- | --- |
| 何ができるかを知る | [README](../README.md) |
| 本体を導入・更新・解除する | [導入](guides/installation.md) |
| スキルを選び、個別に導入する | [5スキル一覧](../authoring-skills/README.md)・[単独導入](../authoring-skills/INSTALL.md) |
| 設定を変える | [設定](guides/configuration.md) |
| 仕様から実装・レビューまで進める | [作業の流れ](guides/workflow.md) |
| 制作フィードバックを次回に使う | [改善ループ](guides/improvement-loop.md) |
| 保存資料と同期の仕組みを知る | [ナレッジベース](guides/knowledge-base.md) |
| 保存資料を検索して必要部分を読む | [検索](guides/search.md) |
| 説明生成・hook・毎時実行を設定する | [Knowledge運用](guides/knowledge-operations.md) |
| 問題を切り分ける | [トラブルシューティング](guides/troubleshooting.md) |

## 関連ツールを使う

- [Knowledge共通基盤](../knowledge/README.md)：本体と関連ツールの連携先
- [Chrome拡張](../knowledge/extension/README.md)：収集・独立導入・初回保存・更新・解除
- [Raycast検索](../integrations/raycast-knowledge/README.md)：Macでの検索・独立導入・更新・解除

## 開発・保守をする

- [CONTRIBUTING](../CONTRIBUTING.md)：開発環境、検証、変更提案
- [非公開npm配布の準備とローカル配布物の作成](maintainers/releasing.md)
- [公開前に残る判断](maintainers/publication.md)
- [出典と個別ライセンス](../THIRD_PARTY_NOTICES.md)

## 仕様・検証・履歴を調べる

[SPEC](../SPEC.md)を実装契約、[VALIDATION](../VALIDATION.md)を日付別の検証証拠として読みます。現行の利用手順は上のガイドを優先してください。

source checkoutの `docs/harness/project-map.md`（配布物には含めない開発履歴の入口）、[ADR 0001](adr/0001-portable-skill-harness.md)、[ナレッジADR 0002](adr/0002-github-knowledge-base.md)、[改善記録ADR 0003](adr/0003-github-improvement-records.md)、[Chrome保存ADR 0004](adr/0004-chrome-knowledge-capture.md)、[同期・生成ADR 0005](adr/0005-knowledge-sync-analysis.md)、[検索・取得ADR 0006](adr/0006-knowledge-retrieval.md)は設計の経緯を残します。初期ADRの将来計画を、その後実装された機能の現在の状態と混同しないでください。

`docs/harness/tasks/` は各作業時点の仕様・承認・結果、`benchmarks/` は実験成果物です。全会話を自動保存する機能ではなく、これらの履歴はローカル配布物の利用手順とは分けます。旧Python版の結果は[履歴文書](history/validation-python-v1.md)にあります。
