# 出典と個別ライセンス

ルートpackageの `license` は `UNLICENSED`、`private` は `true`です。リポジトリ全体への利用ライセンスは未付与です。以下の個別表記を全体への許諾と読み替えないでください。公開時の方針は[別途判断](docs/maintainers/publication.md)します。

## codex-html-planの派生部分

`authoring-skills/codex-html-plan`は[anthropics/claude-plugins-communityのhtml-plan](https://github.com/anthropics/claude-plugins-community/tree/f60f0454df3045f724c43c6346ec80bdcc3472b2/html-plan/skills/html-plan)を固定コミット `f60f0454df3045f724c43c6346ec80bdcc3472b2`から取り込み、Codex向けの手順・表示・承認文案等を変更しています。

- [同梱Apache-2.0 LICENSE](authoring-skills/codex-html-plan/LICENSE)
- [固定出典とファイル別変更記録](authoring-skills/codex-html-plan/UPSTREAM.md)

buildしたstandalone/pluginにも対応するLICENSEとUPSTREAMを含めます。上流treeにhtml-plan固有のNOTICEがなかったことはUPSTREAMに記録しています。新たな権利表示を推測して追加せず、既存のライセンス全文と変更表示を保持します。

## 参考にした運用設計

[Everything Claude Code](https://github.com/worldflowai/everything-claude-code)の[オーケストレーション](https://github.com/worldflowai/everything-claude-code/blob/main/commands/orchestrate.md)、[担当規則](https://github.com/worldflowai/everything-claude-code/blob/main/rules/agents.md)、[レビュー担当](https://github.com/worldflowai/everything-claude-code/blob/main/agents/code-reviewer.md)を構造化した引継ぎや独立レビューの参考にしています。この参照はコードの同梱と区別し、Claude固有の設定/hooksを移植するものではありません。実装仕様の参照は[SPEC](SPEC.md)にも残します。

## Raycast・開発依存

[Raycast拡張manifest](integrations/raycast-knowledge/package.json)には既存の `license: "MIT"` 表記があります。これは拡張側のメタデータで、ルートのUNLICENSEDとは別です。今回その表記は変更せず、配布範囲と権利の確認は公開前の判断に残します。Raycastの実行ソースと依存は本体tarballの実行物には含めません。

TypeScript、Node/React型定義、Raycast APIなどの開発・ツール依存は各packageとlockfileに記録します。ルート実行物は追加production依存を持ちません。同梱ライセンスの確認を、外部依存の全権利監査済みと扱いません。
