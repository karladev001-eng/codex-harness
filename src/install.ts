import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { canonical, codexHome, copySkill, equalFiles, exists, expand, inventory, isObject, Json, readJson, rejectSymlink, sourceRoot, within } from './lib';

export const START = '<!-- codex-harness:begin -->';
export const END = '<!-- codex-harness:end -->';
export const REQUIRED_SOURCE_FILES = [
  'SKILL.md', 'read-sections.cjs', 'references/section-index.json', 'references/section-map.md', 'runtime.js', 'lib.js', 'install.js', 'authoring.js', 'preferences.js', 'records.js', 'identity.js', 'lessons.js', 'claude.js', 'package.json',
  'consult-claude/SKILL.md', 'consult-claude/agents/openai.yaml', 'consult-claude/scripts/consult.mjs', 'consult-codex/SKILL.md', 'consult-codex/scripts/consult.mjs',
  'assets/adr.md', 'assets/completion.md', 'assets/creative-preferences.md', 'assets/defaults.json', 'assets/project-map.md', 'assets/task.md',
  'references/routing/settings.md', 'references/routing/preimplementation.md', 'references/routing/claude.md', 'references/routing/web.md', 'references/routing/creative.md', 'references/routing/coordination.md', 'references/routing/continuity.md',
  'references/routing/chart.md', 'references/routing/rule-map.md', 'references/early-compaction.md', 'references/hosts/claude-code.md',
  'references/commands.md', 'references/creative-loop.md', 'references/technical-lessons.md', 'references/measurement.md', 'references/parallel.md', 'references/reviewer.md', 'references/roles.md',
  'references/roles/paper-discovery.md', 'references/roles/source-verification.md', 'references/roles/web-review.md', 'references/roles/code-review.md', 'references/roles/record-keeper.md',
  'authoring-skills/create-harness/SKILL.md', 'authoring-skills/create-harness/assets/workflow.md',
  'authoring-skills/create-harness/assets/harness-index.md', 'authoring-skills/create-rulebooks/SKILL.md',
  'authoring-skills/create-rulebooks/assets/rulebook.md', 'authoring-skills/create-subagent/SKILL.md',
  'authoring-skills/create-subagent/assets/subagent.md', 'authoring-skills/inspect-harness/SKILL.md',
  'authoring-skills/codex-html-plan/SKILL.md', 'authoring-skills/codex-html-plan/UPSTREAM.md',
  'authoring-skills/codex-html-plan/LICENSE', 'authoring-skills/codex-html-plan/read-sections.cjs', 'authoring-skills/codex-html-plan/references/section-index.json', 'authoring-skills/codex-html-plan/agents/openai.yaml',
  'authoring-skills/codex-html-plan/runtime/htmlplan.js', 'authoring-skills/codex-html-plan/runtime/htmlplan.css',
  'authoring-skills/codex-html-plan/runtime/pack.mjs', 'authoring-skills/codex-html-plan/references/blocks.md',
  'authoring-skills/codex-html-plan/references/workflow.md', 'authoring-skills/codex-html-plan/references/color-design.md',
  'authoring-skills/codex-html-plan/examples/task-board.src.html', 'authoring-skills/codex-html-plan/examples/task-board.plan.html',
  'authoring-skills/codex-html-plan/examples/records/ADR-07.md', 'authoring-skills/codex-html-plan/examples/records/TASK-42.md',
  'authoring-skills/codex-html-plan/examples/records/EXP-03.md', 'authoring-skills/codex-html-plan/examples/records/index.md',
];
export interface InstallArgs { home?: string; skills_dir?: string }
export function bootstrap(target: string): string {
  return `${START}\nA delegated worker performs only its bounded assignment and never starts this coordinator.\nFor coding, UI/document creation/revision and feedback, or Web search/research, invoke Node.js 22+ on\n\`${path.join(target, 'runtime.js')}\` with arguments \`status --project .\`, quoting\nits path for the active shell. Also check status for pure ideation, strategy consultation,\nand criticism of proposals. If inactive, continue normally without additional harness\nactions. If active, read \`${path.join(target, 'SKILL.md')}\` and follow its relevant\ninstructions. Pure creative work and Web-only research do not require coding delegation or Git steps.\nPure ideation, consultation and criticism alone do not require implementation approval.\nHonor higher-priority environment and project instructions. If the skill is absent, continue normally.\nIf status fails, report the configuration or compatibility error; do not activate features silently.\n${END}`;
}
export function blockRange(content: string): [number, number] {
  if (content.split(START).length !== 2 || content.split(END).length !== 2) throw new Error('Managed AGENTS.md markers missing, duplicated, or modified');
  const start = content.indexOf(START), end = content.indexOf(END) + END.length;
  if (end < start) throw new Error('Invalid managed AGENTS.md marker order');
  return [start, end];
}
function readAgents(file: string): string {
  rejectSymlink(file, 'AGENTS.md');
  // Fatal decoding prevents a successful install from rewriting invalid UTF-8 user bytes.
  return exists(file) ? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(file)) : '';
}
export function loadOwned(manifest: string, agents: string, content: string): Json | null {
  rejectSymlink(manifest, 'Ownership manifest');
  if (!exists(manifest)) return null;
  const state = readJson(manifest);
  if (!isObject(state) || ![1, 2].includes(state.schema_version) || state.agents !== agents || typeof state.target !== 'string' || !path.isAbsolute(state.target)) throw new Error('Invalid installation ownership manifest');
  if (!equalFiles(inventory(state.target), state.files)) throw new Error('Installed skill has user changes; preserve or restore them before update/uninstall');
  const [start, end] = blockRange(content);
  if (content.slice(start, end) !== state.block) throw new Error('Managed AGENTS.md instructions were edited; restore them before update/uninstall');
  return state;
}
function backup(codex: string, state: Json | null, agents: string): string {
  const root = path.join(codex, 'harness/backups');
  fs.mkdirSync(root, { recursive: true });
  const destination = fs.mkdtempSync(path.join(root, 'install-'));
  if (exists(agents)) fs.copyFileSync(agents, path.join(destination, 'AGENTS.md'));
  if (state) {
    copySkill(state.target, path.join(destination, 'skill'));
    fs.writeFileSync(path.join(destination, 'install.json'), JSON.stringify(state, null, 2) + '\n');
  }
  return destination;
}
function restoreFile(file: string, bytes: Buffer | null): void {
  if (bytes === null) { if (exists(file)) fs.unlinkSync(file); }
  else if (!exists(file) || !fs.readFileSync(file).equals(bytes)) fs.writeFileSync(file, bytes);
}
// Each rollback operation is attempted independently. A failed rollback keeps the staged
// previous version and reports its location rather than destroying recovery material.
function rollback(operations: (() => void)[], temporary: string, error: unknown): never {
  const failures: unknown[] = [];
  for (const operation of operations) { try { operation(); } catch (failure) { failures.push(failure); } }
  if (failures.length) throw new Error(`${error}; rollback incomplete; recovery files kept at ${temporary}: ${failures.join('; ')}`);
  fs.rmSync(temporary, { recursive: true, force: true });
  throw error;
}
export function install(args: InstallArgs, source = sourceRoot): Json {
  const user = args.home ? canonical(args.home) : os.homedir();
  const codex = codexHome(args.home), manifest = path.join(codex, 'harness/install.json'), agents = path.join(codex, 'AGENTS.md');
  if (exists(path.join(codex, 'AGENTS.override.md'))) throw new Error('AGENTS.override.md would shadow the bootstrap; resolve this existing override before installation');
  const content = readAgents(agents), state = loadOwned(manifest, agents, content);
  let target = args.skills_dir ? expand(args.skills_dir) + path.sep + 'codex-harness' : state?.target || path.join(user, '.agents/skills/codex-harness');
  rejectSymlink(target, 'Skill target');
  target = canonical(target); source = canonical(source);
  if (state && target !== state.target) throw new Error('Uninstall before changing the skill target');
  if (!state && (exists(target) || content.includes(START) || content.includes(END))) throw new Error('Unowned skill target or AGENTS.md markers already exist');
  if (within(source, target) || within(target, source)) throw new Error('Skill source and installation target must not overlap');
  const files = Object.fromEntries(Object.entries(inventory(source)).filter(([file]) => !file.startsWith('authoring-skills/codex-slide-plan/'))), missing = REQUIRED_SOURCE_FILES.filter(file => !Object.hasOwn(files, file));
  if (missing.length) throw new Error('Source skill is incomplete; missing: ' + missing.sort().join(', '));
  const block = bootstrap(target);
  if (state && equalFiles(state.files, files) && state.block === block) return { status: 'unchanged', target };
  if (source === target) throw new Error('Cannot replace the source skill itself; run install from a separate release package');
  let updated: string, separator: string, suffix: string, originalExists: boolean;
  if (state) {
    const [start, end] = blockRange(content);
    updated = content.slice(0, start) + block + content.slice(end);
    separator = state.separator ?? ''; suffix = state.suffix ?? '\n'; originalExists = state.agents_existed ?? true;
  } else {
    separator = content ? content.endsWith('\n') ? '\n' : '\n\n' : '';
    suffix = '\n'; originalExists = exists(agents); updated = content + separator + block + suffix;
  }
  const saved = backup(codex, state, agents);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const oldManifest = exists(manifest) ? fs.readFileSync(manifest) : null;
  const oldAgents = exists(agents) ? fs.readFileSync(agents) : null;
  const temporary = fs.mkdtempSync(path.join(path.dirname(target), '.harness-stage-'));
  const staged = path.join(temporary, 'skill'), previous = path.join(temporary, 'previous');
  let installed = false;
  try {
    // Even a previous bundled release must not place the optional skill under core.
    fs.cpSync(source, staged, { recursive: true, filter: file => path.basename(file) !== '__pycache__' && path.relative(source, file) !== path.join('authoring-skills', 'codex-slide-plan') });
    if (exists(target)) fs.renameSync(target, previous);
    fs.renameSync(staged, target); installed = true;
    fs.writeFileSync(agents, updated, 'utf8');
    fs.writeFileSync(manifest, JSON.stringify({ schema_version: 2, target, agents, files, block, separator, suffix, agents_existed: originalExists }, null, 2) + '\n');
  } catch (error) {
    rollback([
      () => { if (installed) fs.rmSync(target, { recursive: true }); if (exists(previous)) fs.renameSync(previous, target); },
      () => restoreFile(agents, oldAgents), () => restoreFile(manifest, oldManifest),
    ], temporary, error);
  }
  fs.rmSync(temporary, { recursive: true, force: true });
  return { status: 'installed', target, backup: saved };
}
export function uninstall(args: InstallArgs): Json {
  const codex = codexHome(args.home), manifest = path.join(codex, 'harness/install.json'), agents = path.join(codex, 'AGENTS.md');
  const content = readAgents(agents), state = loadOwned(manifest, agents, content);
  if (!state) return { status: 'not_installed' };
  let [start, end] = blockRange(content);
  const separator = state.separator ?? '', suffix = state.suffix ?? '';
  if (separator && content.slice(0, start).endsWith(separator)) start -= separator.length;
  if (suffix && content.slice(end).startsWith(suffix)) end += suffix.length;
  const updated = content.slice(0, start) + content.slice(end), saved = backup(codex, state, agents);
  const target = state.target, oldManifest = fs.readFileSync(manifest), oldAgents = fs.readFileSync(agents);
  const temporary = fs.mkdtempSync(path.join(path.dirname(target), '.harness-remove-')), previous = path.join(temporary, 'skill');
  try {
    fs.renameSync(target, previous);
    if (!updated && !(state.agents_existed ?? true)) fs.unlinkSync(agents);
    else fs.writeFileSync(agents, updated, 'utf8');
    fs.unlinkSync(manifest);
  } catch (error) {
    rollback([() => { if (exists(previous)) fs.renameSync(previous, target); }, () => restoreFile(agents, oldAgents), () => restoreFile(manifest, oldManifest)], temporary, error);
  }
  fs.rmSync(temporary, { recursive: true, force: true });
  return { status: 'uninstalled', backup: saved };
}
