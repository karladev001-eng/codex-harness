# r2 → r3の改訂と審査状態

元の `batch-comparison` r2（3枚）を `r2-deck.json` にbytesのまま保存した。元の生成HTML・コメント・r2成果物は元プロジェクトに残す。新r3はS01前提→S02結果→新S04限界→S03次の行動の4枚、180秒。順番のために既存slide IDを付け替えない。

S02は平均40/25秒を同じ0起点の横棒で示す。差15秒は見出し、現行比37.5%・各回の範囲と元表の詳細は原稿・出典へ移した。titleとmessageは同じ一文で、スライド上では繰り返さない。S03の結果再掲を外し、限界は新S04へ分けた。元値は40/42/38、25/24/26秒、同じPC・各3回という演習用仮想値であり実測ではない。集計コード・CSV・平均と範囲のJSON・SVG原本を同梱する。

## IDの対応

| r2対象 | r3での扱い |
| --- | --- |
| deck batch-comparison / S01・S02・S03 / 各P01 | 同じ目的のページ・原稿としてID維持、revisionはr3 |
| S02 comparison-chart / comparison-svg | ID維持。SVGを主役として表示し、重複するchart要素は追加しない |
| S03 limit | 同じ限界の内容としてS04へ移動。旧slideId付きコメントは手動照合 |
| S03 next-conditions | ID維持、次の行動だけを残す |
| S01 goal / S02 comparison-table・difference / S03 takeaway | 廃止。意味をnotes/paragraphs/出典に保持し、旧コメントは手動照合。別の要素へ無言転用しない |
| 新S04 / S04-P01 | 限界説明の新ID |

すべての旧フィードバックはdeck/revision/variant/hashを先に照合する。IDが残っていてもr2の回答をr3へ自動適用しない。原稿・出典・素材原本の詳細はreview.html、story.md、script.mdとregistryに生成する。案A/Bは同じ内容・同じ要素IDで余白と背景だけを比較し、同じ親ディレクトリへ両方をbundleして相対リンクを保持する。

## 審査記録

生成器は審査を実行しない。実表示は全ページ/全案でpendingとする。意味内容の審査を行った後、確認したidentityの記録だけを `semantic-review.json` に保存する。再生成では記録をそのまま維持し、新しいhashへ自動更新しない。内容・デザイン・runtime・素材が変われば失効し再審査する。旧r2のcoherenceをr3へ流用しない。全HTMLの視覚審査、狭幅・展開・拡大・コメント操作、独立審査、実際の聞き手評価、3分のリハーサルは未検証。

```sh
node "<skill-dir>/examples/visual-first/generate-example.mjs"
node "<skill-dir>/scripts/pack.mjs" validate "<skill-dir>/examples/visual-first/deck.json" --project-root "<skill-dir>/examples/visual-first"
node "<skill-dir>/scripts/pack.mjs" build "<skill-dir>/examples/visual-first/deck.json" --out "<new-output>" --project-root "<skill-dir>/examples/visual-first"
```
