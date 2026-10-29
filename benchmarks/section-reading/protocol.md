# 必要節読込の実行監査

これは実タスクを完遂するベンチマークではない。新しい独立readerが自然文の依頼から親の各工程の手順を選び、そのために実際にtoolへ返された運用文書のstdout bytesを測る。コード・Web・UI制作・子起動は実施せず、子の読込量、会話全体のtoken、利用枠、速度、品質への効果は測らない。

## 条件の固定

- before: `<tmp>/harness-sections-before-d7dgz7zn`、after: `<repo>`。どちらも同じ `code.md` / `mixed.md` の内容を渡す。最初の4件、receipt対応後のafter 2件、案内修正後のafter 2件を、それぞれ履歴を共有しない新規reader（`fork_turns=none`）で実行した。
- 完走8件を同一model/effort（`gpt-6.1-sol/high`）で起動し、実際の起動値をrun manifestへ記録した。各fixtureの前後で同一の実効設定を渡す。初回既読資料は0、各run間の記憶・読込結果の共有なし。初回codeは依頼要約と共通指示で開始し、fixture原文全文も追加messageで共通に渡した。条件は同じinstruction・依頼原文・設定であり、開始message全体の唯一の文字列一致を保証する設計ではない。
- active/delegation/review/persistence/measurement/improvement_loop=true、max_agents=3、model_selection=auto、model pinなし。外部AI相談OFF等はfixtureに記載したユーザーの上書きを適用する。
- readerには最初にSKILL.mdを読むことだけを指定する。全文・任意行・任意headingの読取と索引を前後とも同じ条件で許可する。必要節の既定リストや模範解答を与えない。
- 監査wrapperの各tool呼出しは `max_output_tokens: 30000`。同一の上限で返し、truncationは不可。wrapperはstdoutが24,000 bytesを超える操作を本文返却前に拒否するので、その場合は自分で小さい範囲を選ぶ。tool側がtruncationを示したrunは比較に使わず再実行する。

## 起動とreaderに渡す共通指示

coordinatorがinitを実行する。run先は新規ディレクトリ（親は既存）を指定する。

```sh
node scripts/section-reading-audit.cjs init --root <tmp>/harness-sections-before-d7dgz7zn --run <tmp>/section-code-before --label before --scenario code --model MODEL --effort EFFORT
```

readerにはfixture全文と以下を渡し、ROOT/RUN/AUDITをそのrunの値に置き換える。before/afterの他方の内容・測定値・期待削減率は知らせない。

> あなたは運用手順の独立readerです。渡された依頼を、準備から各工程へ進む親の立場で検討してください。実コード作業・Web検索・制作・子起動・coordinator runtimeの実行・外部AI相談はせず、必要な運用資料を実際に読んで各工程の適用手順を判断してください。起動statusは取得済みで実効設定は提示値です。まずROOT内 `plugins/codex-harness/skills/harness/SKILL.md` を読んでください。それ以後の読む資料と範囲は自分で選択してください。必要があれば全文、任意の行、heading、索引を利用できます。複合依頼の承認待ちでは実行を進めず、承認後の工程は手順選択の予行として扱ってください。worker自身の追加資料は今回の対象外です。親へ渡すパケットに必要な規則は確認してください。
>
> すべての運用文書の読取・索引取得・専用reader実行はAUDITのみを通してください。`cat/sed/rg`等の直接読取や他のファイルAPIは禁止です。AUDITは計測用スクリプトで、読む必要はありません。toolは `functions.exec`の先頭へ `// @exec: {"max_output_tokens": 30000}` を置き、`tools.exec_command`を1回ずつ呼び、その引数も `max_output_tokens: 30000`を指定し、出力を `text`へ改変せず渡してください。tool出力が省略されたら報告してください。
>
> 終わったら、工程ごとの選択理由、必要な承認/機能OFF/役割境界、読んだ資料では判断できない点を短く報告してください。読込量の優劣や削減率は予測しないでください。

読取コマンドの構文は前後共通。PATHはROOTからの相対パス。

```sh
node AUDIT read --run RUN --path PATH
node AUDIT read --run RUN --path PATH --lines 10:40
node AUDIT read --run RUN --path PATH --heading '見出しの文字列'
node AUDIT headings --run RUN --path PATH
node AUDIT reader --run RUN --tool harness -- TOPIC SECTION...
node AUDIT reader --run RUN --tool html-plan -- TOPIC SECTION...
```

最後の2形式は対象ROOTに専用readerが存在する場合だけ使える。readerの引数はそのROOTの案内で発見する。両ROOTの許可される読取対象はharnessおよびcodex-html-planのskill配下のMarkdown。fixture、status、モデル候補等の共通プロンプトは条件資料であり、実stdout集計の外とする。監査起動/summaryのstdoutも読込量には含めない。

## 実行済み履歴と品質補足

- baselineのcode/mixed、最初の実装のafter code/mixedを実施。最初のafterは両caseでstdoutが増加した。
- receipt対応を試すcodeは監査wrapperのreceipt引数非対応が判明し4readで中断、同時に準備したmixedはinitのみで未開始。両方のrawも保存し、比較から除外した。
- [wrapper旧版](versions/audit-v1.cjs)をbyte完全保存してreader引数検証だけ修正。既存beforeのread/headings全46操作を旧新で再生し、保存済みstdoutと完全一致、時刻・hash-chain以外のevent値も一致した。本文・索引・metadataの計算法は不変。[版の説明](versions/README.md)にhashと差分を記録した。
- receipt対応後のafter code/mixed、続いて専用readerの案内修正後の最終after code/mixedを新規独立readerで実施した。開発中の異なる版を比較しており、同じ固定版の反復標本ではない。読込先の正解リストや目標bytesは渡していない。
- codeの4runには以下を同一文面で追加した。同じrun内の追記なので、追加本文・索引・metadata・重複・失敗をすべて累積する。mixedにはこの追加を行っていない。最終比較はcodeを補足後同士、mixedを各初回同士で比較する。

> 同じrun・同じAUDIT条件で品質点検を1点追加します。起動statusを含む、今回使用するCLIの共通設定・保存先・読取/書込境界を確認してください。既読の同義本文で満たす場合はその場所を示し、不足があれば必要部分だけAUDITで追加読取してください。起動runtime/子/実作業はせず、追加で確認した規則と未読のままでも非該当な規則を報告してください。読込量の目標や優劣予測はありません。

最終runと品質補足を最後として固定し、結果の増減を理由に追加の再試験や設計変更は行わない。初回境界は各runの `initial-summary.json` で保持し、累積最終値と分けて報告する。共通promptや品質補足messageは前後とも条件資料として本文stdout集計の外とする。

## 収集と解釈

```sh
node scripts/section-reading-audit.cjs summary --run <tmp>/section-code-before
node scripts/section-reading-audit.cjs summary --run benchmarks/section-reading/runs/final-after-code
node scripts/section-reading-collect.cjs --check
```

run.jsonは設定・モデル・fixture/script hashを記録する。各本文stdoutとstderrを未加工で連番保存し、events.jsonlへpath/range・source hash・body/metadata/index bytes・過去に返した同一source行の重複bytes・stdout hash・前event hashを追記する。summaryはchainと出力hashを検証する。監査は協調的な計測でありOS sandboxではないため、coordinatorがreaderのtool履歴も確認し、直接読取・切詰め・失敗を別記する。stderrと失敗数も隠さない。

総stdout、本文、metadata、索引、重複本文を区別する。重複込みの実stdoutを主指標とし、差分は同じfixtureのbefore/afterだけを比較する。readerの選択理由を確認し、未読の必須規則・誤った手順があれば読込量だけで改善と結論しない。1ケース1runなので選択差のばらつきを推定できず、同一モデルでも決定的な因果効果ではない。既存の全文ルート見積りとも区別する。

全10件のrawを `runs/` にbyte完全copyし、元のrun/events/stdout/stderr/initial-summaryを変更していない。`runs/manifest.json` は元のパスと全rawのbytes/hash、各 `summary.json` はchain検証後の派生値を保持する。`measurements.json` は全履歴の集計、初回境界、補足分、資料別帰属を持つ。共有索引のうち特定文書へ帰属できないものはotherに残し、全stdoutをちょうど一度ずつ加算する。stdout+stderrも別表示する。原規則の保持は独立レビューの別証拠で確認し、byte減少をその証明に用いない。
