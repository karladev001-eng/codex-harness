# タスク: knowledge-background — 定期チャットを作らない説明生成

- 状態: done（コード独立PASS・現機LaunchAgent実行PASS）
- 日付: 2026-10-07 Asia/Tokyo
- 作業: <repo>。既存関連差分を保持する承認済み直列共有checkout。reset/stash/commitなし。
- 実効: active/delegation/review/persistence/measurement/improvement_loop=true、max_agents3、auto pinなし。
- 実装: gpt-6.1-sol medium（失敗判定とバックグラウンド運用の設計）。レビュー: gpt-6.1-sol high。起動面catalog確認済み、各effort対応。子は履歴なし、再委譲なし。

## 目的

ユーザーが定期実行ごとのセッション増加を避けたいと要望。Codex cronは新規チャットを作るため、MacのLaunchAgentから既存analyze CLIを直接呼ぶ。モデル生成本体は既に --no-daemon exec --ephemeral。未生成/変更分だけの生成とGitHub publish、model gpt-6.1-sol、limit5、毎時を維持する。既存automation-2は親がPAUSEDへ変更済み。

## 受入条件

1. 小さなrunnerから既存CLIを固定引数で実行する。shellを介さず、生成資料・raw stdout/stderrを永続ログへ記録しない。アプリのセッション/外側のLLMターンを作らない。既存adapterのephemeralを維持。
2. exit0でもJSON内のfailed/pending/reason/offlineを失敗/未完了と判定。busy/変更なしは正常スキップ。最新結果一件だけをstate/background/last-run.jsonへ原子的に保存（時刻/件数/状態/制限したreason、認証情報/本文なし）。書込先symlinkを拒否。未知lockの削除なし。総実行時間に上限。
3. 失敗時だけMacへ短い一般的な通知を試み、機密や原文は通知に含めない。通知失敗は状態で区別し主処理の失敗を消さない。通知許可や集中モード等で表示が保証されないことをdocsへ。
4. LaunchAgentは毎時、background、RunAtLoadなし、ログインユーザー権限。絶対Node/runner/CLI/codex/stateと安全なPATH。既存jobやplistを上書きしない。登録・停止・状況確認方法を文書化。親が現機へ登録・kickstart・state/終了確認する。PCスリープ中の実行を保証しない。
5. JSON判定/失敗/timeout/安全な状態更新の関連テスト、既存analyze回帰、独立レビュー。レビュー後に通常build→必要ならinstall。既存アプリautomationは再開しない。既存の他chatは削除/アーカイブしない（今回依頼は今後の履歴増加の停止）。

## 範囲

knowledge/background.cjs等の独立runner、関連test、knowledgeREADME、launchd plistの安全な生成方法（サンプルまたは限定helper）。CLI生成処理やprovider/認証変更、新しいクラウド、新しいスケジュール管理製品、Windows登録は対象外。親は現機登録を担当。

## 根拠

- Codex公式Scheduled tasks: 独立スケジュールは実行ごと新規チャット（https://learn.chatgpt.com/docs/automations?surface=app）。
- 現機codex exec --help: --ephemeralはsession filesをdiskへ保存しない。
- 現機man launchd.plist: StartIntervalはsleep/実行中のtickをスキップ、RunAtLoad既定false、ProcessType Background。
- knowledge/analysis.cjs, process.cjs, cli.cjs。現機既存のLaunchAgentに同名なし。

## 完了・検証

- 実装担当 /root/knowledge_background_impl、独立レビュー /root/knowledge_background_review。変更 knowledge/background.cjs、tests/knowledge-background.test.cjs、knowledge/README.md。既存provider/CLI不変更。
- background8件＋既存analysis20件=28/28 PASS、npm run build成功。独立レビューも28/28と祖先symlink/通知順序/plutilを確認。起動/保存失敗の通知漏れを親確認で修正し、最新start()を独立レビューPASS。
- 通常install成功、backup=~/.codex/harness/backups/install-r1Aioz。導入46ファイルはdist/manifestとhash一致。
- ~/Library/LaunchAgents/com.codex-harness.knowledge-analysis.plistを新規exclusive作成。plutil -lint PASS。gui/501へbootstrap成功、kickstart -p成功（PID14049）。毎時3600秒、Background、RunAtLoad=false、stdio=/dev/null。既存plist/jobなしを登録前確認。
- 現機起動2026-10-07 00:41:42〜00:41:45 JST。launchctl printはruns=1、last exit code=0、終了後not running。
- 最新結果 ~/.codex/knowledge/background/last-run.json: state=skipped, reason=unchanged, generated=0,published=0,failed=0,pending=0,offline=false,notification=not_needed。snapshot2件、commit5282da24de5c490bb813671b44eef953ab0997eb、checked_at=2026-10-06T15:41:45.097Z。モデル生成不要のため、この現機試行で新規provider呼出なし。
- automation-2はPAUSED確認。既存他chatは変更/削除しない。hooks.jsonとknowledge/config.jsonは作業前hashと同一。GitHubの正本変更なし。
- 統合受入AC1–5 PASS。通知の画面上の表示・スリープ/再ログイン後の実動作・実際に未生成資料があるlaunchd回は未検証。コードと既存adapterが--ephemeralを指定し、定期実行の外側チャットを排除した。Windows登録は今回対象外。
- 毎回一件のlast-runを置換し、ソース本文・rawモデルログを追加保存しない。Codex/OS共通診断ログやGitHub保存資料の完全消去を意味しない。
- 利用枠/トークン計測は未取得(null)。既存差分保持、commit/pushなし。

後続の運用改善: [knowledge-autosave / 仕様v1](knowledge-autosave.md)（修正記録の再送・取得方式・通知抑制の提案、実装承認待ち）。
