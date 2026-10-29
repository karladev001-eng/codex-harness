# context-verification — 実読込量と自動compactの動作確認

- 状態: done。ユーザー依頼: 「コード修正や複合依頼で実際の読込量が減ったかと、自動compactが正しく動くかも確認してください。」検証だけを明示承認済み。本体機能/ルール変更なし、UIなし。
- 読込比較: 短文化直前copyと現在正本を同じ構造で隔離copy。コード/複合の同じ自然文fixture、同じmodel/effort・設定・出力budget・部分読取手段、初回既読0。各条件2回、計8runの結果を先に固定して全件保存し、良い結果を選ばない。必要規則の欠落は独立確認し、欠落したrunの小さな値を改善根拠にしない。
- 測定は実stdout（本文/metadata/索引/重複を含む）、stderrも別記。親の運用手順選択の予行で、実コード完遂・子の読込・会話全token・利用枠原価の測定ではない。前回の固定集合bytesと区別する。コードのCLI品質確認は全runの開始指示に同じ文面で含め、実験途中に模範ルートを追加しない。
- native compact: PC全体285000/totalの設定と、Desktopと同版binaryで設定ロードを確認。global config/現在チャットを変更せず、隔離したephemeral検証会話で一時閾値を使い自動発火/完了/引継ぎを確認する。manual thread/compact/start・inject/revert/delete等で発火を代用しない。小さい制御/閾値到達の比較を最大2会話・各2turn程度に限定し、実エラー修正以外の無制限再試行をしない。
- 証拠は送信RPC(methodのみ)/使用binary版/一時設定/必要イベント/usage/marker回答の最小限。秘密・生認証・無関係な会話は保存/表示しない。既存ログイン利用、新API key/ログイン/権限変更なし、無関係な処理停止なし、検証プロセスだけ終了。
- 権限: 実検証の一時推論と既存認証読取は上記明示依頼の範囲。保護領域/ネットワークが必要なら通常の自動承認審査を使い、拒否時に別経路で迂回しない。
- 実効harness: active、delegation/review/persistence/measurement/improvement_loop=true、max_agents3、auto pinなし。読込/独立評価はhost候補gpt-6.1-sol/high、履歴継承なし。native probeも同モデル/高精度（認証・プロトコル・状態検証）、probe内短い生成のeffortはlow。
- ソースdirty保持、commit/stash/resetなし。既存rawと過去測定は改変しない。文書量の差と自動圧縮の正しさは別判定。既存手動20:30イベントを自動証拠にしない。
- 読込materialsと事前固定run順: <tmp>/harness-reading-check-c07d4gt1/comparison.json。
- 正式根拠: https://learn.chatgpt.com/docs/app-server 、https://learn.chatgpt.com/docs/config-file/config-reference 。


## 自動compactの実動証拠

- Desktop同版binary `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`、0.164.0-alpha.11.1を使用。通常設定のconfig/readは285000/totalを返した。
- 隔離ephemeral会話2件×各2turnだけで実providerを検証。通常閾値の対照は自動圧縮0回、一時process override1000/totalでは2turn目にcontextCompaction started/completedが1回、その後以前のnonce完全一致とturn完了を確認。
- 送信はinitialize/initialized/config/read/thread/start/turn/start×2のみ。手動compact、inject/revert/deleteを送信せず、tools/approval要求も0。現チャット・global configは変更せず、hash前後一致。検証serverは両方exit0。
- [native証拠・再現手順](../../../benchmarks/context-verification/native/README.md)。完全な設定/認証/無関係会話/生provider応答は保存しない。
- 同版fresh processの機構動作と引継ぎは確認済み。既存GUI会話の設定reloadと285000境界そのものは未検証。低閾値1000が圧縮後の全context上限になるとは主張しない。前後usageは実測/見積りが混じるので一般の縮小率へ換算しない。


## 集計と独立品質確認

- 事前固定8runを全件保存。文書stdoutの全件平均はcode55,726.5→52,073 bytes（6.56%減）、mixed103,119→91,350.5（11.41%減）。エラー呼出・stderr・metadata・索引も保持し、rawや値を補正/削除していない。
- 独立品質照合でcode before-r01のHTML計画工程/入口確認が不足。他のcode3件との品質完全同等は証明できず、code平均を品質同等確認済みの削減効果と扱わない。rep1は判定保留、事前ペアrep2（r08対r06）の61,309→53,931 bytes（12.03%減）は必要工程を確認した有効1組。mixed4件は必要工程を保持した。
- 比較の対象は親の手順読取予行であり、実コード作業完遂・子の実読・全作業context/費用ではない。各条件2回で普遍的効果/有意差/毎回削減を保証しない。
- ホスト最後の入力tokenは実験後に取得した参考時点値。累計消費やbyte換算ではなく、固定prompt/途中文脈/tool枠も含む。今回読込8件にはcompactイベントなし。native発火テストとは別判定。
- 新規独立reviewerの起動はagent thread limitで失敗したため、同じ機能の本文短文化で独立レビューを担当したreview_concisionを継続利用。native probe/今回の集計実装には参加していない。集計担当の追記も同limitで再開できず、親がfixture原本2件の保存・リンク・品質注記という記録整備だけを実施。製品コード/実測rawは不変。
- [読込の実測報告](../../../benchmarks/context-verification/reading/README.md)と[全件JSON](../../../benchmarks/context-verification/reading/results.json)へ全観測値・品質注記を保存。


## 完了判断

- review_concisionの最終独立レビューPASS。初回指摘のcode-r01品質差・壊れたnativeリンクを修正し、fixture原文2件もbyte不変保存/hash一致。再実験やraw値の補正/削除は行っていない。
- 検証結果: 品質の揃ったcode事前ペアrep2は61,309→53,931 bytes（12.03%減、有効1組）。別のcode組は旧版r01のHTML工程確認不足により削減判定保留。mixedは必要工程を満たした各条件2回の平均103,119→91,350.5 bytes（11.41%減）。全8件平均/個別値/失敗/stderrも報告に保持。
- 自動compactは同じDesktop版の実providerで手動要求なしの自動開始・完了・確認用nonce保持を検証PASS。通常285000の対照は0回、検証processだけの1000閾値は1回。既存GUI会話のreload/285000境界そのものは未検証。
- 最終確認: native script node --check成功、主要4文書11相対リンクエラー0、fixtureコピーは全8run hashと一致、global config hashはnative実行前後と現在すべて一致し285000/total維持、git diff --check成功。
- 変更は今回の検証script/証拠/原本copy/報告とtask記録だけ。harness製品・個人設定・過去の実測rawは不変のため、全体npmの無関係な再実行/再導入は行わない。commit/push/公開なし。利用枠前後null、費用換算なし。
