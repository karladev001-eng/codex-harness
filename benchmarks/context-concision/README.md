# 本文短文化の同集合比較

2026-10-24の改訂。既存正本を短文化し、新たな分割・ルータ・キャッシュ・通常利用のreceipt義務は追加していない。

| 対象 | before bytes | after bytes | 削減 |
|---|---:|---:|---:|
| 入口 | 4,790 | 3,507 | 26.78% |
| simple-codeの同一必要資料集合 | 72,703 | 63,917 | 12.08% |
| mixedの同一必要資料集合 | 107,445 | 96,221 | 10.45% |

数値はUTF-8の全文source bytes。双方に同一パス集合を使い、変更していないblocks・commands・役割詳細・assets等も分母へ含める。通常の読者が実際に読んだ量、モデルtoken、速度、品質の実測ではない。入口の2KB目標より規則の条件・義務・例外の保持を優先した。

[ファイル集合・前後サイズ・SHA-256](source-bytes.json)に各資料を列挙する。beforeは `<tmp>/harness-concision-before-8yeqipol` の作業前copy、afterは2026-10-24時点の改訂後snapshotで、既存 `benchmarks/context-verification/reading/materials/B/<同path>` と全hashが一致する。`tests/context-concision.test.cjs` はこの歴史snapshotのhash/合計を再確認する。現在の追加機能による文書改訂のbytesや削減率を保証する値ではない。現行の意味境界とsection hash/全行被覆は別に検証する。前後の集合は既存 `scripts/context-routing.cjs` のsimple-code/mixedの入口・Yes本文・必要詳細から重複を除いたもの。計測方式/集合を変えて削減率を増やさない。

旧規則の意味対応は `plugins/codex-harness/skills/harness/references/routing/rule-map.md`。原文そのままの保証から、現行本文の意味境界・全行被覆/依存/例外検証と独立レビューへ移行する。完全一致の歴史fixtureおよび `benchmarks/context-routing.*` / `benchmarks/section-reading/` のraw・数値は変更していない。既存collectorの `--check` は10件の保存run・raw hash・event chain・summary・fixture hashを確認し、readerを再実行しない。

確認済み: build、focused18 tests、docs link 212文書/983リンク/エラー0、既存collector10 runs。最終全体テスト・導入・独立レビューの結果はタスク正本へ記録する。
