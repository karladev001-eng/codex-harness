# web-source-links

- 状態: done
- 仕様版: 1
- 作業ディレクトリ: /Users/kan/dev/harness
- 基点: 82586eda58699e6d44e656689586e220befe41af + 既存未コミット内容を保持
- snapshot: /var/folders/5n/58z5gr_d2hjgv6nrfz6r9gvh0000gn/T/harness-sources-before-j3obxaw_
- 目的: Web検索の回答で出典サイト・論文を表示する既定ルールを配布と実導入へ反映。
- 実効設定: enabled/delegation/review/persistence/measurement/improvement_loop=true, model_selection=auto, pinsなし, max_agents=3。
- 起動候補取得元: 本ホストspawn_agent説明。実装Sol6.1/medium（既存入口との整合判断）、レビューSol6.1/high（独立整合確認）、統合Luna/low（定型配布）。同系統の新しい後継候補は提示されていない。
- 対象外: 検索強制、背景監視、新UI、不要な設定スイッチ、commit/push/公開。

## 受入条件
1. Webを参照した回答の関連する主張付近に、実際の根拠ページへの説明的Markdownリンクを付ける。一次資料優先、検索結果URLや架空URL禁止。主要出典を識別できること。
2. 論文は確認できたタイトル・著者（多数なら筆頭著者ら）・年・DOI又は出版社/arXiv等への直接リンク。未確認事項を捏造しない。抄録のみ等の閲覧範囲と推測は必要時明示。本文を読んだと偽らない。
3. 純粋なWeb検索依頼にもルールが到達する入口とし、コード委譲やGit工程を純粋な検索に強制しない。既存off/他ルール/上位指示を保持。
4. README/SPEC/SKILL/既存論文手順を矛盾なく最小更新。入口変更の必要な既存テストのみ更新し検証。意味のない文言コピー検証を増やさない。
5. 0.4.1へ版を揃え、新tgz/checksumを作成。buildで消える旧0.3/0.4配布物を最後にsnapshotから復元。配布・実導入一致と更新成功を確認し個人設定・記憶を保持。

## 検証・完了
未完了。利用枠未取得。測定は記録時刻のみ。成果物は指示ベースの運用でありホストの引用UIを変更しない。

- 計測記録開始（実装委譲後）: 2026-10-02T05:15:23.020282+00:00

実装11ファイル、npm test 47/47 PASS。独立ソースレビュー条件1〜4 PASS、install対象24/24 PASS。修正必須指摘なし、修正0巡。配布と実導入は後工程。

最終配布: dist/releases/karladev001-eng-codex-harness-0.4.1.tgz、SHA256 f5648613f651b5d988c0fd9cc91a03739ff06758810aa925825656472d388bd7。旧0.3/0.4配布物をsnapshotから復元し全3本checksum一致。隔離HOME/cacheでoffline npx install/status/reinstall unchanged PASS。実導入更新成功、旧版backup /Users/kan/.codex/harness/backups/install-U51KCp。macOS .DS_Storeを /Users/kan/.codex/harness/backups/macos-metadata-kd7l3u1t へ保存退避、個人設定/記録fingerprint一致。

最終独立整合レビューPASS、条件1〜5受入。source/dist/archive/実導入一致、所有manifestと入口一致、旧版配布物・既存記録保持を確認。テスト47/47、独立install24/24 PASS。リンク確認PASS。commit/pushなし。指示ベース運用、全回答の出典品質を機械保証するものではない。
完了: 2026-10-02T05:23:20.133785+00:00。利用枠値null。
