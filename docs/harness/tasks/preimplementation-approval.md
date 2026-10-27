# タスク: preimplementation-approval

関連する後続計画: [codex-html-plan](codex-html-plan.md) — この承認ルールを使う対話型仕様スキル（仕様v2・実装導入完了）。[承認前HTMLモック（履歴）](../previews/codex-html-plan.html)と[開くコマンド](codex-html-plan.md#関連ドキュメントとhtmlの開き方)を参照。

- 状態: done
- 仕様版: 1
- 開始: 2026-10-08T05:37:05+00:00
- 基点: 82586eda58699e6d44e656689586e220befe41af と依頼開始時の既存未コミット変更
- snapshot: /var/folders/5n/58z5gr_d2hjgv6nrfz6r9gvh0000gn/T/harness-approval-4vims4v1
- 実効設定: active/delegation/review/persistence/measurement/improvement_loop=true、max_agents=3、auto、pinなし。
- 担当: 既存の実装担当Sol6.1/medium、独立レビュー担当Sol6.1/highを同一ルールの改訂として継続。ホストcollaborationツールの候補と対応effortは指定に一致。初回fork_turns=none。
- 作業: 既存checkoutで直列、既存変更を保持、commit/stash/reset/pushなし。
- 対象: SKILL.md、assets/task.md、references/reviewer.md（plugins/codex-harness/skills/harness配下）、README.md、SPEC.md。導入用3文書も更新。

## 説明・目的・対象範囲

実装前に全体像を確認できるよう、説明・仕様・必要なUIモックの提示後、未解決事項の有無と独立して明示的な実装承認を待つルールへ改訂する。先行タスクpreimplementation-specの「毎回承認を追加しない」は今回の依頼で置き換える。過去の完了記録は歴史として保持する。

大きな実装は全体の目的、主要機能/画面と流れ、対象内外、構成や依存関係、段階分けを見渡せる概要を提示してから承認を得る。確定した仕様と未解決事項を分け、未解決事項には影響、選択肢/提案、判断が必要な事項を記す。UI・runtime・新状態enumやCLI schemaの変更、html-plan導入は対象外。

## 受入条件

1. 必要な説明/仕様/モックを提示後、現仕様版・範囲への明示的なユーザー承認まで本実装・実装担当への着手指示・production組込みを開始しない。未解決事項ゼロでも待つ。調査、仕様、モックなどの準備は可能。
2. 沈黙、経過時間、未操作の既定選択、質問への回答のみ、資料提示前の一般的な実装依頼を承認とみなさない。回答と実装承認は別欄・別記録。同じ発言に両方が明示されれば記録可能。すでに同じ版・範囲が明示承認済みなら重複確認はしない。上位指示・現在のユーザー指示に従う。
3. 未解決事項を確定仕様と分けた独立欄にまとめる。なしの場合も記す。承認だけで未解決の実装必須判断を勝手に補完せず、その影響範囲は解決または明示的な除外/委任まで開始しない。
4. 大きな実装は個別タスクの実装着手前に全体像を提示し承認を得る。承認範囲内の分割タスクには親仕様版・承認範囲を引き継ぎ、単なる分割で承認を取り直さない。部分承認ならその範囲だけ開始可能。
5. 承認待ちではplannedのまま承認欄をpendingにする等、既存状態schemaを保ち、readyは提示と承認の両方を満たした実装タスクだけ。パケットに提示証拠・承認状態・対象仕様版/範囲・ユーザー発言根拠を記録。保存OFFでも会話内で同契約。実装担当受領/レビューで確認する。
6. 仕様変更で振る舞い、UI、範囲、重要な設計判断を変更する場合は影響範囲を止め、更新・再提示・再承認後に開始。誤字等の意味を変えない修正は承認範囲を維持し差分を記録できる。承認範囲内の通常の検証・修正に毎回確認を強制しない。
7. 既存active/inactive・delegation/review/improvement_loop・保存OFF・純調査の適用境界を保持。5文書の旧「承認待ちを追加しない」指示を矛盾なく改訂。ドキュメントリンクと独立レビュー、build/隔離導入/実導入一致を確認。既存設定、記録、無関係の導入ファイルを保持する。

## 未解決事項

なし。html-planの導入は別範囲。

## 事前提示・今回の許可

ユーザーの明示依頼: 「未解決事項は分けて書くことと、承認を待つことを入れましょう。」直前の説明済みのルール案に対する具体的な修正依頼として、この文書ルール改訂と実導入を実行する。会話でも説明・仕様・必要なモックの提示後の承認待ち、独立した未解決事項欄、大きな実装の全体像と承認範囲を説明済み。今回UI変更はなくモック非該当。

## 進捗・完了

開始利用枠: null。独立レビュー・導入・終了時刻を追記する。

担当5文書を改訂。独立ソースレビューは受入1〜6と7の文書整合PASS、修正指摘なし、リンク40件とgit diff --check PASS。npm run build成功、source/standalone/pluginの3文書一致。隔離HOMEで標準install、全ファイル一致、再install unchanged、status activeを確認。

実導入時に未所有のmacOSメタデータ .DS_Store、references/.DS_Store が検出され標準installerが停止。他の導入ファイルにはmanifestからの変更なし。2件を /Users/kan/.codex/harness/backups/macos-metadata-mmipzyb5 に保存退避し、snapshotとのbytes一致を検証。導入用stageからも同メタデータを除き、再install成功。旧版backup /Users/kan/.codex/harness/backups/install-vkbg1K。実導入先 /Users/kan/.agents/skills/codex-harness。

親検証: sourceとliveの新3文書一致、stage/live全ファイル/所有manifest一致、snapshot保存の入口・設定・記録fingerprint全件維持、実runtime status active、git diff --check PASS。コード変更なしのため全テストスイートは未実行。承認条件は指示による運用で、runtimeの機械的実行阻止は追加していない。最終独立導入レビューPASS。

最終受入: 1〜7すべてPASS。独立確認で46ファイルのstage/live/manifest一致、3文書更新とメタデータ2件退避以外の変更なし、fingerprint7件保持を確認。レビュー修正0巡。commit/pushなし。終了 2026-10-08T05:46:43.786700+00:00。利用枠前後null。
