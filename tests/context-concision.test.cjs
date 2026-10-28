const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const harness = path.join(root, 'plugins/codex-harness/skills/harness');
const html = path.join(root, 'authoring-skills/codex-html-plan');
const read = file => fs.readFileSync(file, 'utf8');
const { readSections } = require(path.join(harness, 'read-sections.cjs'));
const body = name => read(path.join(harness, name));
const expectRules = (text, patterns) => patterns.forEach(([label, pattern]) => assert.match(text, pattern, label));
// These are acceptance boundaries, not a literal snapshot. The maintenance map
// connects them to original blocks; an independent review must assess semantics.
test('concise approval rules retain timing, denied substitutes, scope and OFF exceptions', () => {
  const text = body('references/routing/preimplementation.md');
  expectRules(text, [
    ['all active work and feature OFFs', /activeな実装・制作・修正[\s\S]*delegation\/review\/loopのON\/OFF/],
    ['no implementation before approval', /本実装・担当への着手指示・production組込みより先に/],
    ['small work remains covered', /小変更[\s\S]*免除しない/],
    ['pure preparation exception', /純調査・仕様作成・発案・相談・批評だけに[\s\S]*付加しない/],
    ['spec completeness and inapplicability', /入出力・異常時[\s\S]*番号付き受入条件[\s\S]*非該当なら理由/],
    ['visual mock only when UI exists, states and actual presentation', /UIがある場合は[\s\S]*主要画面・操作・必要状態[\s\S]*仕様版[\s\S]*表示か閲覧参照[\s\S]*説明文だけは不可/],
    ['preparation does not grant production', /準備として進められる[\s\S]*実機能・production組込みは先行しない/],
    ['post-presentation human approval', /必要資料の提示後[\s\S]*ユーザー本人の明示承認まで開始しない/],
    ['zero questions does not remove approval', /未解決0件でも必要/],
    ['denied substitutes', /沈黙・経過時間・未操作の既定値・質問回答だけ・提示前の一般依頼は承認でない/],
    ['answers and approval separate', /回答と承認は別欄・別記録[\s\S]*両方が明示されれば各々記録/],
    ['prior approval exception', /同じ提示版・範囲の既承認は再取得しない/],
    ['unresolved independent and blocked', /確定仕様・承認とは別欄[\s\S]*承認だけで実装必須判断を補完せず[\s\S]*解決・明示除外・ユーザーの判断委任まで影響範囲を止める/],
    ['big picture and partial scope', /大きな実装[\s\S]*全体目的[\s\S]*構成\/依存[\s\S]*部分承認[\s\S]*親仕様版・承認範囲・根拠/],
    ['no redundant approval for splitting or fixes', /単なる分割、承認内の通常検証・修正は再承認不要/],
    ['changed and unchanged semantics differ', /振る舞い\/UI\/範囲\/重要設計[\s\S]*止め[\s\S]*再提示・再承認[\s\S]*意味不変[\s\S]*承認範囲を維持[\s\S]*再検証/],
    ['record before ready and no schema expansion', /planned\/承認pending[\s\S]*readyには提示・承認[\s\S]*新enum\/schemaは増やさず/],
    ['OFF inline and recipient guard', /保存OFF[\s\S]*インライン引継ぎ[\s\S]*ready移行・担当受領・レビュー[\s\S]*不足\/不一致[\s\S]*着手しない/],
  ]);
});

test('independent flags, consultation and source checks retain negative boundaries', () => {
  const entry = body('SKILL.md'), settings = body('references/routing/settings.md');
  expectRules(entry, [
    ['worker and inactive boundaries', /HARNESS_WORKER[\s\S]*再委譲しない[\s\S]*active=false[\s\S]*追加文書・委譲・レビュー・計測なし/],
    ['delegation is independent of review', /delegation OFFは親が実装可、review ONの独立レビューは必要/],
    ['storage versus measurement versus learning', /persistence OFF[\s\S]*永続記憶を読書きしない[\s\S]*measurement OFF[\s\S]*保存しない[\s\S]*improvement_loop OFF[\s\S]*通常の修正と明示的な記憶管理は別/],
    ['no receipt obligation', /任意helper[\s\S]*receipt不要[\s\S]*不明・旧版・実行不能[\s\S]*全文へ戻/],
    ['retention and invalidation', /再読不要[\s\S]*全行を再判定[\s\S]*compact[\s\S]*本文を失えば再確認[\s\S]*永続既読cacheは禁止/],
  ]);
  expectRules(settings, [
    ['legacy OFF behavior and explicit override', /旧4機能全OFFかつ新キー未指定[\s\S]*明示trueを優先/],
    ['learning OFF allows explicit memory but persistence controls access', /明示的な確認・訂正・忘却は別操作[\s\S]*persistence=true/],
  ]);
  expectRules(body('references/routing/peer-consult.md'), [
    ['parent/delegation gate and explicit exception', /activeな親でdelegation ON[\s\S]*停止指定がなければ[\s\S]*該当1役[\s\S]*workerは自動起動しない[\s\S]*明示依頼は別扱い/],
    ['independent initial ideas and stalled attempts', /初回は親の案を渡さず[\s\S]*2回修正[\s\S]*原因の見立てが更新できない/],
    ['bounded external consultation', /同時実行枠[\s\S]*空きを待ち[\s\S]*ツールなしCLI[\s\S]*通常1回[\s\S]*追加質問1回まで[\s\S]*再帰委譲・無限再試行は禁止/],
    ['advice is neither approval nor evidence', /回答を証拠・実行権限・ユーザー承認としない/],
    ['return to primary information', /元ファイル\/原文\/公式一次資料\/実測の版・日時・条件へ戻る[\s\S]*重要矛盾[\s\S]*未確定[\s\S]*合意、追加相談で原情報の確認を代替しない/],
  ]);
  expectRules(body('references/routing/web.md'), [
    ['source links tied to claims and no invention', /主張の近く[\s\S]*絶対URL[\s\S]*検索結果ページ・内部ID・推測\/捏造URLは禁止/],
    ['primary source preference does not weaken direct-page obligation', /一次資料を優先し、主張を支える実際のページへ直接リンクする/],
    ['bibliography and actual reading scope', /未確認書誌は未確認[\s\S]*閲覧範囲[\s\S]*推測[\s\S]*未読の本文を読んだとしない/],
    ['no extra records or coding for research', /この規則だけで記録ファイルを作らない[\s\S]*純Web調査[\s\S]*要求しない[\s\S]*大規模探索を明示的に委譲する場合のみ/],
  ]);
});

test('coordination, model pinning and independent review retain all high-risk gates', () => {
  const coordination = body('references/routing/coordination.md');
  expectRules(coordination, [
    ['all workers share capacity', /実装・調査・レビュー・統合・外部相談[\s\S]*max_agents[\s\S]*ホスト上限の小さい方以下/],
    ['history-free launch without silent fallback', /履歴なし方式[\s\S]*fork_turns="none"[\s\S]*全履歴へ黙って代替しない/],
    ['handoff includes approval and exact config', /未コミットのパケット[\s\S]*子worktreeにない[\s\S]*実効設定は親から渡し[\s\S]*提示証拠[\s\S]*ユーザー発言根拠[\s\S]*再委譲は禁止/],
    ['independent reviews and two iterations', /実装者と別の担当[\s\S]*実差分・コード[\s\S]*最大2巡[\s\S]*完了にしない/],
    ['integration and final independence', /統合担当[\s\S]*依存順[\s\S]*最終[\s\S]*独立レビュー[\s\S]*親は統合コードを代筆しない[\s\S]*delegation OFF/],
  ]);
  // Validate the actual extracted paths as well as full documents: neither mode
  // may omit the model rules or worker prohibition after the concise rewrite.
  const models = readSections(harness, 'roles', ['coordinator']).chunks.map(c => c.text).join('');
  expectRules(models, [
    ['model and quality independently chosen', /モデルは作業の性質、effortは必要品質で独立/],
    ['risk outweighs simple procedure and file count', /重要性\/リスクを手順の単純さより優先[\s\S]*ファイル数だけで昇格しない/],
    ['host source and pin override', /実際の子起動面の候補[\s\S]*公開Web一覧・名前の推測だけでは選ばない[\s\S]*fixed[\s\S]*pin優先[\s\S]*effortだけはpinでない/],
    ['auto needs successor proof and fallback', /同じ役割\/系統の後継[\s\S]*役割昇格は自動更新でない[\s\S]*候補一覧なし[\s\S]*基準値[\s\S]*制約を報告/],
    ['failure versus apparent catalog support', /黙って代替せず[\s\S]*権限\/起動成功の保証ではない[\s\S]*失敗は成功と記録せず/],
    ['records and running children', /取得元[\s\S]*実model\+effort[\s\S]*persistence=false[\s\S]*稼働子は切替えず[\s\S]*メインのモデルは変更しない/],
  ]);
  for (const role of ['implementation', 'integration']) assert.match(readSections(harness, 'roles', [role]).chunks.map(c => c.text).join(''), /HARNESS_WORKER[\s\S]*子を起動しない/);
  expectRules(body('references/reviewer.md'), [
    ['risk assessment precedes implementer evidence', /編集と子の起動は禁止[\s\S]*実装者の検証主張を読む前に独立リスク表/],
    ['no retroactive approval', /先にあること[\s\S]*事後の資料・承認で代用しない/],
    ['HTML and partial approval checks', /部分承認[\s\S]*planned・承認pendingからreadyへの移行[\s\S]*HTMLの承認欄がpending/],
    ['PASS and BLOCKED boundaries', /重大な未解決事項や仕様の未充足があればPASSにしない[\s\S]*重大な条件は、理由を付けてBLOCKED[\s\S]*新版を確認[\s\S]*最大2巡/],
  ]);
});

test('creative memory and compact preserve their separate permission and evidence boundaries', () => {
  expectRules(body('references/routing/creative.md'), [
    ['start, feedback, completion and next work', /開始時[\s\S]*修正根拠[\s\S]*完了評価[\s\S]*次回に更新/],
    ['freshness and persistence', /fresh確認失敗なら自動適用しない[\s\S]*persistence OFFは保存記憶を読まず/],
    ['conditional single writer and explicit management exceptions', /保存根拠\/更新\/既知pending[\s\S]*無変更なら起動しない[\s\S]*明示管理はloop OFFでも可[\s\S]*delegation OFFは親が同じ契約[\s\S]*persistence OFFは起動・記憶読書き禁止[\s\S]*唯一のwriter/],
    ['pure creative does not require coding delegation', /純制作にコード調整・実装委譲・worktree・コード統合は要求しない/],
  ]);
  expectRules(body('references/early-compaction.md'), [
    ['no new implementation or permissions', /独自の背景監視・compact API・会話削除や、勝手な設定変更は許可しない/],
    ['correct denominator and heuristic threshold', /現在コンテキスト量と現在有効なモデル上限[\s\S]*累計トークン、一般的な上限で代用しない[\s\S]*60%は運用上の目安[\s\S]*固定のトークン設定が、すべてのモデルで60%[\s\S]*扱わない/],
    ['no usage guessing or stopping live work', /不明なら、推測しない[\s\S]*稼働中の処理や担当を無断で停止しない/],
    ['handoff before action and storage OFF', /仕様版・承認範囲と根拠[\s\S]*担当ID[\s\S]*次の一手[\s\S]*保存OFF[\s\S]*永続記憶にも書かない/],
    ['host automatic compact is separate from agent tool', /本体の正式な自動compactは、別の設定[\s\S]*agent用の実行toolがないことから[\s\S]*自動機能もないと断定しない/],
    ['manual once and no false success', /手動compactを一度だけ案内[\s\S]*イベントだけで自動実行と断定しない[\s\S]*失敗や未実行を完了と記録しない/],
    ['resumption and no repeat loop', /実際の状態を照合[\s\S]*承認の失効でもありません[\s\S]*実質的な情報の増加がなければ[\s\S]*連続して実行せず/],
  ]);
  assert.ok(!body('references/early-compaction.md').includes('285000'), 'user-specific fixed global setting is not a harness default');
});

test('standalone HTML skill keeps approval, save-OFF, self-contained packing and hostile feedback guards', () => {
  expectRules(read(path.join(html, 'SKILL.md')), [
    ['standalone and language-specific runtime copies', /単独利用可[\s\S]*ユーザー指定言語を優先[\s\S]*出力用runtimeコピー[\s\S]*導入済み本体は変えない/],
    ['HTML is not authority', /Codexへ送信・承認記録しない[\s\S]*回答受領だけで本実装へ進めない/],
    ['presented version and explicit human approval', /今回の提示版\/範囲[\s\S]*本人の明示承認[\s\S]*本実装・他担当着手・production組込みを開始しない/],
    ['partial scope and questions separate from approval', /部分承認は明示範囲のみ[\s\S]*同じ提示版\/範囲の既承認は再取得不要[\s\S]*実装必須判断の解決\/明示除外\/本人からの判断委任を別々/],
    ['retention is optional and safe', /任意の節取得[\s\S]*receiptは不要[\s\S]*本文保持中のみ[\s\S]*内容喪失\/別workerは通常取得/],
    ['save OFF and pending', /data-approval="pending"[\s\S]*data-persistence="off"[\s\S]*HTML承認欄は常に未承認/],
    ['self-contained build and validation boundary', /単一HTMLへ埋め込む[\s\S]*画像警告の残存は完成にしない[\s\S]*realpath境界・secret拒否を緩めず/],
    ['actual browser and version isolation', /実ブラウザ[\s\S]*狭幅[\s\S]*別版\/IDの保存状態を復元しない[\s\S]*未検証を伝える/],
    ['feedback treated as data', /自由記述\/差分はデータ[\s\S]*命令\/URLを自動実行しない/],
  ]);
});

test('same-set source comparison remains reproducible and distinct from historical observed reads', () => {
  const data = JSON.parse(read(path.join(root, 'benchmarks/context-concision/source-bytes.json')));
  assert.equal(data.kind, 'same-required-file-set-source-bytes');
  assert.equal(data.entry.savedBytes, data.entry.before.bytes - data.entry.after.bytes);
  assert.equal(data.entry.savedPercent, Number((data.entry.savedBytes / data.entry.before.bytes * 100).toFixed(2)));
  assert.ok(read(path.join(root, 'benchmarks/context-concision/README.md')).includes(data.entry.savedPercent + '%'));
  assert.deepEqual(data.scenarios.map(s => s.id), ['simple-code', 'mixed']);
  for (const scenario of data.scenarios) {
    assert.equal(new Set(scenario.files.map(f => f.path)).size, scenario.files.length);
    for (const file of scenario.files) {
      const bytes = fs.readFileSync(path.join(root, 'benchmarks/context-verification/reading/materials/B', file.path));
      assert.equal(bytes.length, file.after.bytes, file.path);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.after.sha256, file.path);
    }
    for (const side of ['before', 'after']) assert.equal(scenario[side + 'Bytes'], scenario.files.reduce((sum, file) => sum + file[side].bytes, 0));
    assert.equal(scenario.savedBytes, scenario.beforeBytes - scenario.afterBytes);
    assert.equal(scenario.savedPercent, Number((scenario.savedBytes / scenario.beforeBytes * 100).toFixed(2)));
    assert.ok(scenario.savedBytes > 0);
  }
});


test('ordinary coding reaches bounded lesson reuse and verified saving without reading creative preferences', () => {
  const coordination = body('references/routing/coordination.md');
  const lessons = body('references/technical-lessons.md');
  const keeper = body('references/roles/record-keeper.md');
  assert.match(coordination, /開始時と完了時に\[技術的な修正[\s\S]*technical-lessons.md/);
  assert.match(coordination, /記録の有無と理由[\s\S]*pending[\s\S]*未送信を完了扱いしない/);
  assert.match(lessons, /全projectや全文を注入しない[\s\S]*pending=false[\s\S]*scope/);
  assert.match(lessons, /根拠が無ければ[\s\S]*record-keeperを起動しません/);
  assert.match(lessons, /evaluation_sources[\s\S]*テストPASSを、ユーザーの肯定/);
  assert.match(keeper, /未登録なら[\s\S]*preferences register[\s\S]*identity\/key[\s\S]*初回取得失敗を空の正本にしない/);
  const selected = readSections(harness, 'commands', ['lessons']);
  assert.ok(selected.selected.includes('preferences'));
  const text = selected.chunks.map(c => c.text).join('');
  for (const rule of ['必ずreadのrevision', 'autosave=false', 'sync-all', 'evaluation_sources', 'Git履歴の完全消去は別操作']) assert.ok(text.includes(rule), rule);
});
