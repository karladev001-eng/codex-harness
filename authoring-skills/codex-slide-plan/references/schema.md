# deck.json v1 とpack

`examples/deck.json`が機械実行可能な契約例。独立スキル内にpackage不要、Node22+。CLIは常にJSON結果、失敗は非zero。`validate`で構造と出典status、`hash`で通読確認用hash、`build`でrevision/案ごとの成果物、`bundle`でmanifest指定ファイルだけの移動可能コピー、`feedback-check`で対象と版の照合を行う。`build`が警告を返す場合は要再確認を解消するか、未検証/仮値として提示する。

| 正本キー | 内容 |
| --- | --- |
| schemaVersion/id/revision/title | `1`、安定deck ID、immutable版ID、タイトル |
| purpose/audience/message/expectedOutcome | 目的、聞き手、要旨、理解・判断 |
| durationSeconds/timing | 持ち時間、`charactersPerMinute`。未指定時速度300文字/分を明示 |
| chapters/unresolved/requestedSlides | `{id,title}`配列、制作未解決事項配列、指定枚数（表紙含む） |
| slides | `{id,chapter,role,title,message,talkingPoints,notes,transition,seconds,layoutId,sourceIds,elements,paragraphs}` |
| paragraphs | `{id,text,sourceIds}`。読み上げできる文章、slide内安定ID |
| elements | `{id,kind,sourceIds,...}`。heading/text/list/image/diagram/chart/table |
| variants | `{id,name,storyId,themeId,layouts:{slideId:layoutId}}`。内容を重複せず見た目だけ指定 |
| sources/assets/files | registryと明示選択artifact path。相対pathのみ、symlink/secret/逸脱拒否 |
| coherence | `{revision,contentHash,reviewer,checkedAt,checks:[{item,result,evidence}],findings,unchecked}` |
| catalog | 追加`stories/layouts/themes`。標準のIDと衝突拒否 |
| master/taskReference | 読取範囲・HTMLへの対応/差分/未確認、既存依頼判断記録への参照 |

heading/textは`text`、listは`items`。image/diagramは`assetId,alt,caption`。ページ画像しかないときは`regionSelectable:true`を付ける。tableは`columns`と`rows:[{id,cells}]`、chartは`series:[{id,label,value}],unit`（初期barは非負の有限値）。結果table/chartは各elementにsourceIdsが必須で、空なら要再確認。元データは`dataRef:{path,position}`、明示filesへの収録が必須。

source kind:

- `web`: title/url/author/date/location/checkedAt/scope/verified。http(s)直接URL、取得日と確認範囲。
- `project`: title/path/position/sha256/checkedAt、必要ならlineRange:[start,end]かheading。プロジェクトrootに実在する位置を検査。`copy:true`の明示時だけsources/<path>へ原本を同梱する。
- `data`: projectと同じpath/hash（deckディレクトリ内）+columns/unit/period/filters。行/キー/シート範囲はpositionへ。
- `derived`: inputIds/formula/code/output/unit/population/missing/checkedAt。実行を自動開始せず、標準集計ツールで確認したコードと出力を保存。
- `concept`: title/label/checkedAt。`仮値`/`提案`/`概念図`のラベルを表示する。

sha256はファイルbytesのSHA-256。packはWebをfetchしない。閲覧記録をverifiedにするのはCodexが原本を確認したときのみ。ローカル未同梱出典は相対pathと位置をコピーできるが、「元プロジェクトが必要」と表示する。commit固定URLはverifiedなGit remoteからCodexが作成した場合だけWeb registryへ記録する。任意のabsolute pathを共有リンクにしない。

assetは`id,file,originals,origin,license,regenerate,slideIds,sourceIds`。fileはassets/配下。原本一覧は実在ファイルのみ。filesでdata/scripts/references/layouts等の必要最小限を明示収録する。読み込めない、symlink、許可外形式、active/external SVG、path逸脱はpack失敗。原本は変更しない。

独自layout: `{id,version,name,purpose,fits,avoids,needs,quantity,structure,adjust,prompt,preview,grid:{columns,rows,slots:[{elementId,row,column,rowSpan,columnSpan}]}}`。gridは1–12で安全な数値だけ。master参照等で自由配置が必要なら`canvas:{slots:[{elementId,x,y,width,height}]}`、`titleBox`/`messageBox`同形式、`hideKicker:true`。canvasは百分率0–100、page内だけで原本座標との対応を記録。CSS/HTML任意注入は受け付けない。テーマは`id,name,background,ink,accent,muted,font,ratio:[16,9],padding,footer`。配色は6桁hex、fontはローカル書体名・fallbackのみ。

生成配置:

```text
<out>/<revision>/<variant>/
  deck.json, story.md, script.md, review.html, sources.json, catalog.json
  assets/registry.json + 選択した素材原本/表示素材
  data/, scripts/, references/, sources/ + 明示収録だけ
  output/slides.html
  bundle-manifest.json   個別file/hashとdeck/revision/variant/contentHash
```

bundleはmanifest hashを再検査し、新しい先へだけ作成する。1回に1案。複数案は同じ<out>へ各案をbundleして相対比較リンクを保持する。既存先にはmergeしない。素材の個別downloadはHTMLの素材タブにある。ブラウザがローカル位置へ移動できないときはpathコピーを使う。

フィードバックJSON: `{schemaVersion:1,identity:{deckId,revision,variantId,contentHash},comments:[{id,target,quote,replacement,intent}]}`。targetは`kind,slideId,page,elementId,paragraphId,findingId,sourceId,rowId,column,seriesId,dataRef,region`の該当フィールド。regionは0–1の正規化x/y/width/height。画像領域は元PPTXオブジェクトIDとは言わない。別版/消滅対象は自動適用せず手動照合する。
