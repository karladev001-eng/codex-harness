const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture, root, run, tree, write } = require('./helpers.cjs');

test('packed release runs through actual npx outside repo without compiler/network/Python', { timeout: 120000 }, t => {
  const f = fixture(t), npm = process.env.npm_execpath;
  assert.ok(npm && fs.existsSync(npm), 'Run packaging tests using npm test');
  const env = { ...require('./npm-fixture.cjs').npmEnvironment(f), npm_config_offline: 'true' };
  function invoke(script, args, cwd) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd, env, timeout: 90000 });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr + result.stdout); return result.stdout;
  }
  const packResult = JSON.parse(invoke(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', f.base], root));
  const packed = Array.isArray(packResult) ? packResult[0] : Object.values(packResult)[0];
  assert.equal(packed.version, '0.4.2');
  assert.equal(require('../package-lock.json').version, '0.4.2');
  assert.equal(require('../package-lock.json').packages[''].version, '0.4.2');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'dist/plugins/codex-harness/.codex-plugin/plugin.json'), 'utf8')).version, '0.4.2');
  const archive = path.join(f.base, packed.filename), files = packed.files.map(file => file.path);
  assert.ok(files.includes('dist/skill/runtime.js'));
  assert.ok(files.includes('dist/skill/preferences.js'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/preferences.js'));
  assert.ok(files.includes('dist/skill/references/creative-loop.md'));
  assert.ok(files.includes('dist/skill/references/roles/record-keeper.md'));
  assert.ok(files.includes('dist/skill/assets/creative-preferences.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/.codex-plugin/plugin.json'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/references/creative-loop.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/references/roles/record-keeper.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/assets/creative-preferences.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/runtime.js')); assert.ok(files.includes('dist/skill/authoring-skills/inspect-harness/SKILL.md'));
  for (const file of ['SKILL.md', 'UPSTREAM.md', 'LICENSE', 'runtime/pack.mjs', 'runtime/htmlplan.js', 'runtime/htmlplan.css', 'references/blocks.md', 'references/workflow.md', 'examples/task-board.src.html', 'examples/task-board.plan.html', 'examples/records/ADR-07.md', 'examples/records/TASK-42.md', 'examples/records/EXP-03.md', 'examples/records/index.md']) {
    assert.ok(files.includes('dist/skill/authoring-skills/codex-html-plan/' + file), file);
  }
  assert.equal(files.some(file => /(?:node_modules|^src\/|\.py$)/.test(file)), false);
  for (const file of ['README.md', 'CONTRIBUTING.md', 'THIRD_PARTY_NOTICES.md', 'docs/README.md', 'docs/guides/installation.md', 'docs/guides/knowledge-operations.md', 'docs/maintainers/releasing.md', 'knowledge/extension/README.md', 'integrations/raycast-knowledge/README.md', 'integrations/raycast-knowledge/package.json', 'authoring-skills/codex-html-plan/LICENSE', 'plugins/codex-harness/skills/harness/references/roles.md']) assert.ok(files.includes(file), file);
  assert.equal(files.some(file => /^(?:docs\/harness|benchmarks|integrations\/raycast-knowledge\/(?:src|node_modules))\//.test(file)), false);
  const unpacked = path.join(f.base, 'unpacked'); fs.mkdirSync(unpacked);
  const extraction = spawnSync('tar', ['-xzf', archive, '-C', unpacked], { encoding: 'utf8' });
  assert.ifError(extraction.error); assert.equal(extraction.status, 0, extraction.stderr);
  const docs = require('../scripts/check-doc-links.cjs');
  const archiveDocs = docs.check(path.join(unpacked, 'package'));
  assert.deepEqual(archiveDocs.errors, [], 'all current archive documentation references resolve');
  assert.ok(archiveDocs.links > 500);

  const npx = path.join(path.dirname(npm), 'npx-cli.js'); assert.ok(fs.existsSync(npx));
  function packaged(...args) { return JSON.parse(invoke(npx, ['--yes', '--offline', '--package', archive, 'codex-harness', ...args], f.project)); }
  assert.equal(packaged('doctor', '--project', f.project, '--home', f.home).node, process.versions.node);
  const status = packaged('status', '--project', f.project, '--home', f.home); assert.equal(status.active, true);
  assert.equal(status.config.improvement_loop, true); assert.equal(status.model_selection.mode, 'auto');
  assert.equal(status.model_selection.resolution, 'host-launch'); assert.equal(status.model_selection.catalog_checked, false);
  assert.deepEqual(status.model_selection.pinned_roles, []);
  assert.equal(packaged('preferences', 'read', '--project', f.project, '--home', f.home).backend, 'local');
  const installed = packaged('install', '--home', f.home); assert.equal(installed.status, 'installed');
  assert.deepEqual(docs.check(installed.target, { skillOnly: true }).errors, [], 'permanent installed documentation is self-contained');
  const knowledge = spawnSync(process.execPath, [path.join(installed.target, 'knowledge/cli.cjs'), 'status', '--state', path.join(f.base, 'isolated knowledge')], { cwd: f.project, encoding: 'utf8', env });
  assert.ifError(knowledge.error); assert.equal(knowledge.status, 0, knowledge.stderr);
  assert.equal(JSON.parse(knowledge.stdout).configured, false);
  const agents = fs.readFileSync(path.join(f.home, '.codex/AGENTS.md'), 'utf8'); assert.ok(agents.includes(path.join(installed.target, 'runtime.js'))); assert.equal(agents.includes('npm cache'), false);
  // Deleting the npx cache demonstrates that the bootstrap uses permanent installed files.
  fs.rmSync(env.npm_config_cache, { recursive: true, force: true });
  const direct = run(['status', '--project', f.project, '--home', f.home], { cwd: f.project, cli: path.join(installed.target, 'runtime.js') }); assert.equal(direct.code, 0, direct.error);
  assert.deepEqual(direct.data.config.models, {
    deterministic: { model: 'gpt-6-luna', reasoning_effort: 'low' },
    standard: { model: 'gpt-6.1-sol', reasoning_effort: 'medium' },
    complex: { model: 'gpt-6.1-sol', reasoning_effort: 'high' },
    review: { model: 'gpt-6.1-sol', reasoning_effort: 'high' },
  });
  assert.match(fs.readFileSync(path.join(installed.target, 'SKILL.md'), 'utf8'), /references\/creative-loop\.md/);
  assert.equal(fs.statSync(path.join(installed.target, 'assets/creative-preferences.md')).isFile(), true);
  assert.equal(packaged('install', '--home', f.home).status, 'unchanged');
  const skillResult = packaged('authoring', 'install', '--project', f.project); assert.equal(skillResult.skills.length, 5);
  for (const file of ['LICENSE', 'runtime/pack.mjs', 'examples/task-board.plan.html']) assert.equal(fs.existsSync(path.join(f.project, '.agents/skills/codex-html-plan', file)), true, file);
  assert.equal(fs.existsSync(path.join(f.project, 'AGENTS.md')), false); assert.equal(fs.existsSync(path.join(f.project, '.git')), false);
  assert.equal(packaged('authoring', 'uninstall', '--project', f.project).status, 'uninstalled');
  const htmlOnly = packaged('authoring', 'install', '--project', f.project, '--skill', 'codex-html-plan'); assert.deepEqual(htmlOnly.skills, ['codex-html-plan']);
  assert.equal(fs.existsSync(path.join(f.project, '.agents/skills/create-harness')), false);
  assert.equal(packaged('authoring', 'uninstall', '--project', f.project, '--skill', 'codex-html-plan').status, 'uninstalled');
  const oldProject = path.join(f.base, 'legacy four skills'); fs.mkdirSync(oldProject);
  const oldSkills = ['create-rulebooks', 'create-subagent', 'create-harness', 'inspect-harness'];
  const oldResult = packaged('authoring', 'install', '--project', oldProject, ...oldSkills.flatMap(name => ['--skill', name])); assert.deepEqual(oldResult.skills, oldSkills);
  assert.equal(fs.existsSync(path.join(oldProject, '.agents/skills/codex-html-plan')), false);
  assert.equal(packaged('authoring', 'uninstall', '--project', oldProject).status, 'uninstalled');
  assert.equal(packaged('uninstall', '--home', f.home).status, 'uninstalled');
  require('./legacy-js.cjs').installLegacyJs(f);
  assert.equal(packaged('install', '--home', f.home).status, 'installed');
  const upgraded = run(['status', '--project', f.project, '--home', f.home], { cli: path.join(installed.target, 'runtime.js') });
  assert.equal(upgraded.code, 0, upgraded.error); assert.deepEqual(upgraded.data.config.models, direct.data.config.models);
  assert.equal(fs.statSync(path.join(installed.target, 'references/creative-loop.md')).isFile(), true);
  assert.deepEqual(fs.readFileSync(path.join(installed.target, 'references/roles/record-keeper.md')), fs.readFileSync(path.join(root, 'dist/skill/references/roles/record-keeper.md')));
  assert.equal(packaged('install', '--home', f.home).status, 'unchanged');
});
