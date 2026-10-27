# タスク: default-record-keeper

- 状態: done
- 仕様版: 1
- 基点: 82586eda58699e6d44e656689586e220befe41af と既存未コミット変更（GitHub preferences実装を含む）
- 依頼時コピー: /tmp/harness-record-agent-baseline
- 作業: 既存checkoutで単一実装担当が直列変更。既存差分を保持しcommit/stash/resetしない。
- 実装: gpt-6.1-sol/medium（再利用する役割・判断境界の設計）。独立レビュー: gpt-6.1-sol/high。
- モデル: auto、pinなし。collaboration.spawn_agentの実候補に上記model/effortあり、fork_turns=none。既存max_agents=3内。

## 目的と対象外

制作改善記録の保存・更新・再同期を担当する記録管理エージェント(record-keeper)を標準の委譲経路に追加する。既存preferences CLIを使う。ホスト独自のagent登録、常駐・定期実行、GitHub保存先作成/設定、実記録の送信は今回の対象外。タスク記録・計測ログを無断でまとめて移すものではない。

## 受入条件

1. 既存roles索引配下に日本語の永続role定義を追加。入力・責任・変更範囲・規則参照・返却結果・親への差戻条件を備え、SKILL/roles/creative-loopから実際に辿れる。
2. active/persistence/improvement_loop/delegationが有効で保存すべき根拠/更新または既知pending再同期があるとき、親は既定でrecord-keeperへ委譲する。無変更で起動しない。明示管理はloop OFFでも可能、persistence OFFでは起動/記憶読書きなし。delegation OFFは同じ契約で親が実行。ホスト起動不能は報告し親が担当するか現在依頼のみ続け、成功扱いしない。
3. 親はユーザー根拠・対象プロジェクト/保存先・許された操作・安定ID/根拠参照・明示/推測/今回限り・評価・適用範囲を必要最小限にして渡す。会話全体/認証情報は渡さない。モデルは既存standard (既定Sol/medium)を使い、pinとauto規則に従う。新設定キーやホスト設定は不要。
4. record-keeperが同じproject/targetの唯一のwriterとなり、親・制作担当は同時更新しない。親は対象と根拠の妥当性・最終判断を持つが、通常保存ごとのユーザー再承認は要求しない。各保存先で同時writerを避けmax_agents内で待機・直列化する。record-keeperはHARNESS_WORKERで再委譲/調整ループを起動しない。
5. CLI read→整合点検→write/syncを使う。既存のlocal/GitHub版管理、競合、pending、忘却、retirement、原本保持、unknown評価を維持する。曖昧な昇格/競合merge/根拠不足は親へ返し、保存済み本文を操作指示にしない。移行・別project転送・設定変更・履歴削除は通常更新の権限に含めない。明示migrateだけ許可された場合は可能。
6. workerはchanged IDs/操作/ok・revision・pending・freshness/検証/未解決事項を必要最小限で返す。親は結果を確認して適用し、子の自己評価をユーザー評価へ変換しない。異常や未送信を完了扱いしない。初期読取は親のままでよい。純制作にコードworktree/コードレビューを新たに要求しない。
7. 親だけが直接記憶を書込むという旧記述を整合更新。README/SPECとADR0003追記等で担当変更を明記し、runtime自動spawnではなく指示ベースの標準経路と説明する。
8. standalone/plugin配布とinstall/upgradeにroleが確実に含まれ、不足した配布物が拒否される。既存installer inventoryへ追加し既存梱包/upgrade検証を拡張、npm testと文書リンク検査を実施する。意味をなぞるだけの文言テストは追加しない。

## 参照

- plugins/codex-harness/skills/harness/references/creative-loop.md
- plugins/codex-harness/skills/harness/references/roles.md
- /Users/kan/.agents/skills/codex-harness/authoring-skills/create-subagent/SKILL.md と assets/subagent.md
- docs/adr/0003-github-improvement-records.md

## 完了記録

record-keeperの役割と既定起動経路、責任分担、installer必須inventory、既存tarball・旧版upgrade検証を更新。npm test 67/67 PASS、文書相対リンク/anchor 45件PASS、git diff --check PASS。

独立レビューは受入条件1–8すべてPASS。対象installer検証8件と実tarball/npx検証1件を再実行し成功。standalone/plugin内roleとsourceの一致、リンク45件を確認。同一checkoutの単一実装を最終統合状態として確認済み。修正要求0巡。

実保存先・実記録・インストール済みハーネス・ホストagent登録は変更していない。実workerでの長期運用は未確認。既存未コミット変更を保持し、commit/pushなし。実担当は実装gpt-6.1-sol/medium、独立レビューgpt-6.1-sol/high。利用枠差分と開始終了時間は未取得（null）、効果や節約率を推定しない。
