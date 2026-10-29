# loop-switch-auto-models

- 状態: done
- 仕様版: 1
- 基点: 82586eda58699e6d44e656689586e220befe41af + 既存未コミット内容、直列で保持しcommit/stash/resetなし。
- 目的: 改善ループ専用ON/OFFと、ホストで利用候補として提示された後継モデルへの自動選択。
- 実装: gpt-6.1-sol/medium。レビュー: gpt-6.1-sol/high。統合: gpt-6-luna/low。
- 対象外: 常駐/定期ポーリング、認証トークン取得、別API課金、モデル名の捏造、モデルを試すだけの課金推論、メインモデル変更、公開/push。
- 作業前スナップショット: `<tmp>/harness-switches-before-qa9je4s0`（0.3.0配布物を含む）。
- 計測開始記録: 2026-10-01T16:59:19Z（実装委譲後）。利用枠値は未取得。
- 自動選択の任意選好質問に回答なしのため、予告どおり同系統の後継を選ぶautoを既定として進行。fixedに変更可能。

## 受入条件

1. `improvement_loop` boolean既定trueを個人/プロジェクト設定に追加。OFFは好みの読取・記録・自動適用と候補試用を停止し、保存済み記憶を消さない。通常の依頼内の修正対応は継続する。タスク記録のpersistenceとは独立。明示的な記憶管理依頼はOFFでも別操作として扱える旨を定義。
2. enabled=false/旧4機能全OFFの無動作互換を保持。5フラグ化する場合、旧4フラグが全falseかつ新キー未指定なら改善ループもfalseに解決して旧動作を保つ。明示的な新キーtrueはこの互換補完より優先。persistence=falseは永続メモリ読書きなし、measurement=falseは指標記録なし。
3. `model_selection` enum `auto`/`fixed` を追加（autoを既定予定、ユーザー回答でfixedへ変更可）。自動選択はホストの実際の起動ツール/対応モデル一覧と対応effortから、同じ役割/系統の後継を選ぶ指示ベース手順。ホストが後継/最新として明示する等の根拠が必要、Webの公開モデルや名前の推測のみでは選ばない。軽量→最高額クラス等の役割変更をしない。固定モードは従来の設定を使う。
4. 明示的な個人/プロジェクトの `models.<role>.model` はpinとしてautoでも優先（effortだけの上書きはmodel pinではない）。statusにpinの役割とautoがホスト起動時解決である旨を分かる形で返し、config.modelsを動的解決結果と偽らない。実効設定解決とprovenanceは一貫させる。
5. タスク開始/子起動時に候補一覧と対応effortを確認し、選択の根拠/実際のmodel+effort/取得元をパケットへ記録（persistence OFFは会話内）。一覧なし/曖昧なら既定値を使い制約を報告。対応していない明示model/effortは黙って代替せず報告。カタログ表示はアクセス権/成功の保証ではない。実行中の子を切替しない。別PCでも同じ手順を配布。
6. statusは読取のみ・ネットワークなし。自動選択は既存の指示ベース構成に限定し、CLIで勝手に認証や外部APIを呼ばない。モデル起動ツールが列挙する候補を優先し、CLIカタログがあっても実際の子起動面と照合する。
7. 値検証・個人/プロジェクト優先順位・pin由来・新旧all-off・no-write・インストール更新/配布内容を意味あるテストで確認。README/SPEC/SKILL/roles/creative-loop/雛形/CLI説明の矛盾を解消。実装効果と未検証の将来モデルを区別。
8. 0.4.0として版を揃え配布tgzとchecksumを作る。以前渡した0.3.0のtgzはbuildの削除から退避し最後に元のdist/releasesへ戻す。独立レビュー・テスト後に実導入更新して設定確認。個人の保存済み記憶と明示設定は保持。

## 根拠と制約

OpenAI Docs: https://learn.chatgpt.com/docs/app-server のmodel/listはモデル・対応effort・optional upgrade情報を返す。カタログはクライアント依存/キャッシュの場合もあり、起動アクセス権を保証しない。現在ホストのspawn_agentに候補とeffortが明示されている。実装は認証を追加せず、このホスト情報をエージェントが参照して選択する。自動更新は新モデルのリリース直後を保証しない。

## 完了

実装とnpm test47/47 PASS。resolveSettingsで設定/pin由来を一元解決し、statusはホスト起動時未解決を明示。旧版からの設定/記憶/all-off保持を確認。独立重点テスト7/7 PASS。SKILLでタスク/ADRの読込禁止に不用意に拡大した文言を修正済み。独立レビュー指摘の将来Lunaのeffort対応を妨げる固定断定は修正済み、ソースレビューPASS。


配布統合: 0.4.0を最終文書からbuild/packし、旧0.3.0配布物を最後に復元。隔離HOMEで最終tgzのオフラインinstall/status/reinstallを実行し、installed→unchanged、改善ループtrue/auto/pinsなしを確認。配布物に旧tgz・fixtures・benchmarks・個人データなし。

- 0.4.0: `dist/releases/karladev001-eng-codex-harness-0.4.0.tgz`
- SHA256: `b77d10eeb0c01848d0055e6753be375c527de1b20ea08c93c5da0a8b7c2bd0f9`
- 0.3.0 SHA256保持: `9122575ecf229f825abb52d387ca4482800fc6de38018068d5e300741cc23cfb`
- 実導入: `~/.agents/skills/codex-harness`、公式installer成功、旧版backup `~/.codex/harness/backups/install-l6VN8p`。
- 初回更新はmacOSの`.DS_Store`2ファイル追加のみで所有チェックが停止。本体は全一致を確認し、その2ファイルを`~/.codex/harness/backups/macos-metadata-os3zav3i`へ保持退避して再実行。
- 実効設定: improvement_loop=true、model_selection=auto、pinned_roles=[]、resolution=host-launch、catalog_checked=false。
- 更新前に取得した設定/ローカル記録のfingerprint（1ファイル）は更新後も一致。設定・保存済み記憶の保持を確認。
- 子モデル取得元: 本ホストのspawn_agent説明。実装Sol 6.1/medium、レビューSol 6.1/high、統合Luna/low。実装判断・独立品質確認・定型配布検証に合わせ選択。
- 制約: 将来モデルの実行、他OS実機、改善の長期効果は未検証。常駐のリリース監視ではなく起動面の候補提示に依存。Git commit/push・外部公開なし。利用枠値は未取得。

最終独立整合レビューPASS。条件1〜8すべて受入。source17ファイル、dist/archive両経路/実導入30ファイルの一致、両checksumと旧版バイト一致、所有manifest、記録保持を独立確認。最終diff check PASS。
