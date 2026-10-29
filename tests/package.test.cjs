const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
  const version = require('../package.json').version;
  assert.equal(packed.version, version);
  assert.equal(require('../package-lock.json').version, version);
  assert.equal(require('../package-lock.json').packages[''].version, version);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'dist/plugins/codex-harness/.codex-plugin/plugin.json'), 'utf8')).version, version);
  const archive = path.join(f.base, packed.filename), files = packed.files.map(file => file.path);
  assert.ok(files.includes('dist/skill/runtime.js'));
  assert.ok(files.includes('dist/skill/preferences.js'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/preferences.js'));
  assert.ok(files.includes('dist/skill/references/creative-loop.md'));
  for (const prefix of ['dist/skill', 'dist/plugins/codex-harness/skills/harness', 'plugins/codex-harness/skills/harness']) {
    assert.ok(files.includes(prefix + '/references/technical-lessons.md'), prefix + ':technical-lessons');
    for (const file of ['settings', 'preimplementation', 'peer-consult', 'web', 'creative', 'coordination', 'continuity', 'chart', 'rule-map']) assert.ok(files.includes(prefix + '/references/routing/' + file + '.md'), prefix + ':' + file);
  }
  assert.ok(files.includes('dist/skill/references/roles/record-keeper.md'));
  assert.ok(files.includes('dist/skill/assets/creative-preferences.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/.codex-plugin/plugin.json'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/references/creative-loop.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/references/roles/record-keeper.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/assets/creative-preferences.md'));
  assert.ok(files.includes('dist/plugins/codex-harness/skills/harness/runtime.js')); assert.ok(files.includes('dist/skill/authoring-skills/inspect-harness/SKILL.md'));
  for (const prefix of ['dist/skill/consult-claude', 'dist/plugins/codex-harness/skills/harness/consult-claude', 'dist/plugins/codex-harness/skills/consult-claude', 'plugins/codex-harness/skills/harness/consult-claude']) {
    for (const file of ['SKILL.md', 'agents/openai.yaml', 'scripts/consult.mjs']) assert.ok(files.includes(prefix + '/' + file), prefix + '/' + file);
  }
  for (const file of ['SKILL.md', 'UPSTREAM.md', 'LICENSE', 'runtime/pack.mjs', 'runtime/htmlplan.js', 'runtime/htmlplan.css', 'references/blocks.md', 'references/workflow.md', 'references/color-design.md', 'examples/task-board.src.html', 'examples/task-board.plan.html', 'examples/records/ADR-07.md', 'examples/records/TASK-42.md', 'examples/records/EXP-03.md', 'examples/records/index.md']) {
    assert.ok(files.includes('dist/skill/authoring-skills/codex-html-plan/' + file), file);
  }
  for (const file of ['SKILL.md', 'agents/openai.yaml', 'references/schema.md', 'references/workflow.md', 'references/masters.md', 'scripts/legacy-v1.json', 'scripts/pack.mjs', 'scripts/review.js', 'scripts/style.css', 'scripts/inspect-master.py', 'scripts/make-fixtures.py', 'examples/deck.json']) {
    assert.ok(files.includes('authoring-skills/codex-slide-plan/' + file), file);
  }
  assert.equal(files.some(file => /^(?:dist\/skill|dist\/plugins\/codex-harness\/skills\/harness)\/authoring-skills\/codex-slide-plan\//.test(file)), false);
  const allowedPython = new Set([
    'authoring-skills/codex-slide-plan/scripts/inspect-master.py', 'authoring-skills/codex-slide-plan/scripts/make-fixtures.py',
  ]);
  for (const file of allowedPython) assert.ok(files.includes(file), file);
  assert.equal(files.some(file => /(?:node_modules|^src\/)/.test(file) || (/\.py$/.test(file) && !allowedPython.has(file))), false);
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
  assert.match(fs.readFileSync(path.join(installed.target, 'SKILL.md'), 'utf8'), /references\/routing\/creative\.md/);
  assert.equal(fs.statSync(path.join(installed.target, 'assets/creative-preferences.md')).isFile(), true);
  assert.equal(packaged('install', '--home', f.home).status, 'unchanged');
  assert.equal(fs.existsSync(path.join(installed.target, 'authoring-skills/codex-slide-plan')), false);
  const skillResult = packaged('authoring', 'install', '--project', f.project); assert.equal(skillResult.skills.length, 5);
  for (const file of ['LICENSE', 'runtime/pack.mjs', 'examples/task-board.plan.html']) assert.equal(fs.existsSync(path.join(f.project, '.agents/skills/codex-html-plan', file)), true, file);
  assert.equal(fs.existsSync(path.join(f.project, 'AGENTS.md')), false); assert.equal(fs.existsSync(path.join(f.project, '.git')), false);
  assert.equal(packaged('authoring', 'uninstall', '--project', f.project).status, 'uninstalled');
  const slidesOnly = packaged('authoring', 'install', '--project', f.project, '--skill', 'codex-slide-plan'); assert.deepEqual(slidesOnly.skills, ['codex-slide-plan']);
  for (const file of ['SKILL.md', 'scripts/pack.mjs', 'examples/deck.json']) assert.equal(fs.existsSync(path.join(f.project, '.agents/skills/codex-slide-plan', file)), true, file);
  assert.equal(packaged('authoring', 'install', '--project', f.project, '--skill', 'codex-slide-plan').status, 'unchanged');
  const slideRoot = path.join(f.project, '.agents/skills/codex-slide-plan'), optionalBefore = tree(slideRoot);
  packaged('authoring', 'install', '--project', f.project); packaged('authoring', 'uninstall', '--project', f.project);
  assert.deepEqual(tree(slideRoot), optionalBefore);
  const generated = path.join(f.base, 'generated HTML'), deck = path.join(slideRoot, 'examples/deck.json');
  const buildSlides = spawnSync(process.execPath, [path.join(slideRoot, 'scripts/pack.mjs'), 'build', deck, '--out', generated], { encoding: 'utf8', cwd: f.project, env });
  assert.ifError(buildSlides.error); assert.equal(buildSlides.status, 0, buildSlides.stderr + buildSlides.stdout);
  assert.ok(require('../scripts/public-docs.cjs').walk(generated).some(file => path.basename(file) === 'review.html'));
  assert.equal(packaged('authoring', 'uninstall', '--project', f.project, '--skill', 'codex-slide-plan').status, 'uninstalled');
  const htmlOnly = packaged('authoring', 'install', '--project', f.project, '--skill', 'codex-html-plan'); assert.deepEqual(htmlOnly.skills, ['codex-html-plan']);
  assert.equal(fs.existsSync(path.join(f.project, '.agents/skills/create-harness')), false);
  assert.equal(packaged('authoring', 'uninstall', '--project', f.project, '--skill', 'codex-html-plan').status, 'uninstalled');
  const oldProject = path.join(f.base, 'legacy four skills'); fs.mkdirSync(oldProject);
  const oldSkills = ['create-rulebooks', 'create-subagent', 'create-harness', 'inspect-harness'];
  const oldResult = packaged('authoring', 'install', '--project', oldProject, ...oldSkills.flatMap(name => ['--skill', name])); assert.deepEqual(oldResult.skills, oldSkills);
  assert.equal(fs.existsSync(path.join(oldProject, '.agents/skills/codex-html-plan')), false);
  assert.equal(packaged('authoring', 'uninstall', '--project', oldProject).status, 'uninstalled');
  const previousFiveProject = path.join(f.base, 'previous five skills'); fs.mkdirSync(previousFiveProject);
  const previousFive = [...oldSkills, 'codex-html-plan'];
  const previousFiveInstall = packaged('authoring', 'install', '--project', previousFiveProject, ...previousFive.flatMap(name => ['--skill', name])); assert.deepEqual(previousFiveInstall.skills, previousFive);
  const upgradedSkills = packaged('authoring', 'install', '--project', previousFiveProject); assert.equal(upgradedSkills.status, 'unchanged'); assert.deepEqual(upgradedSkills.skills, previousFive);
  assert.equal(fs.existsSync(path.join(previousFiveProject, '.agents/skills/codex-html-plan/SKILL.md')), true);
  assert.equal(packaged('authoring', 'uninstall', '--project', previousFiveProject).status, 'uninstalled');
  assert.equal(packaged('uninstall', '--home', f.home).status, 'uninstalled');
  require('./legacy-js.cjs').installLegacyJs(f);
  assert.equal(packaged('install', '--home', f.home).status, 'installed');
  const upgraded = run(['status', '--project', f.project, '--home', f.home], { cli: path.join(installed.target, 'runtime.js') });
  assert.equal(upgraded.code, 0, upgraded.error); assert.deepEqual(upgraded.data.config.models, direct.data.config.models);
  assert.equal(fs.statSync(path.join(installed.target, 'references/creative-loop.md')).isFile(), true);
  assert.deepEqual(fs.readFileSync(path.join(installed.target, 'references/technical-lessons.md')), fs.readFileSync(path.join(root, 'dist/skill/references/technical-lessons.md')));
  assert.deepEqual(fs.readFileSync(path.join(installed.target, 'references/roles/record-keeper.md')), fs.readFileSync(path.join(root, 'dist/skill/references/roles/record-keeper.md')));
  assert.equal(packaged('install', '--home', f.home).status, 'unchanged');
});

test('actual npx tarball update refreshes an explicit optional skill and refuses edited content', { timeout: 120000 }, t => {
  const f = fixture(t), npm = process.env.npm_execpath;
  assert.ok(npm && fs.existsSync(npm), 'Run packaging tests using npm test');
  const env = { ...require('./npm-fixture.cjs').npmEnvironment(f), npm_config_offline: 'true' };
  const npx = path.join(path.dirname(npm), 'npx-cli.js'); assert.ok(fs.existsSync(npx));
  const unpacked = path.join(f.base, 'npx package source'); fs.mkdirSync(unpacked);
  const packed = spawnSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', f.base], { encoding: 'utf8', cwd: root, env, timeout: 90000 });
  assert.ifError(packed.error); assert.equal(packed.status, 0, packed.stderr);
  const filename = JSON.parse(packed.stdout)[0].filename;
  const extraction = spawnSync('tar', ['-xzf', path.join(f.base, filename), '-C', unpacked], { encoding: 'utf8' });
  assert.ifError(extraction.error); assert.equal(extraction.status, 0, extraction.stderr);
  const originalPackage = path.join(unpacked, 'package');
  const sourceSkill = path.join(originalPackage, 'authoring-skills/codex-slide-plan/SKILL.md');
  assert.equal(fs.existsSync(sourceSkill), true, 'the packed source contains the optional skill');

  function makeRelease(version, marker) {
    const stage = path.join(f.base, 'release ' + marker); fs.cpSync(originalPackage, stage, { recursive: true });
    const manifest = path.join(stage, 'package.json'), metadata = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    metadata.version = version; fs.writeFileSync(manifest, JSON.stringify(metadata, null, 2) + '\n');
    const skill = path.join(stage, 'authoring-skills/codex-slide-plan/SKILL.md');
    fs.appendFileSync(skill, `\n<!-- integration fixture ${marker} -->\n`);
    const result = spawnSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--offline', '--json', '--pack-destination', f.base], { encoding: 'utf8', cwd: stage, env, timeout: 90000 });
    assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
    return path.join(f.base, JSON.parse(result.stdout)[0].filename);
  }
  const oldArchive = makeRelease('0.4.2-integration.1', 'release-one');
  const newArchive = makeRelease('0.4.2-integration.2', 'release-two');
  function run(archivePath, ...args) {
    return spawnSync(process.execPath, [npx, '--yes', '--offline', '--package', archivePath, 'codex-harness', ...args], {
      encoding: 'utf8', cwd: f.project, env, timeout: 90000,
    });
  }
  function success(result) { assert.ifError(result.error); assert.equal(result.status, 0, result.stderr + result.stdout); return JSON.parse(result.stdout); }

  const homeAgents = path.join(f.home, '.codex/AGENTS.md'); write(homeAgents, '\uFEFF# Personal instructions\r\n');
  const homeSettings = path.join(f.home, '.codex/harness/settings.json'); write(homeSettings, '{"measurement":false}\r\n');
  const agentsBefore = fs.readFileSync(homeAgents), settingsBefore = fs.readFileSync(homeSettings);
  const installedHome = success(run(oldArchive, 'install', '--home', f.home)); assert.equal(installedHome.status, 'installed');
  const managedAgentsBefore = fs.readFileSync(homeAgents);
  assert.ok(managedAgentsBefore.subarray(0, agentsBefore.length).equals(agentsBefore), 'the original AGENTS bytes stay before the managed block');
  const preservedPreferences = path.join(require('../dist/skill/lib.js').localRoot(f.project, f.home), 'creative/preferences.md');
  write(preservedPreferences, '# Existing preferences\r\n');
  const preferencesBefore = fs.readFileSync(preservedPreferences);

  const projectAgents = path.join(f.project, 'AGENTS.md'); write(projectAgents, '# Project instructions\r\n');
  const oldInstall = success(run(oldArchive, 'authoring', 'install', '--project', f.project, '--skill', 'codex-slide-plan'));
  assert.deepEqual(oldInstall.skills, ['codex-slide-plan']);
  const skillRoot = path.join(f.project, '.agents/skills/codex-slide-plan');
  const skillFile = path.join(skillRoot, 'SKILL.md'); assert.match(fs.readFileSync(skillFile, 'utf8'), /fixture release-one/);
  const originalSkillHash = crypto.createHash('sha256').update(fs.readFileSync(skillFile)).digest('hex');

  const afterOldInstall = tree(skillRoot);
  assert.equal(success(run(oldArchive, 'authoring', 'install', '--project', f.project)).skills.length, 5);
  assert.equal(success(run(oldArchive, 'authoring', 'uninstall', '--project', f.project)).status, 'uninstalled');
  assert.deepEqual(tree(skillRoot), afterOldInstall, 'default install and uninstall leave the optional skill untouched');
  assert.equal(success(run(oldArchive, 'install', '--home', f.home)).status, 'unchanged');
  assert.deepEqual(fs.readFileSync(homeAgents), managedAgentsBefore);
  assert.deepEqual(fs.readFileSync(homeSettings), settingsBefore);
  assert.deepEqual(fs.readFileSync(preservedPreferences), preferencesBefore);

  const updated = success(run(newArchive, 'authoring', 'install', '--project', f.project, '--skill', 'codex-slide-plan'));
  assert.equal(updated.status, 'installed');
  assert.match(fs.readFileSync(skillFile, 'utf8'), /fixture release-two/);
  assert.notEqual(crypto.createHash('sha256').update(fs.readFileSync(skillFile)).digest('hex'), originalSkillHash);
  assert.equal(fs.readFileSync(projectAgents, 'utf8'), '# Project instructions\r\n');
  assert.deepEqual(fs.readFileSync(homeAgents), managedAgentsBefore);
  assert.deepEqual(fs.readFileSync(homeSettings), settingsBefore);
  assert.deepEqual(fs.readFileSync(preservedPreferences), preferencesBefore);

  fs.appendFileSync(skillFile, '\nUser customization\n');
  const editedTree = tree(skillRoot), editedHash = crypto.createHash('sha256').update(fs.readFileSync(skillFile)).digest('hex');
  const refused = run(newArchive, 'authoring', 'install', '--project', f.project, '--skill', 'codex-slide-plan');
  assert.ifError(refused.error); assert.notEqual(refused.status, 0); assert.match(refused.stderr, /user changes/);
  assert.deepEqual(tree(skillRoot), editedTree);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(skillFile)).digest('hex'), editedHash);
  assert.deepEqual(fs.readFileSync(homeAgents), managedAgentsBefore);
  assert.deepEqual(fs.readFileSync(homeSettings), settingsBefore);
  assert.deepEqual(fs.readFileSync(preservedPreferences), preferencesBefore);
});
