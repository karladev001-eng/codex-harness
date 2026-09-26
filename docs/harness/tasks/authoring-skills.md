# タスク: authoring-skills — 独立したハーネス作成スキル群

- 状態: done
- 仕様版: 2（ユーザー補足を反映）
- コード基点: 非Git。/tmp/harness-authoring-before.json に変更前ハッシュ一覧
- 担当範囲: authoring-skills/。既存harness配布物・README・SPEC・runtimeは変更しない
- 依存: なし。非Gitのため同一checkoutで直列実装・独立レビュー

## 目的と対象外

ユーザー補足: 「現在のハーネスとは別で現在のハーネスは今回のスキルで簡単に作れるようになる感じです。」
独立したcreate-rulebooks/create-subagent/create-harnessを作る。短い自然言語から再利用可能な規則・担当定義・オーケストレーションを構築する。既存ハーネスは生成可能な一例であり依存先ではない。既存の設定・実行方式・導入先を変更しない。

## 受入条件

1. 3スキルは自己完結したSKILL.mdとして個別に導入できる。既存harness/runtime/固定モデルへの依存なし。
2. 共通入口は既定HARNESS.md（小さい索引）。既定配置はharness/rulebooks/<id>.md、harness/subagents/<id>.md、harness/workflows/<id>.md。既存/明示の入口・名前・保存先を優先し、未使用フォルダは作らない。リンクを実在確認する。
3. 規則は適用条件・手順・必要な記録契約（いつ/どこへ/何を/どう更新/確認）を含む。担当は入力・責務・変更範囲・規則参照・出力・停止条件。実行手順は開始条件・依存順・引継ぎ・完了判定・失敗/再試行/再開を必要に応じ定義する。
4. 短い指示を具体化しつつ、単発の記録を恒久規則化しない。記録文書と規則を区別し、既存を壊さず更新。指示と権限の優先関係を保つ。
5. 作成したmdは自動実行やホスト登録ではない。AGENTS.mdなど既存の読込入口へ必要最小限の参照を接続して運用可能にする。ツール上の機能・権限を捏造しない。サブエージェント作成依頼は定義の作成でありその場の起動を意味しない。
6. create-harnessは必要な構成だけ作り、常に分業・レビュー・計測を付けない。「現在のハーネス相当」と指定されたときは元を読み、必要な役割と設定条件・レビュー・引継ぎを保持する。
7. sourceはauthoring-skills/内にまとめ、既存ハーネスと独立である旨と使用例を説明。形式検証、既存テスト、独立担当による実ファイルレビューと一時領域での自然言語シナリオを実施する。

## 制約と参照

/Users/kan/.codex/skills/.system/skill-creator/SKILL.md
/Users/kan/.agents/skills/codex-harness/references/roles.md
公式資料: https://developers.openai.com/plugins/build/skills
今回の作業に適用される実効設定: enabled/delegation/review/persistence/measurement=true,max_agents=3。standard=gpt-5.6-terra/medium、review=gpt-5.6-sol/high。生成するスキルの要件にはこれらを持ち込まない。子は再委譲しない。

## 未解決事項

なし。

## 進捗・完了

開始: 2026-09-26。利用枠・正確な開始秒は未取得。既存テスト22件成功。
仕様版1から2への改訂により既存ハーネス編集を取りやめ、独立スキル群へ変更。

### 検証・レビュー（仕様版2）

- 成果物: authoring-skills/配下の3つの独立スキル、必要なテンプレート、README。
- 形式: 3 SKILLのquick_validate成功。検証用PyYAMLのみ/private/tmpに配置し、製品に依存追加なし。
- 既存回帰: unittest 22件成功。変更前24ファイルのハッシュ一致。
- 独立レビュー: 初回NEEDS_WORK（単独利用、索引解決、パス基点、指定モデル保持）。修正1巡後PASS。レビュー担当gpt-5.6-sol/high、実装担当gpt-5.6-terra/medium。
- 行動確認: 独自入口WORKGUIDEと保存先で規則作成/更新、調査担当の作成、単発記録で恒久定義を作らないこと、実装/独立レビュー/2回差し戻しの構成生成を確認。
- 単独導入確認: create-harnessだけを一時領域へコピーし、AGENTS入口・索引・2担当・workflowを生成。reportsへの記録と再開を記述し、参照実在確認。
- 一時検証成果: /private/tmp/create-harness-solo.sBDWES/project 。独自入口試験の場所は /tmp/harness-authoring-eval-root.txt に保存。一時成果は配布物ではない。
- 制約: 元ハーネス全体の再生成・実行品質や利用枠削減の比較までは未実施。スキルは文書作成手順であり実行エンジンではない。利用量・正確な所要秒は未取得。
- 導入完了: /Users/kan/.codex/skills/{create-rulebooks,create-subagent,create-harness}。既存先不存在を再確認して配置。全7ファイルのソース/導入先一致、形式検証、リンク確認、既存テスト22件成功。独立担当の最終統合確認PASS。個人設定・既存harness・AGENTSへの変更なし。コミットIDなし（非Git）。
