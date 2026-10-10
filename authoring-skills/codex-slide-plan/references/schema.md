# deck.json schemaVersion 2 とpack

`examples/deck.json`が機械実行可能な契約例。独立スキル内にpackage不要、Node22+。CLIは常にJSON結果、失敗は非zero。`validate`で構造と出典status、`hash`で内容/描画/ファイルhash、`build`でrevision/案ごとの成果物、`bundle`でmanifest指定ファイルだけの移動可能コピー、`feedback-check`で対象と版の照合を行う。`build`が警告を返す場合は要再確認を解消するか、未検証/仮値として提示する。

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
| reviews | 見た目・ページ要点・全体の流れのモデル審査記録。省略時は全対象が審査待ち |
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

assetは`id,file,originals,origin,license,regenerate,slideIds,sourceIds`。`preview:true`なら256KB以下の表示画像だけをHTMLへ埋込み、単体HTMLの選択プレビューにする。大きな原本はbundleに保持する。fileはassets/配下。原本一覧は実在ファイルのみ。filesでdata/scripts/references/layouts/evidence等の必要最小限を明示収録する。読み込めない、symlink、許可外形式、active/external SVG、path逸脱はpack失敗。原本は変更しない。

自由配置: `slides[].layout`へ`{grid:{columns,rows,slots:[{elementId,row,column,rowSpan,columnSpan}]}}`。gridは1–12で安全な数値だけ。master参照等で自由配置が必要なら`canvas:{slots:[{elementId,x,y,width,height}]}`、`titleBox`/`messageBox`同形式、`hideKicker:true`。canvasは百分率0–100、page内だけで原本座標との対応を記録。CSS/HTML任意注入は受け付けない。配色は任意の `design.theme`（ID省略可）へ指定する。比較やマスター対応に必要な場合だけ `design.themes` / `design.layouts` 配列とデッキ内IDを使う。テーマは`id,name,background,ink,accent,muted,font,ratio:[16,9],padding,footer`。配色は6桁hex、fontはローカル書体名・fallbackのみ。

生成配置:

```text
<out>/<revision>/<variant>/
  deck.json, story.md, script.md, review.html, sources.json
  assets/registry.json + 選択した素材原本/表示素材
  data/, scripts/, references/, sources/ + 明示収録だけ
  output/slides.html
  reviews.json           variant別の実効状態・対象coverage・失効理由
  evidence/             明示選択した審査証拠（存在する場合）
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

## 固定キャンバスと描画診断（仕様v6）

すべての表示は1280px幅の論理キャンバスを共有する。高さはテーマratioから計算し、16:9は720px、4:3は960px。スライドの文字・余白・図表・フッターは論理px、master座標は同じキャンバス上の百分率。外側のslide-frameだけを等比拡大縮小し、スライド内のvw/小画面用フォント変更はしない。拡大時は利用可能な幅と高さの小さい倍率に収める。フォントはローカル指定とfallbackのみ。画像/フォント読込、details再展開、resize、拡大解除時に再計算する。

slide.titleとslide.messageが前後空白を除いて同じ場合、キャンバスでは見出し一回だけ表示する。message正本とレビュー内コメント対象は保持する。別文の場合は両方表示する。表現の重複を省く措置であり、別の主張を機械的に削る機能ではない。

通常配置では本文領域とslide-footerを分離する。あふれを隠して完成扱いにしない。描画座標診断は表示中のページのみを対象にし、フォント・画像を待った後、transformから論理座標へ逆変換する。要素/文字片の座標、境界外、scroll寸法によるあふれ、要素交差、フッター交差をJSONへ保存できる。隠れたページ、読込失敗、実使用フォントの代替未確認は記録を読む担当が確認する。DOM座標は補助であり、見た目・意味のPASSを生成しない。

意図した重ね表現はlayout.intentionalOverlaps:[{first,second,reason}]へ記録できる。対象はelement IDまたはtitle/message/footer。背景等の重なりを理由付きで診断から除外し、除外した組と理由も残す。マスター/variantで選ばれたlayoutにも適用する。単なる衝突の無視に使わず、モデルの見た目審査で妥当性を確認する。

## 審査・証拠・失効（仕様v6）

ブラウザにモデルや外部AIサービスを追加しない。Codexが内容を読み、利用可能で許可された実表示を確認して記録を作る。records自体は確認の申告であり、packは聞き手による理解や見た目の正しさを保証しない。独立担当が使えない場合はreviewMode:selfと制約を記録する。旧coherenceは原稿通読の互換記録で、新しい三種類の審査coverageを代替しない。

```json
{
  "reviews": [{
    "id": "page-S01-A",
    "kind": "page",
    "slideId": "S01",
    "identity": {"deckId":"example", "revision":"r3", "variantId":"A", "contentHash":"<64 hex>", "rendererHash":"<64 hex>", "artifactHash":"<64 hex>"},
    "status": "pending",
    "reviewer": "Codex reviewer",
    "reviewMode": "self",
    "checkedAt": "2026-10-10",
    "verification": "semantic",
    "environment": {"surface":"canonical deck and script; HTML display unavailable"},
    "evidence": [],
    "checks": [{"item":"one primary message", "result":"pending", "reason":"Review the message and its visual emphasis together"}],
    "findings": [{"id":"F01", "target":{"slideId":"S01", "elementId":"summary"}, "severity":"major", "problem":"Two independent claims", "reason":"The listener needs two separate conclusions", "suggestion":"Split into two pages", "resolution":"open"}],
    "unchecked": ["Visual emphasis in actual HTML"]
  }]
}
```

- kind: visual/page/flow。visual/pageはslideId必須、flowはdeck全体（slideIdを付けない）。すべてvariant別に記録する。
- status: pending（審査待ち/未検証）、changes（要修正）、verified（記録した検証種類/担当による確認済み）。reviewMode:self/independent、verification:rendered/semantic/structureを明示する。renderedは実HTMLの表示と画像を見た審査、semanticはモデルの意味内容審査、structureは構造/操作/DOMの検査。
- reviewer/checkedAt/environment.surface/evidence/checks/findings/uncheckedは必須。checksはitem/result/reason、findingはtarget（slideIdと任意elementId/paragraphId）、severity:major/minor、problem/reason/suggestion、resolution:open/resolved/intentional。resolved/intentionalにはresolutionReasonを要する。
- verifiedはchecksが存在しunchecked/未解消findingがない場合のみ。visual verifiedにはverification:renderedと一つ以上の実表示の証拠画像（PNG/JPEG/WebP/GIF）、page/flow verifiedにはverification:semanticが必須。structureだけでいずれもverifiedにしない。実表示できないvisualはpendingのまま。
- evidence:[{path,sha256}]は安全な相対pathのevidence/配下、deck.filesに明示収録する。出典/素材/dataRef/master等の本体と兼用しない。証拠追加だけで本体が変わらないよう専用領域を設ける。ファイルSHAは実bytesと照合し、不一致/欠落は審査待ち。存在する証拠はbundleに収録し、bundle-manifestはdeck/review/証拠の完全bytesを検査する。危険path・symlink・active SVG等の拒否は既存と同じ。
- contentHashはdeckの内容+デザイン（原稿、sources、assets registry等）を対象とし、coherence/reviewsと専用証拠のfiles項目を除く。rendererHashはpack.mjs/style.css/review.js bytesのSHA、artifactHashは明示files/素材/集計コード/出典の実bytes（専用証拠を除く）の指紋。未同梱project出典の読取状態も含める。審査の追加/証拠変更はhash循環を起こさず、本体のbytes変更では失効する。
- reviews.jsonとUIは各slide×variantのvisual/pageとvariant別flowを集計する。足りない対象はpending、重大未解消指摘はchanges。identityに差がある旧recordは削除せずstale/pendingにする。異なるrevision/contentの消滅対象も保存でき、旧コメントは手動照合する。証拠hash不一致/欠落もpending。複数の現行recordがある場合、一つでもchanges/pendingがあればその対象を確認済みにしない。

hash CLIは{contentHash,rendererHash,artifactHash}を返す（未同梱project出典は--project-rootで原本を指定）。exportsはcontentHash(deck)、async rendererHash()、async artifactHash(deck,root,projectRoot=root)、reviewIdentity(deck,variantId,rendererHash,artifactHash)、reviewReport(deck,variantId,rendererHash,evidenceIssues={},artifactHash)。pendingの古い記録はartifactHashを省略できるが現在版の証明が足りず失効する。verifiedには全hashが必要。記録を書き換えるとrendererHashは変わらず、rendererファイルの変更は失効を起こす。

実HTMLの全ページ・狭幅360/通常768/広幅1440・レビュー/単独/一覧/拡大での表示確認は、許可された実ブラウザで別途行う。数値を注入したDOM adapterや構文/生成物テストは実表示の証拠ではない。拒否された表示経路をlocalhost/headless等で迂回しない。実表示できない場合は未検証の案として提示する。
