// Static documentation tooling: no runtime routing, cache, model calls or new dependency.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const skill = 'plugins/codex-harness/skills/harness';
const fixture = 'tests/fixtures/context-routing';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, text) => fs.writeFileSync(path.join(root, file), text);
const digest = text => ({ bytes: Buffer.byteLength(text), characters: [...text].length, sha256: crypto.createHash('sha256').update(text).digest('hex') });
function routes(text = read(skill + '/SKILL.md')) {
  return [...text.matchAll(/^\| ([A-Z]) \| ([^|]+) \| \[([^\]]+)\]\((references\/routing\/[^)]+)\)：([^|]+) \|$/gm)]
    .map(([, id, condition, label, target, summary]) => ({ id, condition: condition.trim(), label, target, summary: summary.trim() }));
}
function chart() {
  const rows = routes();
  const lines = ['# Yes/No読込チャート', '', '人向けの説明図。エージェントはSKILL.mdの判定表を使い、この図を常時読む必要はない。', '', '生成元は[入口の独立判定表](../../SKILL.md#独立yesno判定表が正本)。各行を順に独立判定し、Yesで読んだあとも次行へ進む。複数Yesを許す。', '', '```mermaid', 'flowchart TD', '  START{"HARNESS_WORKER?"}', '  START -->|Yes| ASSIGNED["割当役割とパケットだけ。再委譲なし"]', '  START -->|No| STATUS["status: 上位指示・ユーザー指定・実効設定"]', '  STATUS --> ACTIVE{"active?"}', '  ACTIVE -->|No| NORMAL["通常作業へ戻る"]', '  ACTIVE -->|Yes| COMMON["共通境界を確認"]', '  COMMON --> S'];
  rows.forEach((r, i) => {
    const next = rows[i + 1]?.id || 'END';
    lines.push(`  ${r.id}{"${r.id}: ${r.condition}"}`, `  ${r.id} -->|Yes| ${r.id}_READ["${r.target}"]`, `  ${r.id}_READ --> ${next}`, `  ${r.id} -->|No| ${next}`);
  });
  lines.push('  END["必要な詳細だけ読み、現在の作業へ"] --> CHANGE{"範囲・段階・設定・役割・版・指示の変更?"}', '  CHANGE -->|Yes| START', '  CHANGE -->|No| KEEP["同じ版を保持していれば再読不要。compact等で失えば必要箇所を再確認"]', '```', '', '| ID | Yes条件 | 本文（概要→必要な詳細） |', '|---|---|---|');
  rows.forEach(r => lines.push(`| ${r.id} | ${r.condition} | [${r.label}](${path.basename(r.target)})：${r.summary} |`));
  return lines.join('\n') + '\n';
}
const codeDetails = ['references/roles.md', 'references/parallel.md', 'references/reviewer.md', 'references/roles/code-review.md', 'assets/task.md', 'assets/completion.md', 'assets/project-map.md', 'references/measurement.md'];
const planDetails = ['@authoring/codex-html-plan/SKILL.md', '@authoring/codex-html-plan/references/workflow.md', '@authoring/codex-html-plan/references/blocks.md'];
const creativeDetails = ['references/creative-loop.md', 'references/knowledge-retrieval.md'];
// Explicit scenarios, not a runtime classifier. Document what each example actually does.
// Unless explicitly OFF, active coordinator examples keep the original measurement requirement.
const scenarios = [
  { id: 'advice', description: '定型的な方針相談。外部相談・コード変更・制作・記録なし。measurement ONの既存計測規則を適用', yes: ['R'] },
  { id: 'claude', description: '開かれた企画相談。Claudeへ独立発案を1回依頼', yes: ['C', 'R'], details: ['consult-claude/SKILL.md'] },
  { id: 'simple-code', description: '単純コード修正の準備から完了。HTML計画あり、UIなし、全機能ON、親が必要な役割・検証資料を読む', yes: ['A', 'D', 'R'], details: [...codeDetails, ...planDetails] },
  { id: 'web', description: 'Web調査のみ。探索委譲・コード変更・制作なし', yes: ['W', 'R'] },
  { id: 'creative', description: '文書制作。仕様・承認と改善ループ、保存資料検索あり。好み更新なし、コード・CLIなし', yes: ['A', 'F', 'R'], details: creativeDetails },
  { id: 'mixed', description: 'Web根拠のあるUI実装・Claude批評・設定互換性確認・保存資料参照・記録完了の複合。全分岐Yes', yes: ['S', 'A', 'C', 'W', 'F', 'D', 'R'], details: [...codeDetails, ...planDetails, ...creativeDetails, 'consult-claude/SKILL.md'] },
  { id: 'worker', description: '親から仕様・設定・役割を受領済みの実装worker。親の入口や調整本文を加算しない。役割全文のみを共通費に算入', worker: true, yes: [], details: ['references/roles.md'] },
  { id: 'inactive', description: 'inactive（enabled=false、全機能OFFを含む）。bootstrap以外の文書読込なし', inactive: true, yes: [] },
  { id: 'delegation-off', description: 'コード修正、delegation OFF/review ON。親が実装し別担当がレビュー。並列実装なし、HTML計画あり', yes: ['A', 'D', 'R'], details: [...codeDetails.filter(x => x !== 'references/parallel.md'), ...planDetails] },
  { id: 'review-off', description: 'コード修正、review OFF。他機能ON。レビュー資料を読まない、HTML計画あり', yes: ['A', 'D', 'R'], details: [...codeDetails.filter(x => !['references/reviewer.md', 'references/roles/code-review.md'].includes(x)), ...planDetails] },
  { id: 'storage-off', measurement: false, description: 'コード修正、persistence/measurement/improvement_loop OFF、delegation/review ON。仕様をインライン、HTML計画あり', yes: ['A', 'D', 'R'], details: [...codeDetails.filter(x => !x.startsWith('assets/') && x !== 'references/measurement.md'), ...planDetails] },
  { id: 'loop-off', description: '文書制作、improvement_loop OFF。通常の仕様・承認と有効な計測、記憶管理依頼・制作委譲なし', yes: ['A', 'R'] },
  { id: 'delegated-creative-loop-off', description: 'loop OFFで純文書制作をユーザーが明示委譲。自動的な委譲要求は追加せず、既存の制作委譲時モデル規則を読む', yes: ['A', 'F', 'R'], details: ['references/roles.md'] },
  { id: 'advice-measurement-off', measurement: false, description: '定型的な純相談。measurement OFF、パケット記録・起動status以外のCLI操作・長い作業の境界なし。commandsは必要', yes: ['R'] },
  { id: 'explicit-memory-off', description: 'loop OFFで明示的な好み訂正。persistence ON/delegation OFF、親が同じwriter契約とCLIを使う', yes: ['F', 'R'], details: ['references/creative-loop.md', 'references/roles/record-keeper.md', 'references/commands.md', 'assets/creative-preferences.md', 'references/measurement.md'] },
  { id: 'ambiguous', description: '「この資料をよくしたい」。関連A/Fの先頭段落だけを確認、まだ着手しない。A/Fは全文を読んだ数値ではない。Rと有効な計測手順は全文', yes: ['A', 'F', 'R'], overview: true },
  { id: 'advice-to-code', description: 'adviceを読込済みで保持。単純修正へ移行した時の追加読込。beforeは既読root再加算なし', yes: ['A', 'D', 'R'], incremental: true, retainedRoutes: ['R'], retainedMeasurement: true, retainedCommands: true, details: [...codeDetails.filter(file => file !== 'references/measurement.md'), ...planDetails] },
  { id: 'same-version', description: 'simple-codeの全資料を同じ版で保持。追加資料なし', yes: [], retained: true },
  { id: 'version-update', description: 'simple-codeの後で入口とA本文の版だけ更新。他の既読資料は保持。変更した文書だけ再確認', yes: ['A', 'R'], changedOnly: true, retainedRoutes: ['R'], retainedMeasurement: true, retainedCommands: true },
  { id: 'after-compact', description: 'simple-codeの内容をcompactで失った。必要資料を再読（保持している資料があればその分は不要）', yes: ['A', 'D', 'R'], details: [...codeDetails, ...planDetails] },
].map(s => {
  const commands = !s.inactive && !s.worker;
  const measurement = commands && s.measurement !== false;
  const details = [...new Set([...(s.details || []), ...(measurement && !s.retained && !s.retainedMeasurement ? ['references/measurement.md'] : []), ...(commands && !s.retained && !s.retainedCommands ? ['references/commands.md'] : [])])];
  return { ...s, commands, measurement, details };
});
function moduleIntro(text) { return text.split('\n\n').slice(0, 2).join('\n\n') + '\n'; }
// V1 was measured before section reading. Keep its actual snapshot fixed when v2 changes sources.
function report() { return JSON.parse(read(fixture + '/v1-report.json')); }
function reportMarkdown(data) {
  return '# 文書読込量の比較\n\n生成: `node scripts/context-routing.cjs --write`。検証のみ: `node scripts/context-routing.cjs --check`。数値・ファイル一覧・範囲・SHA-256は[JSON](context-routing.json)。\n\nUTF-8 bytesとUnicodeコードポイント数を計測。共通bootstrapは初回の双方に951 bytesずつ加算（inactiveの追加指示本文は前後0 bytes）。active親の初回は起動status用commandsを双方に加算。明示OFF以外はmeasurement ONで、既存計測手順も双方に加算。会話全体のトークン、利用枠、速度、品質の改善を示すものではない。\n\n' +
    `入口単体: ${data.entry.before.bytes} → ${data.entry.after.bytes} bytes（${data.entry.savedPercent}%減）、${data.entry.before.characters} → ${data.entry.after.characters}文字。目標2〜3KBに対し、共通境界の保持を優先した実測値を示す。\n\n` +
    '| シナリオ | before bytes | after bytes | 削減bytes | 削減率 |\n|---|---:|---:|---:|---:|\n' + data.scenarios.map(s => `| ${s.id} | ${s.before.bytes} | ${s.after.bytes} | ${s.savedBytes} | ${s.savedPercent === null ? '—' : s.savedPercent + '%'} |`).join('\n') + '\n\n' +
    data.scenarios.map(s => `- **${s.id}**: ${s.description}。Yes: ${s.yes.join(', ') || 'なし'}。`).join('\n') + '\n\n' +
    data.assumptions.map(s => '- ' + s).join('\n') + '\n\n入口の正本スナップショットと元の参照サイズ/hashは `tests/fixtures/context-routing/` に保持。bootstrapは前後同一パスに正規化。各例の元から必要な詳細とHTML計画資料を両側に加算。単純修正等は初回入口だけでなく工程全体で必要な資料を計測し、同一資料の再読は重複加算しない。概数トークンへの換算や全資料総和を削減率の分母にしない。\n';
}
function outputs() {
  const data = report();
  return { [skill + '/references/routing/chart.md']: chart(), 'benchmarks/context-routing.json': JSON.stringify(data, null, 2) + '\n', 'benchmarks/context-routing.md': reportMarkdown(data) };
}
if (require.main === module) {
  if (!['--write', '--check'].includes(process.argv[2])) throw Error('Use --write or --check');
  let failed = false;
  for (const [file, content] of Object.entries(outputs())) {
    if (process.argv[2] === '--write') write(file, content);
    else if (!fs.existsSync(path.join(root, file)) || read(file) !== content) { console.error('Stale generated document: ' + file); failed = true; }
  }
  process.exitCode = failed ? 1 : 0;
}
module.exports = { routes, chart, report, scenarios, digest, moduleIntro };
