# Chrome knowledge capture

- 状態: done
- 仕様版: 1
- コード基点: 82586eda58699e6d44e656689586e220befe41af + 依頼時の未コミット成果。比較用 `/tmp/harness-capture-baseline`。
- 担当: 実装担当がコード・テスト・製品文書、親が仕様と受入判断、別担当が独立レビュー。
- 作業方式: 関連する前回成果が未コミットのため、既存checkoutで直列に実装・レビュー。既存変更をcommit/stash/resetしない。
- 依存: ADR0002、実装済みpreferences機能（互換性維持）。保存用リポジトリは未指定。
- モデル: complex / gpt-6.1-sol high（Chrome、native host、GitHub保存の設計・障害処理）。review / gpt-6.1-sol high。auto・pinなし。
- 候補取得元: collaboration.spawn_agentの現在のモデル説明と対応effort。Sol 6.1が最新workhorse、high対応。履歴なしで起動。max_agents=3。

## 目的・境界

Windows PC / MacのChromeから閲覧資料を保存する拡張と、共通PCツールを実装する。Chrome MV3 + Native MessagingでPCツールへ送り、ghの既存認証を利用する。GitHub専用private repoを正本とし、ローカル送信待ちを耐久化。実名未指定なので設定可能な成果まで作る。実リポジトリ作成、外部保存、通常Chromeへの導入は今回実行しない。

今回の成果は保存機能。検索エンジン・意味検索・AI解析・Raycast・iPhone・ページ全体撮影・動画本体・全repo cloneは対象外。意味検索用の元本文・参照・取得不足を保存する。好みの記録へ自動転記しない。

## 受入条件

1. インストール可能なMV3拡張を配布buildに含める。ユーザー操作時のactiveTab、scripting、storage、nativeMessaging等必要な権限だけを使い、常時全サイトアクセスや遠隔コードを要求しない。分かりやすい日本語UIで取得内容、メモ、タグ、スクリーンショット/HTMLの選択、保存結果を扱う。
2. 一般ページのURL・タイトル・本文/見出し/選択範囲とユーザーメモを分離。表示範囲撮影とHTML構造（スクリプト/イベント/フォーム値等除去、再現の完全性を保証しない）を取得。タブ切替/遷移で別ページ画像を混ぜない。制限ページ、欠落、容量制限は成功と偽らない。
3. YouTube動画ID/タイトル/チャンネル/概要/時刻・表示済み文字起こし（取得できる範囲）、GitHub repo識別/説明/README（取得可ならAPI、fallback範囲明記）、XはURLの対象投稿IDと一致する一投稿本文/投稿者/日時/参照を取得。無関係な関連投稿を本文に混ぜず、各種取得不足を記録。動画本体・全repoは保存しない。
4. ADR0002を具体化する版付きスキーマと安定ID。metadata、note、immutable capture、content、optional HTML/screenshot。再試行と意図的再保存を区別、同一URL再保存は新captureで過去captureとメモを無断上書きしない。機械生成要約を原文と偽らない。
5. Node22+共通PCツールが拡張からの入力を検証し、repo/branch等はローカル設定のみ。認証はgh経由、秘密を拡張/KB/ログに保存しない。Mac/Windows native host登録手順と生成/インストールコマンド、origin制限、サイズ制限、stdout framing、GUI起動時PATHへの対策がある。ユーザー環境の登録は本タスクでは実施しない。
6. 保存操作をローカルへ耐久化してから送信。未設定/オフライン/通信失敗は送信待ちとして残り、明示再送が可能。拡張・host再起動や応答紛失で同じoperationを二重登録しない。既存pendingの行き先を設定変更で無断変更しない。未知のロック/破損状態を消さない。
7. private repo・既存branchを検証し、複数ファイルをGitHub Git Data APIの一commitとして反映、ref更新force=false。他PC競合/応答紛失を安全に扱い無条件上書きしない。既存KB schema/libraryを検証し異なるデータを破壊しない。実GitHubへの書込テスト不要、fake gh/transport等で再現。
8. 主要経路と失敗系の意味あるテスト、配布物に拡張/host等が含まれる検証、既存テスト成功。UI・DOM抽出は可能な手段で検証し、実Chrome/Windowsなど未確認範囲を区別。導入・保存・再送・制限の手順を記述。独立レビューを通す。

## 参照

- `docs/adr/0002-github-knowledge-base.md` / `0003-github-improvement-records.md`
- https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging （2026-10-04確認、framing/allowed_origins/OS登録）
- https://developer.chrome.com/docs/extensions/reference/api/tabs （captureVisibleTab、activeTab）
- https://docs.github.com/en/rest/git/refs （非force更新）
- `/Users/kan/.agents/skills/codex-harness/references/roles.md`
- `/Users/kan/.agents/skills/codex-harness/references/reviewer.md`
- `/Users/kan/.agents/skills/codex-harness/references/roles/code-review.md`

## 進捗

- 既存preferencesは未設定、旧ローカル好みファイルもなし。既存の好みを推測しない。
- 設定と保存先を分離して実装。実repo指定・ユーザー端末の導入は未実施。
- 実装担当 `/root/chrome_capture_impl` を履歴なし・Sol6.1/highで起動。旧未コミット変更を保持して直列作業。
- 親による初期画面確認: CUAのIABでlocalhostのpopup HTMLを表示、日本語ラベル・初期disabled状態・390px幅のレイアウトを目視確認。拡張APIがない通常タブでの表示確認であり、実拡張E2Eではない。
- 親による実DOM検証: `tests/fixtures/knowledge-browser.html` を `/tmp/harness-capture-browser` に拡張とコピーしlocalhost8913でCUA/IAB表示。一般本文/見出し、HTML除去、X対象/日時/引用のみ/対象不在、YouTube字幕、GitHub README、UTF8制限の10項目PASS。mock popupで取得→プレビュー→メモ/タグ→保存成功表示と保存ボタンdisabled→空queue再送表示を実操作確認。実サービスではなくfixture・mockでの確認。
- 親によるmock失敗UI検証: PC送信待ち、PC接続エラー、chrome://制限ページの取得拒否/保存disabled、通常URLへ戻して再取得をCUAで確認。理由コードの露出を指摘し、日本語の対処文へ修正を依頼、実装済み。
- 実装担当報告: npm test 80/80成功、主要JS構文チェック成功、専用/tmp npm cacheでtarball作成とdist/knowledge配布内容確認。実GitHub・通常Chrome native接続・Windows実機は未実施。
- 独立レビュー `/root/chrome_capture_review`（Sol6.1/high・履歴なし）: focused13/13、全体80/80を独立確認。NEEDS_WORK、必須修正3点: registerが既存OS登録の拒否前にhostファイルを変更、operationのnull/false/0を欠落と扱い上書き、長い日本語noteがhost上限を超えて拡張queueを塞ぐ。全て使い捨て状態で再現、実環境影響なし。実装担当へ修正1巡目を委譲。
- 修正1巡目: 登録前チェックと失敗時復元、falsy JSONの破損判定、popup/workerのenqueue前メモ容量検証。実装担当npm test84/84（knowledge17件）成功、配布tarballを更新。親CUAでも日本語17000字のメモで容量エラー→同じpreviewのまま短縮→mock保存成功を確認。独立再レビュー待ち。
- 再レビュー1: 元の3経路の修正を確認、focused17/17成功。ただしregisterの生成のみ（--installなし）で異なる拡張IDを指定すると既存host originを変える派生経路を再現。修正2巡目として既存native IDの変更を全登録操作で事前拒否し、同じIDでの再生成は維持、手動変更手順を文書化するよう依頼。
- 修正2巡目完了: 異なる既存native IDはinstall有無/出力先に関係なく書込前拒否。同じIDのlauncher更新は維持。手動変更時はOS登録/native.jsonだけを扱い、operations/config/libraryを保持する手順を記述。ADR0002ヘッダーへ0004の保存実装状況を反映。
- 最終検証: 実装担当npm test85/85、tarball再生成。独立レビューは修正境界と配布6/6を追加確認、fake-homeで同/別出力先の拒否と全byte保持・同ID更新を再現。最終PASS、AC1–8をfixture/mock/fake transport範囲で充足、必須指摘なし。親git diff --check成功、tarball内manifest/inputs.js確認。
- 成果: knowledge/**、knowledge tests/fixture、buildコピー、配布files、導入README、ADR0004と0002局所追記、入口リンク。コミットなし。意味検索・実GitHub書込・通常Chrome native接続・Windows実機・現行実サービスDOMの網羅確認は未実施で文書化。保存先repo未指定、実運用設定/拡張導入は未実施。
- テスト用ブラウザとlocalhostサーバー2件を終了。導入READMEをCodexで開く要求はqueued。
- 計測: corrections=2、completion=true、最終required defects=0。利用枠/時間の比較値は未取得null、削減率の主張なし。制作の明示評価は未取得、好みの記録更新根拠なし。
