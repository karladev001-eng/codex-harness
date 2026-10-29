# タスク: github-improvement-records

- 状態: done（実装・独立レビュー完了。実保存先の接続は未実施）
- 仕様版: 2
- 日付: 2026-10-04
- コード基点: 82586eda58699e6d44e656689586e220befe41af + 依頼時の既存未コミット変更
- 作業先: <repo>。既存の改善ループ実装が未コミットのため、既存変更を保持して同一checkoutで直列実装・レビューする。自動commit/stash/resetはしない。
- 差分確認用の依頼時コピー: /tmp/harness-github-preferences-baseline
- 担当範囲: src、tests、関連スキル文書・既定設定、README、SPEC、VALIDATION、ADR、project-map
- 依存: なし
- モデル選択: auto、pinなし。実装complex、レビューreviewともgpt-6.1-sol/high（認証・移行・同時更新のため）。起動ツールの現行カタログで対応を確認。履歴なしで委譲する。

## 目的と対象外

既存の制作改善記録（観察・候補・指針・試用結果）を専用GitHub非公開リポジトリでPC間共有できるようにする。ページ収集、意味検索、Chrome/Raycast拡張、計測ログやタスク記録の移行は対象外。

## 受入条件

1. GitHub保存先owner/repo・branch・端末間で共通のproject keyを明示設定できる。認証は既存ghを利用し秘密情報を記録しない。未設定は従来ローカル互換を保つ。statusはネットワーク・書込なし。
2. preferences read/write/sync/migrate相当のCLIを提供し、設定先の`improvement/projects/<project-key>/preferences.md`を正本とする。readは取得結果と版を返し、writeは読取版に基づき更新する。キャッシュ・送信待ちはローカルで管理し、失敗を成功扱いしない。
3. 複数PC・セッションで更新しても競合は上書きしない。ローカル排他と原子的保存、GitHub blob SHAの条件付き更新、再送時の送信済み認識を検証する。設定先ごとにキャッシュを分離する。
4. オフラインで既存キャッシュ読取と書込待ちを可能にし、鮮度・未送信を明示。初回取得失敗は空の正本と誤認しない。認証失敗・アクセス不能・不存在の区別を保守的に扱う。
5. 既存ローカル記録の移行コマンドを用意し、明示移行時だけ送信。ローカル原本を保持し、異なる既存リモートは上書きしない。プロジェクト間を自動で混ぜない。
6. persistence=falseは記憶の読書き・通信をしない。improvement_loop=falseは自動ループを止めるが明示的な管理は可能。measurement=falseと記憶は独立。既存の好みの根拠・評価規則を維持。
7. 忘却・訂正では現在の正本とキャッシュ・未送信内容を更新し、履歴から自動復活させない。Git履歴の完全消去を保証しない。ローカル旧原本の扱いと移行後の再取込禁止を文書化。
8. 実装・梱包・CLI・移行・失敗・競合・フラグを隔離fixtureと偽GitHub transportで検証し、既存テストも通過。実リポジトリへのテスト書込は行わない。
9. スキルが新CLI経由で実際に記憶を読書きするよう更新し、セットアップ手順、ADRの変更範囲・制限を記録する。
10. 移行後にGitHub設定を解除しても旧ローカル原本を自動適用しない。保存先に依存しない移行済み印を本文なしで保持し、ローカルbackendで検知する。移行中の保存失敗は実際に永続化された状態を返し、存在しないpendingを報告しない。

## 制約と判断

- 今回は小さな改善記録一ファイルの同期であり、gh apiのContents APIによる取得・更新を採用する。ページ資料のfetch・検索インデックス方式は後続。
- GitHub公式Contents APIとgh api資料を2026-10-04に再確認。更新にblob SHAが必要。並列更新は競合する。
- 保存先名はユーザーへ問い合わせ中。実リポジトリ未指定でも実装・隔離テストは進める。
- GitHub.comの非公開リポジトリを初期対象とする。公開先への記録送信を防ぐ。

## 進捗・完了

- 既存動作、ADR、設定・テスト・梱包構成を確認済み。
- 実リポジトリの接続・実記録移行は未実施。
- 実装1版: npm test 62/62 PASS、build・diff check成功。独立レビューで設定解除時の旧記録復活と移行保存失敗時のpending誤表示を再現。受入条件10として明確化し修正を依頼。
- 修正1巡目: 本文なしの保存先非依存retirement markerと失敗時の永続状態再読込を追加。回帰4件追加後、npm test 66/66 PASS（既存47件・preferences19件）、diff check成功。実装を停止して独立再レビュー中。
- 再レビュー: 先の2件は解消。既存markerをread-onlyで開いてfsyncする経路はWindowsのFlushFileBuffersが必要とする書込権限を欠くため必須修正。Node 22同梱libuvとMicrosoft資料で確認し、非truncate書込可能openと回帰テストを第2巡として依頼。
- 最終版: `r+`による非truncate flushへ修正。npm test 67/67 PASS（既存47件・preferences20件）、diff check成功。独立レビューは受入条件1–10すべてPASS、retirement関連4件を再検証。単一実装担当が同一checkoutへ直列反映し、standalone/plugin両配布形態との整合を最終レビュー済み。
- 主な成果: src/preferences.ts、tests/preferences.test.cjs、ADR 0003。runtime・設定・installerと制作改善手順・README/SPEC/VALIDATIONを更新。既存未コミット変更を保持。commit/pushなし。
- GitHub CLI認証済みアカウント名のみ確認。実リポジトリ名はユーザー回答待ちで設定せず、実記録送信・インストール済みスキル更新は未実施。このプロジェクトの旧preferences.mdは存在しなかった。
- 制限: Windows実機・実PC間同期は未検証。Git履歴・他PCの旧コピーの完全消去は通常忘却の対象外。根拠IDやMarkdown内容の意味検証はエージェント契約。
- 計測: 子の実際のモデルは実装・独立レビューともgpt-6.1-sol/high。修正2巡。開始終了時刻・利用枠差分は未取得でnull、節約率・改善効果は評価しない。
