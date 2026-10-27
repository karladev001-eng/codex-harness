# context-concision — 規則本文の短文化と正式な自動compact設定

- 状態: done
- 基点: 4c8dcd36c9022dc408daae63ecfa002efb29bb30。既存の関連未コミット変更を保持し、現在checkoutで直列編集。commit/stash/resetなし。
- 目的: 分割や読取操作を増やす方法から、意味を保った本文の簡潔化へ転換する。同じ規則を繰り返さず、条件→行動→例外を明確にする。
- ユーザー方針: 「分割ではなく、コンテキストを最適化して、簡潔に強く指示することによって読み込み量を減らせますか？また、自動でcompactを実行できるようにできますか？」。既存の読込最適化の承認範囲内の意味不変な文書改訂として扱い、業務規則の変更はしない。UI変更なし。
- 対象: harness入口・routing・commands/roles/reviewer等とHTML計画入口の重複・説明を短文化。分割/新しい読込機構を追加しない。既存helperは互換維持、通常利用で操作を増やさない。原規則の条件/必須/禁止/例外と単独利用を保持する。
- 受入1: 既存の承認、OFF、worker、モデル、委譲、独立レビュー、原情報確認、Web、制作記憶、記録、compactの意味を維持し、旧規則との対応を独立レビューする。
- 受入2: 入口とコード/複合経路の同じ必要資料集合で本文bytesを比較。保存量と読込見積りを分離し、前回の実読込結果と混同しない。大規模な実行ベンチマークを繰り返さない。短い自然文の適用判断確認を行う。
- 受入3: build/テスト/リンク/標準導入と既存の所有管理を保つ。原文の言い換えを許すためのテスト変更は、意味保持の証拠・別の独立点検と合わせる。旧測定raw/fixtureは改変しない。
- 自動compactの適用範囲: 選択質問にユーザー本人が「このPCのCodex全体」と回答。以前合意した60%目安と現在記録の有効上限475000から、global default285000 tokens、scope totalを提示して反映。固定数のため全モデルで常に60%にはならない。
- 変更先: /Users/kan/.codex/config.tomlのトップレベル2キーのみ。backup=/Users/kan/.codex/harness/backups/native-compact/20261024-212725-85335/config.toml。TOML再parse/値確認、0600維持。権限/認証/model等変更なし。Desktop現在チャットへの即時反映・自動発火は未観測。
- 圧縮説明の訂正: 20:30 JSTの圧縮はユーザーの手動コマンド実行。ログのcompactedイベントだけで自動実行と判断した前回の説明を訂正。エージェントtool未提供でも本体の正式設定による自動圧縮は別に可能。
- 対象外: 独自compact API/背景監視/会話削除/アプリ再起動/閾値まで文脈を埋める負荷試験/権限緩和/公開。
- 実効設定: active、delegation/review/persistence/measurement/improvement_loop=true、max_agents3、auto pinなし。本文改訂gpt-6.1-sol/high、独立レビュー同。ホスト候補と対応effortから選択、履歴なし。設定反映は明確な作業のためgpt-6-luna/medium。
- 未解決: 新しい実装必須判断なし。短文化率と意味保持、自動compact実効設定/発火の観測可否は検証対象。
- 比較前copy: /private/tmp/harness-concision-before-8yeqipol。


## 検証メモ

- native設定は独立レビューでも285000/total、他設定辞書不変、0600を確認。公開app-serverのinitialize→initialized→config/readのみを別のCLI0.163.0で実行し、実効読取も両値を返した。新しいthread/推論は起動していない。現在Desktop0.164.0-alpha.11.1の即時反映や自動発火とは区別する。
- 公式根拠: https://learn.chatgpt.com/docs/config-file/config-reference （自動圧縮閾値とtotal/body_after_prefix）、https://learn.chatgpt.com/docs/config-file/config-basic （ユーザー/プロジェクト/起動設定の優先順位）。上位の起動・project/profile設定でoverrideされ得るPC全体の既定値。
- Claude criticは事前送信承認の範囲で1回、ok=true。条件→行動→例外への統一、背景/例示と重複説明の削除、否定条件・OFF・承認・pin・記録時点の誤統合防止を採用。原文照合の代わりにはしない。複数回の高コスト比較という提案は今回は採らず、本文量と少数の判断確認に限定する。
- 自動compactのconfig変更と、指示本文の短文化の効果は別に検証する。手動の20:30イベントを自動実行の証拠にしない。


## 完了結果

- 本文正本を短文化。入口4,790→3,507 bytes（26.78%減）、同じ16資料のコード経路72,703→63,917（12.08%減）、同じ23資料の複合経路107,445→96,221（10.45%減）。[比較表/対象](../../../benchmarks/context-concision/README.md)、[各hash/集合](../../../benchmarks/context-concision/source-bytes.json)。全文bytesの比較であり実際の読込・token・速度の再測定ではない。
- commands/blocks/reader APIは不変。root/routing/roles/reviewer/compact/HTML入口の重複と説明を簡潔化し、通常利用でreceipt操作を要求しない。旧ベンチマークのraw・fixture・数値は保持。
- 独立レビュー初回でUIなしへのモック義務化の曖昧さ、根拠実ページへの直接リンク義務の弱化、割合丸めを検出し修正。最終review_concisionはPASS。少数自然文4例（外部AI opt-out/既存承認、delegation OFFと独立レビュー、loop OFFの明示操作、相談から未承認実装への移行）も原規則と照合した。
- 通常環境の全体npm test210/210 PASS（40.45秒）。最終文言修正後のfocused18/18 PASS、build・source212文書983リンクerror0・旧collector10保存run・diff-check成功。単発手動圧縮時刻は共通指示から除き、一般的な判断根拠ルールと本タスクの訂正記録を保持。
- 標準install反映済み、backup `/Users/kan/.codex/harness/backups/install-90uWME`。所有107ファイルはmanifest/dist/導入物で一致。導入67文書317リンクerror0。config/AGENTS/プロジェクト設定/個人Claudeは導入直前のhashと一致し、native285000/total維持。独立最終レビューも導入一致とnative値を確認しPASS。
- 自動compactの設定はPC全体の既定値として反映・構文/他値保持/別CLI実効読取を確認。現在Desktopチャットへの即時反映と自動発火は未確認。手動20:30イベントを自動実行の証拠にしない。
- 新しい分割・ルータ・背景監視・compact APIは追加していない。元の未コミット変更を保持、commit/push/公開なし。利用枠前後値null、金額や会話全体tokenへの換算なし。
