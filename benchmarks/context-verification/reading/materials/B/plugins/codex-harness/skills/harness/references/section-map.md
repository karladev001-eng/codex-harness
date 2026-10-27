# 必要節の対応と検証

この表は保守・レビュー用。全文読取・節読取は選択でき、通常利用でreceipt管理は不要。commands/blocksは従来本文を保持し、rolesは意味を保って短文化した。既存リンクとanchorは元の全文へ到達する。

`section-index.json` のIDが規則群の安定ID、`ranges` が全文正本の1始まり包含行範囲、`requires` が依存、`common` が常時必要な前提。文書全体のSHA-256が一致するときだけ抽出する。版が違う場合は本文を一部も出さず全文確認へ戻す。原文を更新する際は行範囲・依存を再照合してhashを更新し、下記テストを通す。hashだけを更新して旧行範囲を使い続けない。

| 文書/ID | 保持する規則群 | 適用・依存 |
|---|---|---|
| commands/common | runtimeの解決、引用、help、全操作の呼出例、home/設定の解決、読取/書込の区別 | 全CLI操作。settingsも含む |
| commands/settings | 設定優先順、loop・persistence・model/pin・互換性・inactive | 全CLI操作の共通依存 |
| commands/status, doctor | statusの読取限定、モデル設定/ホスト解決との区別、preferences metadataの限定 | status-models＋preferences-boundary。doctorはstatusも読む |
| commands/task, worktree | 必須引数、繰返し引数、基点、パケット正本、状態判断のエージェント責任 | task操作。worktreeはtaskも読む |
| commands/measure | 必須/任意入力、日時、利用枠、窓、overlap/null、比較と除外 | measure操作。measurement手順自体は既存R判定から別途読む |
| commands/install | npm/tgz、認証と失敗、所有確認・更新/解除・個人設定保持・optional skill | 導入操作。settingsも読む。status-modelsと範囲重複は一度だけ出す |
| commands/preferences-boundary, preferences | 保存先・認証・private制約、read/write/sync/migrate、revision、失敗/pending/競合、移行/retirement、OFF条件 | preferences操作は境界と全操作契約を読む。個々のpreferences下位操作は安全上分割しない |
| roles/common | 役割/作業の性質によるモデル、独立したeffort判断、明示指定/上位契約、候補表、曖昧仕様の親への返却 | 全役割節に付属 |
| roles/coordinator | 起動時のstatus/pin確認、候補取得元、auto/fixed、後継根拠/フォールバック、失敗と記録 | 親のモデル選択・子起動。制作委譲/loop OFFでも同じ |
| roles/role-index | 調査・記録・評価の用途/適用条件と既存役割へのリンク、探索の分割/費用、上限を変えない境界 | 担当手順を探すとき。起動時はcoordinatorも必要 |
| roles/implementation | worker限定、上位指示、範囲、承認仕様、既存変更の保持、チェック/返却、再委譲禁止 | 実装workerへ渡す |
| roles/integration | 指定基点/順序、仕様競合の親返却、結合検証、返却、push/外部mergeの非承認、再委譲禁止 | 統合workerへ渡す |
| blocks/common | 言語、原資料表示、未解決欄/承認の分離、ID/版/範囲、script構文、変更記号、comment対象 | 全ブロック |
| blocks/doc-plan, doc-claim | 木構造、既定閉状態、aux、id/at、子要素順序と展開/コメント | 全計画の構造前提 |
| blocks/pack | lint、読取境界/secret拒否/埋込一覧確認、inline、エラー停止/警告 | 全計画の検証前提 |
| blocks/doc-changes | header配置、ファイル数、0の省略、判断数と区別 | 使用時 |
| blocks/doc-mock, doc-shot | frame/寸法、最小領域、実HTML/CSS、pin/comment対象、CLI出力、実在UIのshot | mock/shot使用時 |
| blocks/doc-machine | 状態/矢印/グリッド、到達/終了/上限、差分、状態条件表示 | 使用時は画面用doc-mockも含む |
| blocks/doc-calls | 行位置/記号/太字、実パス/行、抜粋とclaimリンク、strike/subtree、files/template、行予算 | 使用時 |
| blocks/doc-schema | lang/id、src、diff、言語内注記、主要member数、編集 | 使用時 |
| blocks/doc-code | 実在/提案/diff、src/lines/ref、hunk完全性、pin/gutter/tone、行数/hl/wrap/caption | 使用時 |
| blocks/doc-ask | フォーム種類、未選択/提案と回答/承認の区別、name一意、data-if | 使用時は例と条件表示のdoc-noteも含む |
| blocks/doc-quote | via、逐語引用、省略表現 | 使用時 |
| blocks/doc-note | tone、リスクと短文 | 使用時 |
| blocks/other, doc-flow, doc-tree, doc-draft | 既存blockで合わないときのみ、各構文/予算、順序cards | 対象使用時は同じ原文節を共有 |
| blocks/doc-pin | mock上のpin、code上のpinの両構文 | 明示指定はdoc-mock＋doc-code。両文書の共通規則も保持 |

`node --test tests/section-reading.test.cjs` は未変更文書の原文snapshotと現行文書のhash、全行/bytesの完全被覆、共通前提/依存、重複併合、不明ID/古い版/循環/不正範囲の拒否、独立スキルとbuild/plugin配布を検証する。リンク書換えが必要な導入用commandsはbuild後の実ファイルへhashだけを合わせる（行範囲は不変）。原文規則の対応と実際に選ぶべきIDの妥当性は独立レビューで確認する。

v1の全文見積りは `tests/fixtures/context-routing/v1-report.json` の過去snapshotを使用し、既存 `benchmarks/context-routing.*` の数値を更新しない。`scripts/context-routing.cjs --check` はその過去結果と現行チャートの整合を別々に検証する。v2の実tool読込量と混同しない。

## 保持中の追加読取

`--json` の `receipt` は同じ読者が返却済み本文を現在も保持する場合だけ、次回 `--held '<receipt>'` に渡す。receiptは永続cacheではなく、source hash・対応表hash・共通/依存を含む既読ID集合の明示的な申告。実際に読者のコンテキストに残っているかをhelperが観測する機能はない。別workerへの引継ぎやcompact等で本文を失った場合は使用せず通常読取する。

helperは版/document/ID/依存閉包を検証し、同じ対応表から再構成した既読行だけ差し引く。任意range指定は受け付けない。変更された対応表・旧版・別document・不正ID・共通/依存不足は本文なしで失敗する。今回の `selected` は必要集合、`chunks`/`bytes` は新しく返す部分だけ。receiptは既読と今回必要集合のunionへ更新する。新規本文0なら空chunks/bytes=0とし、text出力も既読と明記する。複数IDの一括取得・`all` も同じ依存規則で扱う。
