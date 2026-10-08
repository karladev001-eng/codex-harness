# ADR 0004: Chrome資料保存・耐久送信待ち・GitHub atomic commit

- 日付: 2026-10-04
- 状態: 採用・保存機能を実装。実環境の導入/外部保存は未実施。
- 関連: [ADR 0002](0002-github-knowledge-base.md)、[導入・運用](../../knowledge/README.md)

ADR0002のPC保存部分をMV3 Chrome拡張→Native Messaging→Node22+共通ツール→gh Git Data APIで具体化する。意味検索・AI解析・Raycast/iPhone・全ページ/動画/全repo保管はこの実装の範囲に含めない。既存preferences機能とは独立し、資料メモを好みへ自動転記しない。

拡張はユーザーの操作でactiveTab/scriptingを使い、storageとnativeMessaging以外の常時権限を増やさない。実行コードは配布物内だけ。日本語UIで本文/メモ/タグ/画像/HTML、取得不足、PC耐久保存とGitHub送信を区別する。個別サイトの表示DOMは保守対象で、取得不足を推測で埋めない。

入力schema_version=1とUUIDv4 operationを採用。URLを限定的に正規化してSHA256先頭32桁をitem IDにする。日付を含むディレクトリ案は採らず `items/<item-id>` を使い、月やPCをまたぐ再保存でも同じitemへ戻れるようにする。UUID operationがcapture IDで、再試行は同一UUID、意図的再保存は新UUID。初回のmetadata/noteは保持し、各captureにもmetadata/noteを置く。生成解析は原文へ混ぜない。

拡張の一件queueを先にstorageへ保存し、PCのoperation JSONをfsync・atomic renameしてからdurable応答を返す。GitHub送信はその後の別native操作。長い同期中はnative portでworker接続を保持し、popupが閉じてもPCのpendingは残る。PCの設定(repo/branch/library)をstage時に固定する。未設定pendingだけが明示retry --bindで現在の保存先へ割り当てられる。設定を変えても既存pendingの宛先は変えない。未知lock/壊れた状態は保持し、手動点検を要求する。

認証はghの既存管理を使用。Node/ghは絶対パス、生成launcherには状態パスを埋め込みGUIのPATH問題を避ける。manifest allowed_originsとhost起動originの両方を一つの拡張IDへ限定。入力4MiB/応答64KBに制限し、stdoutはnative framing専用、生本文・gh stderr・秘密をログへ書かない。Mac/Windowsのmanifest/launcher生成と明示installを用意し、既存登録を無断上書きしない。

送信前にprivate repo、既存branch、kb format/schema/libraryと既存itemを確認。既存treeをbase_treeとして複数fileとoperation receiptを一commitへまとめ、ref更新はforce=false。他PCとの競合時はheadを読み直して最大3回更新。応答紛失ではreceiptとcapture各blobを確認して同じ操作の二重登録を避ける。未知repo/壊れたcapture/異なるschemaはpendingのまま停止する。GitHub README取得はhostのread APIを優先し、最初の取得結果をmaterialized snapshotへ耐久保存して再試行時の内容変化を防ぐ。API失敗時は表示DOM fallbackと不足を記録する。

この段階ではsent receiptをローカルにも保持する。検索索引や自動cleanupは未実装で、ローカル容量は手動管理。ディスク障害やWindowsのdirectory fsync未対応など、通常のファイルシステム以上の保証はしない。

fake transport/gh・isolated home・native subprocess・DOM fixtures・mock popupで保存/失敗/再起動/競合と配布物を検証する。実GitHub書込・通常Chromeのnative連携・Windows実機の確認は別途必要。公式API根拠と詳細手順は導入文書に記載する。
