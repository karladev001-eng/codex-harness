# deck.json schemaVersion 2 とpack

`examples/deck.json`が機械実行可能な契約例。独立スキル内にpackage不要、Node22+。CLIは常にJSON結果、失敗は非zero。`validate`で構造と出典status、`hash`で通読確認用hash、`build`でrevision/案ごとの成果物、`bundle`でmanifest指定ファイルだけの移動可能コピー、`feedback-check`で対象と版の照合を行う。`build`が警告を返す場合は要再確認を解消するか、未検証/仮値として提示する。

| 正本キー | 内容 |
| --- | --- |
| schemaVersion/id/revision/title | `2`、安定deck ID、immutable版ID、タイトル |
| purpose/audience/message/expectedOutcome | 目的、聞き手、要旨、理解・判断 |
| durationSeconds/timing | 持ち時間、`charactersPerMinute`。未指定時速度300文字/分を明示 |
| chapters/unresolved/requestedSlides | `{id,title}`配列、制作未解決事項配列、指定枚数（表紙含む） |
| slides | `{id,chapter,role,title,message,talkingPoints,notes,transition,seconds,sourceIds,elements,paragraphs}` |
| paragraphs | `{id,text,sourceIds}`。読み上げできる文章、slide内安定ID |
| elements | `{id,kind,sourceIds,...}`。heading/text/list/image/diagram/chart/table |
| variants | 任意。省略時は単一案A。比較時のみ`{id,name,themeId,layouts:{slideId:layoutId}}` |
| sources/assets/files | registryと明示選択artifact path。相対pathのみ、symlink/secret/逸脱拒否 |
| coherence | `{revision,contentHash,reviewer,checkedAt,checks:[{item,result,evidence}],findings,unchecked}` |
| design / slides[].layout | 任意のデッキ固有の配色・配置。既定のテーマと単列表示だけで開始できる |
| citations | 省略/`review`でレビューのみ。`slide`でスライド脚注にも表示。slide/elementで個別上書き可 |
| master/taskReference | 読取範囲・HTMLへの対応/差分/未確認、既存依頼判断記録への参照 |

heading/textは`text`、listは`items`。image/diagramは`assetId,alt,caption`。ページ画像しかないときは`regionSelectable:true`を付ける。tableは`columns`と`rows:[{id,cells}]`、chartは`series:[{id,label,value}],unit`（初期barは非負の有限値）。結果table/chartは各elementにsourceIdsが必須で、空なら要再確認。元データは`dataRef:{path,position}`、明示filesへの収録が必須。

source kind:

- `web`: title/url/author/date/location/checkedAt/scope/verified。http(s)直接URL、取得日と確認範囲。
- `project`: title/path/position/sha256/checkedAt、必要ならlineRange:[start,end]かheading。プロジェクトrootに実在する位置を検査。`copy:true`の明示時だけsources/<path>へ原本を同梱する。
- `data`: projectと同じpath/hash（deckディレクトリ内）+columns/unit/period/filters。行/キー/シート範囲はpositionへ。
- `derived`: inputIds/formula/code/output/unit/population/missing/checkedAt。実行を自動開始せず、標準集計ツールで確認したコードと出力を保存。
- `concept`: title/label/checkedAt。`仮値`/`提案`/`概念図`のラベルを表示する。

sha256はファイルbytesのSHA-256。packはWebをfetchしない。閲覧記録をverifiedにするのはCodexが原本を確認したときのみ。ローカル未同梱出典は相対pathと位置をコピーできるが、「元プロジェクトが必要」と表示する。commit固定URLはverifiedなGit remoteからCodexが作成した場合だけWeb registryへ記録する。任意のabsolute pathを共有リンクにしない。

assetは`id,file,originals,origin,license,regenerate,slideIds,sourceIds`。`preview:true`なら256KB以下の表示画像だけをHTMLへ埋込み、単体HTMLの選択プレビューにする。大きな原本はbundleに保持する。fileはassets/配下。原本一覧は実在ファイルのみ。filesでdata/scripts/references/layouts等の必要最小限を明示収録する。読み込めない、symlink、許可外形式、active/external SVG、path逸脱はpack失敗。原本は変更しない。

自由配置: `slides[].layout`へ`{grid:{columns,rows,slots:[{elementId,row,column,rowSpan,columnSpan}]}}`。gridは1–12で安全な数値だけ。master参照等で自由配置が必要なら`canvas:{slots:[{elementId,x,y,width,height}]}`、`titleBox`/`messageBox`同形式、`hideKicker:true`。canvasは百分率0–100、page内だけで原本座標との対応を記録。CSS/HTML任意注入は受け付けない。配色は任意の `design.theme`（ID省略可）へ指定する。比較やマスター対応に必要な場合だけ `design.themes` / `design.layouts` 配列とデッキ内IDを使う。テーマは`id,name,background,ink,accent,muted,font,ratio:[16,9],padding,footer`。配色は6桁hex、fontはローカル書体名・fallbackのみ。

生成配置:

```text
<out>/<revision>/<variant>/
  deck.json, story.md, script.md, review.html, sources.json
  assets/registry.json + 選択した素材原本/表示素材
  data/, scripts/, references/, sources/ + 明示収録だけ
  output/slides.html
  bundle-manifest.json   個別file/hashとdeck/revision/variant/contentHash
```

bundleはmanifest hashを再検査し、新しい先へだけ作成する。1回に1案。複数案は同じ<out>へ各案をbundleして相対比較リンクを保持する。既存先にはmergeしない。素材の個別downloadは各ページの出典・素材欄にある。ブラウザがローカル位置へ移動できないときはpathコピーを使う。

フィードバックJSON: `{schemaVersion:1,identity:{deckId,revision,variantId,contentHash},comments:[{id,target,quote,replacement,intent}]}`。targetは`kind,slideId,page,elementId,paragraphId,findingId,sourceId,rowId,column,seriesId,dataRef,region`の該当フィールド。regionは0–1の正規化x/y/width/height。画像領域は元PPTXオブジェクトIDとは言わない。別版/消滅対象は自動適用せず手動照合する。


## 新規制作の最小指定

`design` / `variants` / `layout` を省略して始められる。各スライドの意味と原稿・素材を先に作り、必要なページへだけ `layout.grid` または `layout.canvas` を付ける。型の選択/登録はない。layout IDはマスター対応や案比較に必要な内部情報で、通常UIへ要求しない。実行例のS03は自由な2列配置を持つ。

```json
{"layout":{"grid":{"columns":2,"rows":1,"slots":[
  {"elementId":"graph","row":1,"column":1,"rowSpan":1,"columnSpan":1},
  {"elementId":"table","row":1,"column":2,"rowSpan":1,"columnSpan":1}
]}}}
```

単位/比較条件はelementの`unit`や`context`、表列名へ明示する。仮値・概念図等のsource `label` は脚注を非表示にしても表示する。`citations:"slide"`は必要なページや要素だけへ指定する。レビューには確認状態、直接URL、原本位置・集計条件・素材原本を残す。参照記録のhash等は補助の折りたたみに置く。

## 旧v2デッキの作業用移行

旧スキルv2の正本はschemaVersion 1。通常buildでは拒否し、明示的に新しいディレクトリへ移行する。

```sh
node "<skill-dir>/scripts/pack.mjs" migrate "<legacy-dir>/deck.json" --out "<new-working-dir>" --project-root "<original-project>"
node "<skill-dir>/scripts/pack.mjs" validate "<new-working-dir>/deck.json"
node "<skill-dir>/scripts/pack.mjs" build "<new-working-dir>/deck.json" --out "<new-working-dir>/revisions"
```

既存先、symlink、原本ディレクトリとの重なりを拒否する。使用したテーマ/配置だけを `design` に展開し、ID・内容・原稿・出典・データ・選択素材を保持する。旧表示の出典脚注を維持するため移行時は `citations:"slide"` にする。旧正本bytesを `references/legacy-deck.json`、旧通読記録とidentityをmigrationに残す。hashが変わるので通読確認は要再確認となり、旧コメントは自動移植しない。元の正本/旧出力/コメントはその場所に残る。収録したproject出典は作業コピーの同じ相対pathへ保持する。未同梱のproject根拠は元projectを `--project-root` で指定する。未対応IDや安全に読めない素材は移行を中止し、原本を保持する。`scripts/legacy-v1.json` は移行専用の非公開互換辞書で、新規制作には読み込まない。
