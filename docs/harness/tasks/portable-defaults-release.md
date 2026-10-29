# portable-defaults-release

- 状態: done
- 仕様版: 1
- 基点: 82586eda58699e6d44e656689586e220befe41af + 現在の未コミット変更を保持。現checkoutで直列、commit/stash/resetなし。
- 目的: モデル選択と制作改善ループを別PCの新規導入・旧版更新へ届ける。
- 実装: gpt-6.1-sol/medium（互換性と配布設計）。レビュー: gpt-6.1-sol/high。統合: gpt-6-luna/low。
- 範囲: 初期設定/手順/配布版番号/導入ドキュメント/移行テスト/ローカルtgz。
- 対象外: 外部公開、Git push、常駐自動更新、個人の好みの自動同期。
- 作業前スナップショット: `<tmp>/harness-release-before-3fn3jz9s`。
- 計測開始記録: 2026-10-01T16:38:10Z（実装委譲後）。利用枠値は未取得。

## 受入条件

1. 配布既定は決定的な軽作業にLuna、重要・非決定的/クリエイティブな作業にSol 6.1。モデルとeffortは別軸で選び、品質要件でeffortを決める。クリエイティブで委譲する場合も同じ規則を適用（不要な委譲強制なし）。
2. 新規導入に既定モデルと改善ループ入口・参照・雛形が含まれる。persistence等の既存OFFを尊重する。
3. 旧JS版の所有記録、旧bootstrap、旧モデルdefaults、改善ループ未搭載を再現し、最新版installで更新されることをテスト。保存済み記憶/無関係AGENTS/個人設定・プロジェクト明示上書きを保持。再installはunchanged。旧Python移行も既存テスト維持。
4. 個人上書きを勝手に既定値へリセットしない。上書きがあると既定を隠す旨と確認方法を説明。編集済み管理ファイルの保護を維持。
5. パッケージ/lockfile/pluginの版を0.3.0に揃え、実tgzによる別ディレクトリ導入を検証。配布・新規/更新の共通コマンドを明確化。未公開のGitHub releaseが存在すると記載しない。
6. npm testと必要な配布検証、独立レビューPASS。最終tgzをworkspace内のdist/releasesに保存しリンクで渡す。実ローカル導入も更新して確認。

## 完了記録

実装済み。npm test 42/42 PASS。旧JS版を実際に導入→新規tgzで更新する検証、明示設定/OFF/記憶/無関係な指示の保持を確認。レビュー担当の重点7件もPASS、旧版fixture23ファイルは旧コミットから再生成して一致。モデル選択の重要性優先とeffort別軸の例を文言補足中。配布はローカル成果物として作成し、別PCへコピーして導入できる状態にする。

- 文言補足後の独立レビューPASS。重要性・リスクは単純さより優先し、effortは品質要求で独立に決定。
- 最終prepack/build後、`dist/releases/karladev001-eng-codex-harness-0.3.0.tgz` と `SHA256SUMS.txt` を生成。
- SHA-256: `9122575ecf229f825abb52d387ca4482800fc6de38018068d5e300741cc23cfb`。
- 統合担当による最終tgzの実npx/offline・一時HOME/cache導入: installed→statusで新しい既定→再install unchanged、PASS。
- 実ローカル導入更新済み。バックアップ `~/.codex/harness/backups/install-IOB7ln`。installed statusでLuna low/Sol6.1 medium-high-high、既存フラグ保持を確認。
- 最終独立レビューPASS: source/tgz両配布形態/実導入のdefaults・SKILL・最終roles・改善ループ・雛形がバイト一致、checksum一致。
- 条件1–6完了。変更は未コミットで既存作業保持。公開/外部pushなし。
- 制約: 他OS/別物理PCでのライブ実行と長期嗜好改善は未検証。明示された個別モデル上書きは保持する。自動ダウンロード更新ではなく、新版tgzでinstallを再実行する更新方式。
- 計測: 全テスト42件と独立重点7件、レビュー修正必須0件、任意文言補足1回。利用枠・正確なタスク費用は未取得。
