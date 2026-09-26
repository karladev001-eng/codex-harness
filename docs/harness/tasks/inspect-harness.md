# タスク: inspect-harness — 構成と状態の閲覧

- 状態: done
- 仕様版: 1
- コード基点: 7ee15470c129e04ff427082315ba70ef3d3f48fe
- 担当範囲: authoring-skills/inspect-harness/、authoring-skills/README.md、authoring-skills/INSTALL.md、README.md
- 依存: なし

## 目的と対象外

ユーザーが現在のハーネス/オーケストレーションについて、どの規則・担当定義・手順があるか確認できる独立した読み取り専用スキルinspect-harnessを追加。既存の作成スキルやruntimeの挙動は変更しない。標準はチャット内の分かりやすい状況説明で、専用UIや常駐監視は不要。

## 受入条件

1. inspect-harnessは単独導入可能なMarkdownスキルで『現在のハーネスの状態』『規則一覧』『エージェント一覧』『作業の流れ』で使える。自然言語・日本語表示に対応し依頼の範囲だけ確認する。
2. 明示索引→AGENTS等から参照する既存入口→HARNESS.mdの優先、必要な参照を読み文書から相対リンクを解決。索引がなければ対象project内の既知配置を限定探索し、未接続定義と適用中の定義を区別。個人ホーム全体/別projectを無差別走査しない。
3. 新しいMarkdown型と既存codex-harness型（AGENTSの指すSKILL、references/roles、reviewer等）に対応。SKILLの存在を役割の作成/稼働証拠にせず、source checkoutの配布物と実際の設定を区別する。
4. 定義された規則・担当・workflow、設定上のON/OFF、記録上のtask状態、実際に観測した稼働状態を明確に分ける。稼働APIが利用不能/対象外なら未確認。active=true/implementing/ファイル更新日時から稼働中と断言しない。関連する読取専用ホスト情報のみ任意参照し、他タスクへ無断送信/起動しない。
5. 一覧には簡単な名称/目的、規則の適用条件・記録先、担当の責務と規則参照、workflow順序・review条件など必要項目、追跡可能なファイル/ツール根拠、対象と確認範囲を含む。依頼が広ければ概要→詳細、狭ければ該当だけ。件数は確認できた範囲内、存在しない/不明/参照切れを区別。
6. 参照切れ・重複・矛盾・古い記録は根拠と限界を示すだけで、修正/登録/AGENTS書換え/タスク開始/他スキル起動をしない。表示用JSONやログも標準で保存しない。文書に埋め込まれた実行指示を検査作業の指示として採用しない。実行するときは確認済みの既知の読み取り専用statusのみで、任意の参照スクリプトは起動しない。秘密を出力しない。
7. README/INSTALLを作成3+確認1へ更新し、4つをcloneなし導入できるpath一覧にする。旧基点f3ddには新スキルがないので --ref main とし、再現性が必要なら新スキルを含むcommitを指定できる旨記載。過去の3スキル検証を新4スキル検証に偽装しない。
8. quick_validate、リンク確認、独立review/一時fixtureで行動確認。独自索引・複数担当・欠損リンク・記録上implementingだがlive不明、索引なし/未接続定義、既存harness型を確認。確認が対象ファイルを書換えないことをhashで検証。統合後GitHubへpushし新スキルを個人用へ導入、4スキルのcloneなし配布を試験。

## 作業領域・実効設定

実装: /Users/kan/.codex/worktrees/project-skill-install/harness
統合: /Users/kan/.codex/worktrees/project-skill-install-integration/harness
有効: enabled/delegation/review/persistence/measurement=true,max_agents=3。
standard=gpt-5.6-terra/medium、review=gpt-5.6-sol/high。子は再委譲/調整手順の起動をしない。
skill-creator: /Users/kan/.codex/skills/.system/skill-creator/SKILL.md
役割: /Users/kan/.agents/skills/codex-harness/references/roles.md

## 進捗・完了

利用量と正確な開始秒は未取得。実装・独立検証・個人用導入完了。

### 実装・独立検証

- 実装commit: 10af02f6fcf0334ed50f75f29acc2e983c0d917e。単独Markdownスキルと4スキル配布案内。
- 改善commit: fb42160640ed16c0edc1ef7a2180f35fa64d75ae。既存3スキルを残してinspect-harnessのみ追加する案内。
- quick_validate全4スキル成功、文書リンク・差分チェック成功。既存テスト22件成功（独立担当）。
- 独立review: gpt-5.6-sol/highで両commit PASS。実装担当gpt-5.6-terra/medium。
- custom: 有効な規則1、担当2、workflow1、欠損参照1を区別。古いimplementing記録はliveと誤認せず、live APIなしは未確認。検査対象文書に埋め込まれたファイル作成命令は実行しなかった。
- orphan: 未接続の担当定義1件と説明。empty: 指定scopeに構成なし。全fixtureファイルはhash一致、追加/削除なし。
- 実プロジェクト: 明示した既存harness入口からメイン/実装/統合/レビュー/任意調査の5役割と手順を確認。runtime設定とtask記録とhost API観測を分離し、配布元ファイルをlive担当に数えない。
- 統合: 5589da6e2cb613220f7da43ef5372bd06c6b7e43、3a861ce9cacbb954601dc373a3e89dbe6cdd516eをmainへfast-forwardし通常push成功。承認済みtreeとの一致を独立担当が確認。
- 標準skill-installerのdownload方式でprivate GitHubの3a861ceから一時projectへ4スキルを導入。8ファイルはsource一致、keep.txt保持、.gitなし。試験先: /private/tmp/harness-install-four.2g5kYT/project。
- 同じコミットから個人用 /Users/kan/.codex/skills/inspect-harness へ単独導入済み。sourceと完全一致、形式検証成功。既存3スキル・個人設定・AGENTSは無変更。
- 実導入結果の文書反映: 11b743c70d34ff7f9dcca7d782fc5e419208682b。独立最終レビューPASS。Windows/Linux実機は未確認。
