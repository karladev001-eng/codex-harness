# 文書読込量の比較

生成: `node scripts/context-routing.cjs --write`。検証のみ: `node scripts/context-routing.cjs --check`。数値・ファイル一覧・範囲・SHA-256は[JSON](context-routing.json)。

UTF-8 bytesとUnicodeコードポイント数を計測。共通bootstrapは初回の双方に951 bytesずつ加算（inactiveの追加指示本文は前後0 bytes）。active親の初回は起動status用commandsを双方に加算。明示OFF以外はmeasurement ONで、既存計測手順も双方に加算。会話全体のトークン、利用枠、速度、品質の改善を示すものではない。

入口単体: 20625 → 4119 bytes（80.03%減）、8747 → 2093文字。目標2〜3KBに対し、共通境界の保持を優先した実測値を示す。

| シナリオ | before bytes | after bytes | 削減bytes | 削減率 |
|---|---:|---:|---:|---:|
| advice | 32740 | 17909 | 14831 | 45.3% |
| claude | 39657 | 27160 | 12497 | 31.51% |
| simple-code | 77468 | 72485 | 4983 | 6.43% |
| web | 32740 | 19869 | 12871 | 39.31% |
| creative | 52014 | 44484 | 7530 | 14.48% |
| mixed | 103659 | 107227 | -3568 | -3.44% |
| worker | 8290 | 8290 | 0 | 0% |
| inactive | 951 | 951 | 0 | 0% |
| delegation-off | 75337 | 70354 | 4983 | 6.61% |
| review-off | 72065 | 67065 | 5000 | 6.94% |
| storage-off | 71615 | 66632 | 4983 | 6.96% |
| loop-off | 32740 | 23023 | 9717 | 29.68% |
| delegated-creative-loop-off | 40079 | 32515 | 7564 | 18.87% |
| advice-measurement-off | 31655 | 16824 | 14831 | 46.85% |
| explicit-memory-off | 55437 | 42793 | 12644 | 22.81% |
| ambiguous | 32740 | 19406 | 13334 | 40.73% |
| advice-to-code | 44728 | 54576 | -9848 | -22.02% |
| same-version | 0 | 0 | 0 | — |
| version-update | 20625 | 9233 | 11392 | 55.23% |
| after-compact | 77468 | 72485 | 4983 | 6.43% |

- **advice**: 定型的な方針相談。外部相談・コード変更・制作・記録なし。measurement ONの既存計測規則を適用。Yes: R。
- **claude**: 開かれた企画相談。Claudeへ独立発案を1回依頼。Yes: C, R。
- **simple-code**: 単純コード修正の準備から完了。HTML計画あり、UIなし、全機能ON、親が必要な役割・検証資料を読む。Yes: A, D, R。
- **web**: Web調査のみ。探索委譲・コード変更・制作なし。Yes: W, R。
- **creative**: 文書制作。仕様・承認と改善ループ、保存資料検索あり。好み更新なし、コード・CLIなし。Yes: A, F, R。
- **mixed**: Web根拠のあるUI実装・Claude批評・設定互換性確認・保存資料参照・記録完了の複合。全分岐Yes。Yes: S, A, C, W, F, D, R。
- **worker**: 親から仕様・設定・役割を受領済みの実装worker。親の入口や調整本文を加算しない。役割全文のみを共通費に算入。Yes: なし。
- **inactive**: inactive（enabled=false、全機能OFFを含む）。bootstrap以外の文書読込なし。Yes: なし。
- **delegation-off**: コード修正、delegation OFF/review ON。親が実装し別担当がレビュー。並列実装なし、HTML計画あり。Yes: A, D, R。
- **review-off**: コード修正、review OFF。他機能ON。レビュー資料を読まない、HTML計画あり。Yes: A, D, R。
- **storage-off**: コード修正、persistence/measurement/improvement_loop OFF、delegation/review ON。仕様をインライン、HTML計画あり。Yes: A, D, R。
- **loop-off**: 文書制作、improvement_loop OFF。通常の仕様・承認と有効な計測、記憶管理依頼・制作委譲なし。Yes: A, R。
- **delegated-creative-loop-off**: loop OFFで純文書制作をユーザーが明示委譲。自動的な委譲要求は追加せず、既存の制作委譲時モデル規則を読む。Yes: A, F, R。
- **advice-measurement-off**: 定型的な純相談。measurement OFF、パケット記録・起動status以外のCLI操作・長い作業の境界なし。commandsは必要。Yes: R。
- **explicit-memory-off**: loop OFFで明示的な好み訂正。persistence ON/delegation OFF、親が同じwriter契約とCLIを使う。Yes: F, R。
- **ambiguous**: 「この資料をよくしたい」。関連A/Fの先頭段落だけを確認、まだ着手しない。A/Fは全文を読んだ数値ではない。Rと有効な計測手順は全文。Yes: A, F, R。
- **advice-to-code**: adviceを読込済みで保持。単純修正へ移行した時の追加読込。beforeは既読root再加算なし。Yes: A, D, R。
- **same-version**: simple-codeの全資料を同じ版で保持。追加資料なし。Yes: なし。
- **version-update**: simple-codeの後で入口とA本文の版だけ更新。他の既読資料は保持。変更した文書だけ再確認。Yes: A, R。
- **after-compact**: simple-codeの内容をcompactで失った。必要資料を再読（保持している資料があればその分は不要）。Yes: A, D, R。

- Static examples of instruction-based selection, not executed agent traces or a runtime classifier.
- Same normalized bootstrap path and same documents/conditions on both sides; status output, current task packets/ADRs, project code, actual user reference materials and tool/CLI source are excluded equally because they vary by task. No missing document is silently skipped.
- Every active nonworker initial example reads commands.md for its startup status on both sides. Unless explicitly OFF, each applies the original measurement requirement: measurement.md on both sides and continuity on the new side. Pure advice/Web does not create an extra task packet merely to record it. Retained commands/measurement/continuity documents are not double charged on continuation or a version update.
- The ambiguous example measures the precise first paragraph range for A/F, but full continuity and measurement; all other selected documents are full files. Downstream documents are opened when their described action is actually needed.
- HTML plan examples count skill, workflow and blocks in both versions. Broader plans may need more sources and are outside these fixed examples.
- Reviewers and workers receive their own packet and role; their actual code/material reads are not mixed into the parent total. The worker example keeps its original role document charge.
- Original sections are preserved; selecting every branch adds entry/routing overhead and can increase total documentation.
- Version-update assumes only entry and A change. If more document versions change or their contents are lost, re-read those too.

入口の正本スナップショットと元の参照サイズ/hashは `tests/fixtures/context-routing/` に保持。bootstrapは前後同一パスに正規化。各例の元から必要な詳細とHTML計画資料を両側に加算。単純修正等は初回入口だけでなく工程全体で必要な資料を計測し、同一資料の再読は重複加算しない。概数トークンへの換算や全資料総和を削減率の分母にしない。
