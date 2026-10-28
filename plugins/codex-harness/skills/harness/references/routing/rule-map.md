# 規則の意味対応（保守・独立レビュー用）

通常のagent読込対象ではない。追加分割・新ルータは導入せず、条件→行動→例外へ短文化した。旧節/ブロックIDは不変fixture `tests/fixtures/context-routing/before-SKILL.md` の空行単位。原文一致の代わりに下記対応、現行の意味境界テスト、独立レビューで保持を確認する。原規則を読む必要があるときはfixtureへ戻る。

| 旧ブロック | 現行位置 | 保持した条件・義務・禁止・例外 |
|---|---|---|
| 1.1 | [本文](settings.md) | workerは割当のみ、入口/子起動なし（共通境界にも保持） |
| 1.2 | [本文](settings.md) | Node22/runtime/status、引用、個人/プロジェクト・上位/ユーザー指示、不備報告/無断有効化禁止（共通境界） |
| 1.3 | [本文](settings.md) | inactive終了、delegation/review/persistence/measurement/loopの個別OFF、auto/fixed基準値、旧全OFF互換、開始時再評価/変更保持 |
| 2.1 | [本文](preimplementation.md) | activeの実装/制作/修正、UI/非コード、小変更、各機能OFF、提示先行、inactive/準備のみの除外 |
| 2.2 | [本文](preimplementation.md) | 純発案/相談/批評は外部相談の判定、承認/コード委譲/Git不要、実装移行時適用 |
| 2.3 | [本文](preimplementation.md) | 手順1–5: 仕様全項目、UIがある場合だけ視覚モック/状態/版/閲覧、準備とproduction区別、提示後本人承認/非承認例/再確認免除、未解決独立/必須判断/大規模概要/部分承認、意味変更と不変修正 |
| 2.4 | [本文](preimplementation.md) | 末2段落: 既存正本/重複禁止、資料版/提示証拠/UI理由、承認独立欄/回答別欄、planned/pending/ready、既存schema、保存OFF、受領/レビュー/改訂/完了照合 |
| 3.1 | [本文](peer-consult.md) | active親・delegation・停止指定、該当1役、全役一律禁止、inactive/OFF/worker自動禁止、明示依頼別扱い |
| 3.2 | [本文](peer-consult.md) | ideator初回独立、consultant有力案/重要設計/2回停滞、critic確定前/明示批評・コードレビュー非代替 |
| 3.3 | [本文](peer-consult.md) | 単純作業例外、同時枠/待機、既存ログイン/ツールなし/最小入力、通常1+追加1、再帰/無限禁止、採否統合、権限/承認/証拠非代替、失敗報告/続行、保存OFF |
| 3.4 | [本文](peer-consult.md) | 論点分離、原情報の版/日時/条件へ戻る、重大矛盾未確定、合意/追加相談で証拠確認非代替 |
| 4.1 | [本文](web.md) | active+Web根拠、検索要求なし、上位/ユーザー/既存規則優先 |
| 4.2 | [本文](web.md) | 主張近くの説明名、一次資料優先、主張を支える実ページへの直接リンク義務、検索ページ/内部ID/捏造禁止、論文書誌/未確認/閲覧範囲/推測、完了前照合/回答内出典、既存記録だけ/保存OFF |
| 4.3 | [本文](web.md) | 純Webは通常回答、コード工程不要、明示大規模探索だけ役割手順、複合作業は各手順 |
| 5.1 | [本文](creative.md) | loop条件、開始/修正/完了/次回、runtime prefs、fresh失敗非適用、保存OFF読取禁止、計測独立 |
| 5.2 | [本文](creative.md) | 根拠/更新/pendingと4flag条件、record-keeper、無変更非起動、明示管理/OFF差、唯一writer/失敗詳細保持 |
| 5.3 | [本文](creative.md) | 保存資料の少数/必要箇所/今回判断、OFF/未設定/不足時続行 |
| 5.4 | [本文](creative.md) | 制作委譲のSol/独立effort、委譲自体は要求しない（roles） |
| 5.5 | [本文](creative.md) | 純制作はコード工程不要、コード混在は調整/独立レビュー/loop併用、指示/権限/安全優先 |
| 6.1 | [本文](coordination.md) | 手順1–8を保持: 提示/HTML解決/パケット/探索集計、必要記録、ready/依存/枠、モデル/pin/候補/履歴なし、子引継ぎ/再帰禁止、独立レビュー/2巡、依存統合/最終独立評価/親代筆禁止、最新版受入/影響再検証 |
| 7.1 | [本文](continuity.md) | 状態列、reviewOFF、needs_work/blocked、エージェント判断/CLI非証明 |
| 7.2 | [本文](continuity.md) | 完了記録/長いログ/ID再開/PC同期、早期compact条件/引継ぎ/正式機能/制約、独自監視/API/会話削除禁止 |
| 7.3 | [本文](continuity.md) | CLI/計測個別読取、必要役割だけ/追加起動非自動、Designer/画面評価v1外でもUIモック必須、資料全自動注入を仮定しない |

rolesはモデル/effortの独立判断・pin/auto/fixed・候補取得元・後継根拠・失敗/記録・worker境界を保持。reviewerは事前証拠/独立性/受入/不合格とBLOCKED/2巡を保持。HTML入口は単独利用・言語・正本/本人承認・未決分離・pack境界/警告・実ブラウザ/狭幅/別版復元・保存OFF・命令データ化を保持。blocks全文と全reader APIを保持する。commandsは安定ID・lesson・再送・OFF・履歴契約を追加し、commands/rolesのrange/hash/依存を現行全文へ更新する。compactは本体自動機能とagent実行toolを区別し、手動/自動の根拠・2026-10-24 20:30の手動事実を訂正する。権限拡張・設定固定値の追加はしない。

読取境界は入口の独立Yes/No表が正本。各flagを別判定し、起動statusはcommands、計測ONはmeasurementを読む。純相談/Web/制作にはコード工程を追加しない。版/範囲/段階/設定/役割/指示が変われば再判定、compact等で内容喪失なら再読。永続既読cacheは作らない。節helper/receiptは任意で通常読取に追加操作を強制しない。

2026-10-25の修正記録統合: D本文の開始/完了からtechnical-lessonsへ接続し、R完了は記録の有無・保存成否/pendingを確認する。Fは制作専用のまま。技術的根拠とユーザー嗜好を分離し、単なる機能追加から自動昇格しない。個人opt-inとOFF、初回記録時だけregister、唯一writer、再送・履歴の契約はcommands/record-keeperと読者ガイドへ対応する。
