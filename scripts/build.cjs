const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'dist/skill');
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
const compiled = require('node:child_process').spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--project', path.join(root, 'tsconfig.json')], { stdio: 'inherit', cwd: root });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status || 1);
for (const name of ['SKILL.md', 'read-sections.cjs', 'assets', 'references', 'consult-claude', 'consult-codex']) {
  fs.cpSync(path.join(root, 'plugins/codex-harness/skills/harness', name), path.join(target, name), { recursive: true });
}
for (const name of ['create-rulebooks', 'create-subagent', 'create-harness', 'inspect-harness', 'codex-html-plan']) {
  fs.cpSync(path.join(root, 'authoring-skills', name), path.join(target, 'authoring-skills', name), { recursive: true });
}
// The installed skill owns a complete CLI; no checkout-relative dependency.
for (const name of fs.readdirSync(path.join(root, 'knowledge')).filter(name => name.endsWith('.cjs') || ['schemas', 'README.md'].includes(name))) {
  fs.cpSync(path.join(root, 'knowledge', name), path.join(target, 'knowledge', name), { recursive: true });
}
fs.chmodSync(path.join(target, 'knowledge/cli.cjs'), 0o755);
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ private: true, type: 'commonjs' }) + '\n');
fs.chmodSync(path.join(target, 'runtime.js'), 0o755);

// Reader guides travel with the permanent skill. Rebase links to its actual resources.
const { currentDocuments, walk, relocate } = require('./public-docs.cjs');
const documentation = path.join(target, 'documentation');
const docFiles = [...currentDocuments(root).filter(file => file !== 'knowledge/README.md'),
  ...['docs/adr', 'docs/history'].flatMap(dir => walk(path.join(root, dir)).map(file => path.relative(root, file))),
  'integrations/raycast-knowledge/package.json'];
const destinations = new Map(docFiles.map(file => [path.join(root, file), path.join(documentation, file)]));
destinations.set(path.join(root, 'knowledge/README.md'), path.join(target, 'knowledge/README.md'));
function installedTarget(source) {
  if (destinations.has(source)) return destinations.get(source);
  const pluginSource = path.join(root, 'plugins/codex-harness/skills/harness');
  if (source.startsWith(pluginSource + path.sep)) return path.join(target, path.relative(pluginSource, source));
  if (source.startsWith(path.join(root, 'authoring-skills/codex-slide-plan') + path.sep)) return path.join(documentation, 'authoring-skills/INSTALL.md');
  if (source.startsWith(path.join(root, 'authoring-skills') + path.sep)) return path.join(target, path.relative(root, source));
  return path.join(documentation, path.relative(root, source));
}
for (const file of [...docFiles, 'knowledge/README.md']) {
  const source = path.join(root, file), destination = destinations.get(source);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (file.endsWith('.md')) fs.writeFileSync(destination, relocate(fs.readFileSync(source, 'utf8'), source, destination, installedTarget));
  else fs.copyFileSync(source, destination);
}

// References may link to reader guides; rebase those links before copying the plugin.
const referenceSource = path.join(root, 'plugins/codex-harness/skills/harness/references');
for (const source of walk(referenceSource).filter(file => file.endsWith('.md'))) {
  const destination = path.join(target, 'references', path.relative(referenceSource, source));
  fs.writeFileSync(destination, relocate(fs.readFileSync(source, 'utf8'), source, destination, installedTarget));
}

// Rebased reader-guide links change reference bytes; index the actual installed originals.
const crypto = require('node:crypto');
const sectionIndexPath = path.join(target, 'references/section-index.json');
const sectionIndex = JSON.parse(fs.readFileSync(sectionIndexPath, 'utf8'));
for (const document of Object.values(sectionIndex.documents)) document.sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(target, document.path))).digest('hex');
fs.writeFileSync(sectionIndexPath, JSON.stringify(sectionIndex, null, 2) + '\n');

const plugin = path.join(root, 'dist/plugins/codex-harness');
fs.cpSync(path.join(root, 'plugins/codex-harness/.codex-plugin'), path.join(plugin, '.codex-plugin'), { recursive: true });
fs.cpSync(target, path.join(plugin, 'skills/harness'), { recursive: true });
// Keep the harness-relative resource and expose the same skill to plugin discovery.
fs.cpSync(path.join(target, 'consult-claude'), path.join(plugin, 'skills/consult-claude'), { recursive: true });

// Independent capture tool and unpacked MV3 extension; no installed/user configuration.
fs.cpSync(path.join(root, 'knowledge'), path.join(root, 'dist/knowledge'), { recursive: true });
fs.chmodSync(path.join(root, 'dist/knowledge/cli.cjs'), 0o755);

// The independent CLI/extension refer back to the public documents in the archive.
for (const file of ['knowledge/README.md', 'knowledge/extension/README.md']) {
  const source = path.join(root, file), destination = path.join(root, 'dist', file);
  fs.writeFileSync(destination, relocate(fs.readFileSync(source, 'utf8'), source, destination, referenced =>
    referenced === path.join(root, 'knowledge/extension/README.md') ? path.join(root, 'dist/knowledge/extension/README.md') : referenced));
}

// Claude Code marketplace: the same self-contained skill plus Claude agents and hooks.
const claudeSource = path.join(root, 'plugins/claude-harness');
const marketplace = path.join(root, 'dist/claude-marketplace'), claudePlugin = path.join(marketplace, 'plugins/harness');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
for (const name of ['.claude-plugin', 'agents', 'hooks', 'evals']) fs.cpSync(path.join(claudeSource, name), path.join(claudePlugin, name), { recursive: true });
const claudeManifest = path.join(claudePlugin, '.claude-plugin/plugin.json');
fs.writeFileSync(claudeManifest, JSON.stringify({ ...JSON.parse(fs.readFileSync(claudeManifest, 'utf8')), version }, null, 2) + '\n');
fs.chmodSync(path.join(claudePlugin, 'hooks/session-start.cjs'), 0o755);
fs.cpSync(target, path.join(claudePlugin, 'skills/harness'), { recursive: true, filter: file => path.relative(target, file) !== 'consult-claude' });
fs.cpSync(path.join(target, 'consult-codex'), path.join(claudePlugin, 'skills/consult-codex'), { recursive: true });
// Default authoring skills are also exposed directly; the harness copy stays self-contained.
for (const name of fs.readdirSync(path.join(target, 'authoring-skills')))
  fs.cpSync(path.join(target, 'authoring-skills', name), path.join(claudePlugin, 'skills', name), { recursive: true });
fs.mkdirSync(path.join(marketplace, '.claude-plugin'), { recursive: true });
fs.writeFileSync(path.join(marketplace, '.claude-plugin/marketplace.json'), JSON.stringify({
  name: 'codex-harness', owner: { name: 'Local developer' },
  metadata: { description: 'Harness for Claude Code built from the codex-harness package' },
  plugins: [{ name: 'harness', source: './plugins/harness', description: 'Specification-first coordination, isolated implementation and independent review', version }],
}, null, 2) + '\n');
