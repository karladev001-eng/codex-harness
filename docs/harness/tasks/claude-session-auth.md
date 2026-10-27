# Claude相談の別セッション認証確認の修正

- 状態: done
- 仕様版: 1（既承認Claude連携仕様2の不具合修正）
- 基点: 4c8dcd36c9022dc408daae63ecfa002efb29bb30
- 目的: 別セッションがsandbox内の認証確認失敗だけで相談を断念する不具合を直す。
- 対象: consult-claudeの認証診断・実行権限の案内、関連検証、配布コピーとこのPCの導入済みスキル更新。
- 対象外: 認証情報の取得/表示、ログイン変更、sandbox回避、自動的な権限昇格、送信許可の他プロジェクトへの拡張。
- UI: CLIとスキルのみの修正のため非該当。

## 再現と仕様

同じ導入済みhelperの`--check`がsandbox内では`auth_unavailable`、ホスト承認手順を通した通常環境では`ok=true,authenticated=true`となった。認証自体を変更せず再現し、出力は診断要約だけ。キーチェーン等へのアクセス制限と整合するが内部原因は未断定。

スキルで、認証確認不能は未ログインと断定せず、当該ホストに正式な追加権限の手順があればそれを使う再診断を一度だけ行う。拒否/非対応/再失敗なら止め理由を報告する。実相談にも必要な実行権限を適用し、外部送信の許可範囲と実行権限を区別する。helper自身は権限昇格も認証情報の抽出も行わない。

## 受入条件

1. 新しいセッションが認証確認不能時の次の安全な操作、停止条件、実相談の実行権限をスキルから判断できる。
2. helperの診断は機密を出さず、既存の失敗閉鎖、隔離、時間/回数制限と役割を維持する。
3. build/恒久導入/個人用consult-claudeコピーが正本と一致する。
4. 実装に参加していない担当が導入済みスキルから診断と機密なしの実相談を、元checkout以外の作業ディレクトリで実行して確認する。不可なら成功扱いしない。
5. 関連テストと独立レビューを通す。既存の未コミット変更を保持する。

## 提示・承認

- 正本: [既承認仕様2](claude-consultation.md)。同範囲の通常不具合修正として再承認不要。
- 現在のユーザー依頼: 「別セッションでもできるように修正して欲しいです」。修正範囲と安全な再診断を本チャットで提示済み。
- Claude送信: [このプロジェクトの送信事前承認](../authorizations/claude.md)を利用。新しいプロジェクトへの許可ではない。
- 未解決: なし。

## 担当・検証方針

既存変更が多数あるため同checkoutで担当範囲を限定して順次編集。commit/stash/resetなし。実効設定はactive、delegation/review/persistence/measurement/improvement_loop ON、max_agents=3、auto/pinなし。ホスト起動候補にあるgpt-6.1-sol/highを、認証・権限の境界を含む修正と独立レビューに選択。履歴なしで起動する。利用量/全体所要は未取得(null)、削減効果は評価しない。

## 進捗・制約

- 実装担当は履歴なしgpt-6.1-sol/highで起動。独立レビュー担当の新規起動は`agent thread limit reached`で失敗したため、実装に参加していない既存のreview_concision担当を継続利用する。会話履歴がない新規Codexチャットでの評価とは呼ばない。
- スキル正本とhelper、routing/claudeの案内と関連テストのみを修正。build後の導入manifestとの差は配布3ファイルだけ、追加/欠落なし。ルートharnessの読込量・自動compact設定は変更しない。
- 実装担当の検証: consult-claude 26/26、routing 5/5、配布コピー検証成功、文書212件/986リンク/エラー0、diff check成功。
- 公式スキルvalidatorはPyYAML未導入で起動不可。追加依存を入れず、Ruby標準YAMLでfrontmatter構造を確認。これは動作検証の代替ではなく、関連テスト・独立レビュー・実相談を別途行う。

## 完了記録

- 受入条件1〜5: 充足。実装者と別担当によるsourceレビューと導入後レビューともPASS。独立実行した関連テスト26件も全成功。
- 修正: `auth_unavailable`で打ち切る前に正式なホスト権限申請で同じ診断を一度だけ再実行し、確認成功後は実相談にも必要な実行権限を使うよう明記。helperの処理は診断文を統一しただけで、自動昇格・認証情報取得・自動再試行を追加していない。routingの案内も同手順へ接続。
- 標準install: `/Users/kan/.agents/skills/codex-harness`を更新。バックアップ`/Users/kan/.codex/harness/backups/install-VvnRfN`。
- 個人スキル: `/Users/kan/.codex/skills/consult-claude`を未編集確認後に同じ正本へ更新。バックアップ`/Users/kan/.codex/harness/backups/consult-session-auth-N3ArxQ`。両スキル各3ファイルの正本一致、所有manifest全107ファイルのhash一致を確認。
- 実相談: 実装に参加していない担当が空の別cwd `/private/tmp/claude-session-independent-01tqw6ue` で導入済みスキルを読み実行。通常権限の診断は`auth_unavailable`、正式な`require_escalated`再診断1回は既存認証確認に成功。実相談も同じ必要権限で1回実行し、exit 0 / `ok=true, role=ideator, followup=0`で3役の説明案を取得。再相談なし、cwdは空のまま。
- [機密を除いた実行証拠](claude-session-auth.evidence.json)。既存の独立担当の継続利用であり、履歴のない新規Codexチャット自体を作成・検証したという主張はしない。今後の全ホストや権限拒否時の成功は保証しない。
- 検証: 導入済み67文書/318リンク・エラー0、配布文書212件/986リンク・エラー0。自動compactの設定値は285000/totalを確認し、今回変更していない。Gitのcommit/stash/resetなし、既存変更を保持。
- 計測: 実装gpt-6.1-sol/high、独立レビューgpt-6.1-sol/high。タスク全体開始/終了時刻・所要・利用枠前後は未取得(null)。
