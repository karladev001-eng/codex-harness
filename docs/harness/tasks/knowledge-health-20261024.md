# Knowledge運用調査 — 2026-10-24

- 状態: 調査完了、既存同期ジョブの運用復旧確認済み。コード・設定・スケジュール・GitHub資料は変更していない。
- 依頼: 修正からの知見の蓄積状況と、繰り返される説明生成失敗通知を確認。
- 実効設定: harnessはactive/persistence/improvement_loop/measurement ON。純調査と既存キャッシュの運用復旧のためコード委譲・実装承認工程は適用していない。

## 確認した蓄積

- GitHub正本 `karladev001-eng/harness-knowledge-base/main` はprivate。head `c14ebddcce2498d49988afa3746ffc41c28efe7c`。資料capture 6件、analysis 6件。ローカル送信記録・説明記録も各6件すべてsent、生成待ちなし。
- GitHub上の改善記録は `improvement/projects/harness/preferences.md` のみ。blob `e636631fd3393a50dfe9fbc8c9dd02e115be30da`。保存拡張への指摘3件を含む。
- 別プロジェクトA (`<other-project-A>`) はbackend=local、GitHub保存先未設定。ローカルに観察22件・候補16件・指針0件・試用18件、更新日時2026-10-23 15:17:31 JST。配色・設定行配置等の修正を含む。
- ゲーム (`<other-project-C>`) のローカル記録は観察19件・候補10件・指針0件・試用16件、更新日時2026-10-21 17:25:12 JST。別プロジェクトBにもローカル記録あり。
- これは記録の存在を確認したものであり、全修正の網羅や次回の実適用を証明しない。技術的な不具合修正すべてを自動学習する仕組みとは異なる。CLIのlocalRootは正規化した絶対project pathのhashなので、別worktree等でpathが変われば別領域になる。GitHub設定はproject別で自動混合しない。

## 失敗原因と復旧

- 直近の定期結果は2026-10-24 23:16:08〜10 JST、offline=true、generated/published/failed/pending=0、notification=sent。モデル生成失敗ではなく、読取同期失敗を一般的な説明生成失敗通知として送っていた。
- GitHub APIとGit ls-remoteは通常環境・最小環境とも正常。実pullの失敗段階をメモリ内で確認し、Git fetchの `shallow.lock: File exists` を特定。元ログは保存していない。
- 対象: `~/.codex/knowledge/read/b3146f9fd21a4c78ad6f6fba6ccf0281.git/shallow.lock`、410 bytes、2026-10-18 00:10:40 JST。lsofで利用者なし、Gitプロセスなしを確認。既存libraryLock下でinode/size/owner/type/nlinkを再確認して退避。未知lockの自動削除は追加していない。
- 退避先: `/Users/kan/.codex/knowledge/read/recovery/shallow.lock.20261018T001040.stale-1792852131738`。
- 退避後のpullはcurrent、6件、head不変。
- 既存LaunchAgentをkickstartして実環境確認。2026-10-24 23:29:08〜10 JST、state=skipped/reason=unchanged、generated=0/published=0/failed=0/pending=0、offline=false、notification=not_needed。launchctl runs=152、last exit code=0。毎時3600秒の既存設定を保持。

## 残る限界

- なぜ10月18日にGitがロックを残したかは現存記録から未確定。中断時のlock再発防止、具体的失敗理由の保存、同一失敗通知の抑制はコード未変更。
- GitHub connectorは対象ファイル404で読めず、実運用と同じgh認証によるread-only APIで確認した。sandbox内の通信失敗はOSジョブの障害根拠に使わず、権限付きの実pullで原因と復旧を検証した。
- 他プロジェクトのGitHub同期・移行や共通知見への一般化は実施していない。
- コード変更なしのためテストsuiteは実行せず、実同期と既存定期ジョブで検証。利用枠・トークン計測は未取得(null)。

後続: [自動保存・PC/worktree間再利用・障害対策の仕様v1](knowledge-autosave.md)（実装承認待ち、[確認用HTML](knowledge-autosave.plan.html)）。
