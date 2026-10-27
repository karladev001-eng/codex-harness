---
name: harness
description: Coordinate coding tasks, learn from UI/document feedback, cite Web research sources, and consult Claude for independent ideas, consequential decisions or proposal criticism. Use when the installed harness is enabled or the user invokes it; delegated workers execute only their assigned role.
---

# Codex Harness

仕様で引継ぎ、親が判断・調整、子が実装・検証する指示運用。強制スケジューラではない。

## 共通境界

- `HARNESS_WORKER` は割当役割・パケットのみ実行。調整・再委譲しない。
- Node.js 22+で同階層の `runtime.js status --project <absolute-project-path>` をシェル引用して実行。実効設定・上位/ユーザー指示を確認。不備は報告し無断有効化しない。`active=false` は追加文書・委譲・レビュー・計測なしで通常作業へ。
- 実装・制作・修正はAの提示/承認を先行。同じ提示版/範囲の明示承認は再取得不要。純相談・調査だけに実装承認・コード委譲・Git工程を追加しない。
- delegation OFFは親が実装可、review ONの独立レビューは必要。persistence OFFは会話内のみ、永続記憶を読書きしない。measurement OFFは利用情報・計測ログを保存しない。improvement_loop OFFは好みの読取・記録・自動適用・候補試用を停止（通常修正・明示管理は別）。
- 矛盾は元ファイル・原文・一次資料・実測の版/日時/条件を照合。重要未解消点は未確定と報告。多数決・Claudeの合意は正解の根拠でない。

## 独立Yes/No判定（表が正本）

全行を独立判定。Yesの本文/必要詳細を適用し、Noも次行へ。曖昧なら概要を確認し、不足を報告して省略しない。

| ID | Yesとなる条件 | 読む本文・次の判断 |
|---|---|---|
| S | 設定の解釈・互換性・切替を確認する | [設定](references/routing/settings.md)：切替 |
| A | 実装・制作・修正へ進む | [提示・承認](references/routing/preimplementation.md)：承認 |
| C | 開かれた発案、重要判断、停滞、批評。明示Claude依頼も判定 | [Claude](references/routing/claude.md)：条件・権限 |
| W | Webを根拠に回答する | [出典](references/routing/web.md)：根拠 |
| F | UI・文書等の制作・修正・フィードバックでloop ON、明示記憶管理、または制作を委譲する（自動委譲は要求しない） | [制作](references/routing/creative.md)：記憶・保存 |
| D | コード変更、または明示的な大規模探索の委譲 | [調整](references/routing/coordination.md)：委譲・レビュー |
| R | measurement ON、または仕様パケットの記録・再開・完了が必要（通常回答の終了だけは除外）、補助CLI操作（起動statusを含む）、長い作業の境界 | [継続](references/routing/continuity.md)：保存・計測・CLI |

同じ版を保持中は再読不要。各作業単位で設定再評価。範囲/段階/設定/役割/版/指示の変更時は全行を再判定（相談→実装も）。実変更を保持し、compact等で本文を失えば再確認。永続既読cacheは禁止。

任意helper: `read-sections.cjs <commands|roles> <ID...>`（`--list`）。receipt不要。不明・旧版・実行不能なら[commands](references/commands.md)/[roles](references/roles.md)の関連範囲、必要なら全文へ戻る。
