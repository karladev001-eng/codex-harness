---
name: harness
description: Coordinate coding tasks, learn from UI/document feedback, cite Web research sources, and consult Claude for independent ideas, consequential decisions or proposal criticism. Use when the installed harness is enabled or the user invokes it; delegated workers execute only their assigned role.
---

# Codex Harness

仕様を通して作業を引き継ぎ、親が判断と調整を、子が実装と検証を受け持つための運用手順です。強制的なスケジューラではありません。

## 共通境界

- `HARNESS_WORKER` で起動された子は、割り当てられた役割とパケットだけを実行します。調整せず、再委譲しない。
- 最初に、Node.js 22+で同じ階層の `runtime.js status --project <absolute-project-path>` を（パスをシェル引用して）実行し、実効設定と上位・ユーザーの指示を確認します。不備は報告し、無断で有効化しません。`active=false` なら、追加文書・委譲・レビュー・計測なしで通常の作業に戻ります。
- 実装・制作・修正の前に、判定Aの提示と承認を済ませます。同じ提示版・範囲への明示承認があれば取り直しません。純相談・調査だけに実装承認・コード委譲・Git工程を追加しない。
- 機能ごとのOFF：delegation OFFは親が実装可、review ONの独立レビューは必要です。persistence OFFは会話内だけで扱い、永続記憶を読書きしない。measurement OFFは利用情報・計測ログを保存しない。improvement_loop OFFは、好みと技術的知見の自動読取・記録・適用・候補試用を止めます（通常の修正と明示的な記憶管理は別）。
- 食い違いは、元ファイル・原文・一次資料・実測の版・日時・条件で照合します。重要な点が解消しなければ未確定と報告します。多数決や相談相手のモデルとの合意は、正しさの根拠になりません。

## 独立Yes/No判定（表が正本）

すべての行を独立に判定します。Yesの行は本文と必要な詳細を適用し、Noでも次の行へ進みます。判定に迷う行は概要を確認し、足りない点は報告して省略しません。

| ID | Yesとなる条件 | 読む本文・次の判断 |
|---|---|---|
| S | 設定の解釈・互換性・切替を確認する | [設定](references/routing/settings.md)：切替 |
| A | 実装・制作・修正へ進む | [提示・承認](references/routing/preimplementation.md)：承認 |
| C | 開かれた発案、重要判断、停滞、批評。別系統モデルへの明示依頼も判定 | [外部相談](references/routing/peer-consult.md)：条件・権限 |
| W | Webを根拠に回答する | [出典](references/routing/web.md)：根拠 |
| F | UI・文書等の制作・修正・フィードバックでloop ON、明示記憶管理、または制作を委譲する（自動委譲は要求しない） | [制作](references/routing/creative.md)：記憶・保存 |
| D | コード変更、または明示的な大規模探索の委譲 | [調整](references/routing/coordination.md)：委譲・レビュー |
| R | measurement ON、または仕様パケットの記録・再開・完了が必要（通常回答の終了だけは除外）、補助CLI操作（起動statusを含む）、長い作業の境界 | [継続](references/routing/continuity.md)：保存・計測・CLI |

同じ版を保持している間は再読不要です。作業単位ごとに設定を再評価し、範囲・段階・設定・役割・版・指示が変わったら全行を再判定します（相談から実装に移るときも同じ）。compactなどで本文を失えば再確認します。永続既読cacheは禁止です。

任意helper：`read-sections.cjs <commands|roles> <ID...>`（一覧は `--list`）で必要な節だけを読めます（receipt不要）。不明・旧版・実行不能なら、[commands](references/commands.md)・[roles](references/roles.md)の関連範囲、必要なら全文へ戻ります。
