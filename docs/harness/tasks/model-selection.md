# タスク: model-selection — モデルと推論強度の選択方針

- 状態: done
- 仕様版: 1
- コード基点: 82399cb050c230de9a3ef4e50680c1587a79e8ed
- 担当範囲: ハーネスの既定モデル、役割指針、関連する現行ドキュメント、個人導入の更新
- 依存: なし

## 目的と対象外

メインを gpt-6-astra、子を gpt-6-luna / gpt-6-sol とする方針を反映する。課題の答え・検証方法の明確さと重要性でモデルを選び、その後に品質要件で推論強度を選ぶ。ホストの実行中モデルを変更したとは扱わない。公開・push、履歴資料の書換え、無関係な設定変更は対象外。

## 受入条件

1. 子の既定値は deterministic=luna/low、standard=sol/medium、complex=sol/high、review=sol/high。既存設定スキーマを維持する。
2. 単純な実装・限定調査など正解や検証方法が明確な作業は luna、自由度の高い設計・デザインや重要な問題・レビューは sol。ファイル数だけでは昇格しない。
3. 品質要件に応じて low / medium / high を選び、より高い強度は根拠がある場合のみ使用。モデル選択と独立に判断し、明示された指定とホストの対応範囲を守る。
4. メインの astra 方針、ホスト変更の限界、選択理由の記録、関連文書が整合する。
5. 既存テストと独立レビューを通過後、個人導入を更新し実効設定を確認する。

## 制約と参照

- 実装: gpt-6-sol / medium。判断指針の編集を含むため sol、通常の品質基準で medium。
- レビュー: gpt-6-sol / high。運用指針の矛盾と設定整合性を独立に確認する。
- 実装worktree: ~/.codex/worktrees/model-selection/harness
- 役割指針: ~/.agents/skills/codex-harness/references/roles.md
- 上位のユーザー指定を既存モデルマッピングより優先する。

## 未解決事項

なし。

## 進捗・完了

- 実装: d5faf7e03f273bc083b1ba48280f1ec536145c7f。既定値と選択ルール、README、SPEC、タスク雛形を更新。
- 検証: npm test 39/39 PASS、diff --check PASS。skill-creator の quick_validate.py は PyYAML 不在で実行できず、frontmatter は未変更。
- 独立レビュー: gpt-6-sol/high、PASS。既知の正解を持つ高品質リファクタは luna/high、限定調査は luna/low、開かれた設計・重要レビューは sol/high と判断できることを確認。
- 統合: gpt-6-luna/low。承認済みコミットをそのまま取り込む決定的な操作のため。統合worktree 52ea1662b8fb32f171d53aea030b02d0a34ca952、main 82586eda58699e6d44e656689586e220befe41af。両方のツリーがレビュー対象と一致し、最終独立レビューもPASS。
- 個人導入: 検証済みビルドからインストーラーで更新。追加 .DS_Store のみを <tmp>/harness-metadata-mmkd2ava/.DS_Store へ保存してから実施。旧版バックアップ: ~/.codex/harness/backups/install-i1pWg5。
- メイン既定: 個人設定で既に gpt-6-astra/medium。ホスト設定変更は不要。
- 制約: 公開・pushは未実施。利用量は未取得で削減効果を主張しない。
