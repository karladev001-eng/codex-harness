# 必要節読込の実測結果

測定日: 2026-10-24（Asia/Tokyo）。同じ自然文fixtureで親の手順選択を予行した単回測定では、最終版の総stdoutはコード修正で **17.99%増**、複合依頼で **5.14%減**だった。コード修正の総量削減は確認できなかった。複合の減少にもhelper対象外の部分読取の選択差が大きく寄与しており、helperだけによる効果とは扱わない。

| 最終比較の境界 | before stdout bytes | 最終after stdout bytes | 差 | 変化 |
|---|---:|---:|---:|---:|
| コード修正・共通品質補足後 | 61,579 | 72,660 | +11,081 | +17.99% |
| 複合依頼・初回全体 | 103,889 | 98,553 | −5,336 | −5.14% |

## 何を測ったか

新規独立readerが[コード修正](code.md)または[複合依頼](mixed.md)から、準備・各工程で親が必要と判断した運用文書を実際に読んだ。コード実行・UI制作・Web検索・子起動・外部AI相談は行っていない。承認後の工程も手順選択の予行に限る。子が実際に追加で読む量、実タスク完遂、全工程、品質、会話全token、利用枠、速度の改善は未測定。子に渡す規則を親が選ぶ部分は含むが、子への読込移管を総量削減とは主張しない。

全完走runのモデルは `gpt-6.1-sol/high`、設定とbudgetは同じ。毎回 `fork_turns=none`、既読0から独立に開始し、他runの結果を渡していない。beforeにも全文・任意行・heading・索引による部分読取を許した。fixture hashはcase内で一致し、外部AI相談OFFやcodeの仕様v1承認、mixedの実装承認待ちも同じ。共通指示と依頼原文を渡したが、開始messageの全文字列が唯一の形式で一致した試験ではない。codeは要約による開始後にfixture原文も共通messageとして渡している。

前後の共通prompt・取得済みstatus・fixture・品質補足message・測定用init/summary出力は読込量の外。本文stdout、専用readerのmetadata、索引、重複はすべて含む。stderrも別表示する。単なるファイル全文量の見積りとは区別する。

## 初回から最終までの履歴

最初の4件で増加を観測後、既読receipt機能を実装してafter 2件、さらに案内を修正してafter 2件を実施した。これは開発中の異なる版の履歴であり、固定版の反復実験ではない。最後の2件とcode品質補足で終了し、数値を理由に追加の再試験や設計変更はしていない。途中の増加を最終結果で上書きしない。

| 実装段階 | code初回 stdout | mixed初回 stdout |
|---|---:|---:|
| before | 52,072 | 103,889 |
| 最初のafter | 61,664 | 107,199 |
| receipt対応after | 54,944 | 101,325 |
| 最終案内after | 64,286 | 98,553 |

code各runには、使用CLIの共通設定・保存先・読取/書込境界を確認する同一品質補足を追加した。初回の未確認部分を放置して最小値だけを採用せず、補足時の余分な読取・重複・失敗も累積した。追加文面は次の通り。

> 同じrun・同じAUDIT条件で品質点検を1点追加します。起動statusを含む、今回使用するCLIの共通設定・保存先・読取/書込境界を確認してください。既読の同義本文で満たす場合はその場所を示し、不足があれば必要部分だけAUDITで追加読取してください。起動runtime/子/実作業はせず、追加で確認した規則と未読のままでも非該当な規則を報告してください。読込量の目標や優劣予測はありません。

| codeの段階 | 初回 stdout | 補足の追加stdout | 補足後stdout | 補足後の重複本文 |
|---|---:|---:|---:|---:|
| before | 52,072 | 9,507 | 61,579 | 0 |
| 最初のafter | 61,664 | 6,597 | 68,261 | 3,990 |
| receipt対応after | 54,944 | 9,568 | 64,512 | 1,707 |
| 最終案内after | 64,286 | 8,374 | 72,660 | 3,760 |

receiptは保持している本文を指定する任意のstateless機能であり、全読取の重複を自動で消すものではない。最終codeでも品質補足により3,760 bytesの本文を再読した。重複を差し引いた仮想値で実stdoutの増加を隠さない。

## 全完走runの出力内訳

単位はbytes。codeはすべて補足後、mixedは初回全体。「本文重複」は本文に含まれる内数であり、totalへ再加算しない。失敗はtool呼出し件数。

| run | 本文 | metadata | 索引 | stdout | stderr | stdout+stderr | 本文重複 | 失敗 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| before-code | 61,518 | 0 | 61 | 61,579 | 51 | 61,630 | 0 | 1 |
| before-mixed | 103,291 | 0 | 598 | 103,889 | 51 | 103,940 | 0 | 1 |
| first-after-code | 67,531 | 669 | 61 | 68,261 | 51 | 68,312 | 3,990 | 1 |
| first-after-mixed | 106,088 | 1,111 | 0 | 107,199 | 0 | 107,199 | 3,042 | 0 |
| receipt-after-code | 63,214 | 943 | 355 | 64,512 | 0 | 64,512 | 1,707 | 0 |
| receipt-after-mixed | 98,121 | 2,232 | 972 | 101,325 | 0 | 101,325 | 5,381 | 0 |
| final-after-code | 70,439 | 1,866 | 355 | 72,660 | 205 | 72,865 | 3,760 | 1 |
| final-after-mixed | 95,212 | 2,369 | 972 | 98,553 | 0 | 98,553 | 0 | 0 |

before-code・before-mixed・first-after-codeでは範囲外の行指定が各1回あり、各51 bytesのstderrを記録した。final-after-codeでは1回のreader呼出しでcommandsとrolesをまとめて指定して未知節エラーとなり、205 bytesのstderrを記録した。失敗本文は0 bytesで、修正後に返された資料を通常通り加算している。詳細は各runのstderr原本と[JSON](measurements.json)に残した。

## 同じ資料名による分解

commands/roles/blocksの原文path、専用reader出力のsource path、文書別索引から帰属を決めた。同じ名前の文書を前後で比較し、本文だけを選んでmetadataを除外する境界にはしていない。帰属できない共有索引はotherに置き、全stdoutを一度ずつ加算する。

| case / 資料group | before本文 | after本文 | before metadata | after metadata | before索引 | after索引 | before stdout | after stdout | stdout差 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| code / commands | 10,079 | 10,592 | 0 | 966 | 61 | 355 | 10,140 | 11,913 | +1,773 |
| code / roles | 7,339 | 6,247 | 0 | 416 | 0 | 0 | 7,339 | 6,663 | −676 |
| code / blocks | 0 | 4,624 | 0 | 484 | 0 | 0 | 0 | 5,108 | +5,108 |
| code / other | 44,100 | 48,976 | 0 | 0 | 0 | 0 | 44,100 | 48,976 | +4,876 |
| mixed / commands | 10,079 | 6,731 | 0 | 1,049 | 0 | 294 | 10,079 | 8,074 | −2,005 |
| mixed / roles | 7,339 | 6,247 | 0 | 416 | 0 | 0 | 7,339 | 6,663 | −676 |
| mixed / blocks | 9,732 | 8,767 | 0 | 904 | 598 | 387 | 10,330 | 10,058 | −272 |
| mixed / other | 76,141 | 73,467 | 0 | 0 | 0 | 291 | 76,141 | 73,758 | −2,383 |

commands+roles合計の実stdoutはcodeで17,479→18,576（6.28%増）、mixedで17,418→14,737（15.39%減）。codeでも同groupの本文は17,418→16,839へ減ったが、metadata・索引・補足での再読を含めると実出力は増えた。役割資料単体の減少からcode総量削減を結論できない。

codeではbeforeが読まなかったblocksをafterが追加で5,108 bytes読んだ。early-compaction資料も0→3,992 bytesだった。入口SKILLは+671 bytes、HTML計画SKILLは+498 bytes、project-mapの選択差は−285 bytesで、otherの+4,876 bytesを説明する。品質補足のcommands本文重複3,760 bytesも累積値に残っている。

mixedではcreative-loop本文がbeforeの全文15,100 bytes（1:58）からafterの10,699 bytes（1:43）になり、本文差は−4,401 bytesだった。afterの同文書索引291 bytesを加えた実stdout差は−4,110 bytesで、総減少5,336 bytesの大半を占める。これはhelper対象外の自然な部分選択差である。独立点検ではrecord-keeper手順全文とcommandsのprefs節等への到達も確認され、親の契約を省略した節減とは扱われていないが、原規則保持の証拠は独立レビュー側にある。group分解によってhelper単独の因果効果を分離できたわけではない。

## 保存量と監査

配布元の同じ2ディレクトリ（harness skillとcodex-html-plan skill）全体も[一覧](source-inventory.json)で記録した。ベンチマークraw、他のrepo資材は含めない。

| ファイル量 | before | 最終after | 差 |
|---|---:|---:|---:|
| 全通常ファイルbytes | 658,360 | 687,492 | +29,132（4.42%増） |
| Markdown bytes | 140,916 | 148,901 | +7,985（5.67%増） |
| Markdownファイル数 | 37 | 38 | +1 |
| readerと節indexのbytes | 0 | 21,147 | +21,147 |

コード・資料の保存総量は増えている。選択読取の改善と保存量削減は別指標であり、保存量が減ったとは主張しない。

保存対象は完走8件に加えてsetup中断codeと未開始mixedの計10件。`interrupted-after-code` は4read・stdout16,258 bytesの時点で監査wrapperのreceipt引数非対応により中断したため比較から除外。保存raw自体には4成功readだけがあり、stderr0である。`not-started-after-mixed` はinitのみ、stdout0で比較から除外。失敗や中断を完走扱いしない。全履歴の観測総量は202呼出し・stdout694,236 bytes・stderr358 bytesであり、開発中の試行消費も省いていない。

旧wrapperをbyte完全copyした[履歴版](versions/audit-v1.cjs)のhashは初回4runのmanifestに一致する。旧版hashは `fd56671d85f4658cf4186cf4cb91e05c169ebaa7428751cb2d892d86fd7e66d7`、receipt対応監査版は `72143fc40338c97508588d247fd2297b8b9e3a32f5e4370bd882d2706cc453e5`。変更は専用reader引数の厳密な許可だけで、byte分類・本文照合・collector schemaは同じ。beforeの既存read/headings全46操作を旧新で再生して、stdoutと時刻/hash-chain以外のevent値の一致を確認した。

親がreading担当9件のtool履歴を点検し、全execがaudit経由、各呼出しに30,000 tokenの出力budget指定があり、`Warning: truncated` がないことを確認した。呼出し数は順に21/27/21/27/21/27/24/30/4でraw eventsと一致した。未開始mixedには呼出しがない。user promptや生rolloutはrepoへ保存せず、この確認結果だけを記録する。rawのhash-chain検証だけではホストの実表示の切詰めや直接read不在は判定できないため、この履歴確認を別に行っている。

## 再確認と限界

```sh
node scripts/section-reading-audit.cjs summary --run benchmarks/section-reading/runs/before-code
node scripts/section-reading-audit.cjs summary --run benchmarks/section-reading/runs/final-after-code
node scripts/section-reading-collect.cjs --check
```

[raw manifest](runs/manifest.json)に全rawのbytes/hashと元パス、各runに未加工stdout/stderr・events・run manifest・初回summary、派生の最終summaryを保存した。[measurements.json](measurements.json)には全履歴の初回/補足/最終値、各eventの資料帰属、失敗内容、fixture/audit/event hashを保持する。collectorは保存rawから再集計し、readerや実作業を再実行しない。

各case・各版1runなので選択のばらつきを推定できない。同じモデルでも選択は確定的ではなく、改善途中の観測を受けて実装と案内を修正している。最終結果から一般的な削減率やhelperの因果効果を保証しない。byte減少は必要規則・承認・機能OFF・役割境界を守ったことの証明でもない。原規則保持と品質点検は独立レビューの別証拠として評価する。
