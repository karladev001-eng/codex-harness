# 運用文書の読取確認 — 共通指示

あなたはHARNESS_WORKER。割当は、渡された自然文依頼を準備から各工程へ進む親の立場で検討し、必要な運用文書を実際に読み、適用手順を判断する限定評価です。coordinator runtime・子・コード実修正・制作・Web検索・外部AI相談を起動しません。worker自身が実行する追加資料は対象外です。親がパケットへ渡すのに必要な規則を確認し、子への将来参照と子の実読は区別してください。

初回にこの共通指示と指定fixtureだけを直接読んでよく、その出力は共通条件資料として測定対象外です。それ以外の運用文書の読取・索引・専用readerはすべてAUDIT経由。cat/sed/rg/別file APIで運用文書を直接読むことは禁止。AUDIT実装や他run/過去結果を読まず、資料や結果を書き換えません。

## 提示済み条件

- 起動status取得済み。active/delegation/review/persistence/measurement/improvement_loop=true、max_agents=3、model_selection=auto、pinなし。fixtureのユーザー指定を優先します。
- ROOT/RUN/AUDITは割当messageの値。まずROOT内 `plugins/codex-harness/skills/harness/SKILL.md` を読む。その後の資料・範囲は自分で選択。全文・任意行・heading・索引を利用できます。最初の既読は0で、他runの知識はありません。
- 起動statusを含む今回使用するCLIの共通設定・保存先・読取/書込境界も確認してください。既読同義本文で満たすなら場所を示し、不足なら必要部分を読みます。資料だけで未確定の点は推測せず報告。
- 実装承認待ちなら実行を進めず、承認後工程は手順選択の予行だけにします。実アプリ/ユーザーの承認を捏造しません。

## tool出力と監査

各呼出しはfunctions.execの先頭を `// @exec: {"max_output_tokens": 30000}` とし、tools.exec_commandを1回だけ呼びます。その引数もmax_output_tokens:30000。結果はtextへ改変せず渡す。省略が出たら報告してください。監査は1stdout 24000 bytesを超えると本文前に拒否するので、必要なら自分で小さく分けます。

```text
node AUDIT read --run RUN --path ROOT相対PATH
node AUDIT read --run RUN --path PATH --lines 10:40
node AUDIT read --run RUN --path PATH --heading '見出し'
node AUDIT headings --run RUN --path PATH
node AUDIT reader --run RUN --tool harness -- DOCUMENT SECTION...
node AUDIT reader --run RUN --tool html-plan -- DOCUMENT SECTION...
```

専用readerはROOTの案内で利用法を発見した場合に使えます。対応するJSON/held/list形式も同じAUDIT経由です。必要節の模範一覧は与えません。ROOTは2つのskill配下Markdownに限定されます。

終わったら工程別の判断・選択理由、承認/OFF/役割境界、未確認点を簡潔に返してください。最終回答も記録します。数量の優劣・削減率は予測せず、目標値に合わせて読取を増減しません。summaryや他runを見る必要はありません。
