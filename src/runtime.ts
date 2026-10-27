#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { active, canonical, dataHome, migrateData, git, isObject, Json, localRoot, readJson, safePath, saveNew, resolveSettings, taskId, exists } from './lib';
import { install, uninstall } from './install';
import { installClaude, uninstallClaude } from './claude';
import { authoring } from './authoring';
import { lessons } from './lessons';
import { preferences, preferenceLocation } from './preferences';

export function packets(project: string): Record<string, Json> {
  const directory = safePath(project, 'docs', 'harness', 'tasks');
  return !fs.existsSync(directory) ? {} : Object.fromEntries(fs.readdirSync(directory).filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), readJson(safePath(project, 'docs', 'harness', 'tasks', name))]));
}
export function validateGraph(items: Record<string, Json>): void {
  for (const [key, packet] of Object.entries(items)) {
    taskId(key);
    if (!isObject(packet) || !Array.isArray(packet.dependencies)) throw new Error(`Task ${key} must contain a dependencies list`);
  }
  const visiting = new Set<string>(), done = new Set<string>();
  function visit(key: string) {
    if (visiting.has(key)) throw new Error('Dependency cycle involving ' + key);
    if (!Object.hasOwn(items, key)) throw new Error('Missing dependency: ' + key);
    if (done.has(key)) return;
    visiting.add(key);
    for (const dep of items[key].dependencies) visit(taskId(dep));
    visiting.delete(key); done.add(key);
  }
  for (const key of Object.keys(items)) visit(key);
}
export function createTask(args: Json, config: Json): Json {
  const key = taskId(args.id);
  if (!args.acceptance.length || !args.scope.length) throw new Error('At least one --acceptance and --scope are required');
  for (const owned of args.scope)
    if (path.isAbsolute(owned) || path.win32.isAbsolute(owned) || owned.split(/[/\\]/).includes('..')) throw new Error('Owned paths must be project-relative');
  let revision = null;
  try { revision = git(args.project, 'rev-parse', '--verify', args.base + '^{commit}'); }
  catch { if (args.base !== 'HEAD') throw new Error('Explicit base cannot be resolved'); }
  const packet = { id: key, goal: args.goal, non_goals: args.non_goal,
    acceptance_criteria: args.acceptance.map((text: string, i: number) => ({ id: i + 1, text })), owned_paths: args.scope,
    dependencies: args.depends_on, spec_revision: args.spec_revision, code_base_revision: revision,
    constraints: args.constraint, source_references: args.reference, open_questions: [], state: 'planned', completion: null };
  if (config.persistence) {
    const existing = packets(args.project);
    if (Object.hasOwn(existing, key)) throw new Error('Task already exists: ' + key);
    validateGraph({ ...existing, [key]: packet });
    saveNew(safePath(args.project, 'docs/harness/tasks', key + '.json'), packet);
  }
  return packet;
}
export function createWorktree(args: Json, config: Json): Json {
  const key = taskId(args.id);
  if (!config.delegation) return { skipped: 'delegation disabled' };
  const revision = git(args.project, 'rev-parse', '--verify', args.base + '^{commit}');
  if (config.persistence) {
    const packetPath = safePath(args.project, 'docs', 'harness', 'tasks', key + '.json');
    if (fs.existsSync(packetPath)) {
      const packet = readJson(packetPath);
      if (!isObject(packet)) throw new Error(`Task ${key} packet must be an object`);
      if (!packet.code_base_revision) throw new Error(`Task ${key} has no recorded code_base_revision`);
      if (packet.code_base_revision !== revision) throw new Error(`Task ${key} code_base_revision does not match requested base`);
    }
  }
  if (git(args.project, 'status', '--porcelain', '--', '.', ':(top,exclude)docs/harness/**', ':(top,exclude).harness.json')) throw new Error('Checkout has uncommitted changes; checkpoint or use serial work first');
  const directory = safePath(localRoot(args.project, args.home), 'worktrees', key), branch = 'harness/' + key;
  if (git(args.project, 'for-each-ref', '--format=%(refname)', 'refs/heads/' + branch) || exists(directory)) throw new Error('Worktree path or branch already exists');
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  git(args.project, 'worktree', 'add', '-b', branch, directory, revision);
  return { path: directory, branch, base_revision: revision };
}
// Parse calendar timestamps explicitly: Date.parse silently normalizes February 30
// and discards sub-millisecond precision. Preserve Python's microsecond precision.
function isoTimestamp(value: unknown): bigint {
  if (typeof value !== 'string') throw new Error('Invalid timestamp');
  const match = /^(\d{4})-?(\d{2})-?(\d{2})[\s\S](\d{2})(?::?(\d{2}))?(?::?(\d{2}))?(?:[.,](\d+))?(Z|[+-]\d{2}(?::?\d{2})?(?::?\d{2}(?:[.,]\d+)?)?)$/.exec(value);
  if (!match) throw new Error('Invalid timestamp');
  const [, yearText, monthText, dayText, hourText, minuteText = '0', secondText = '0', fraction = '', zone] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText), hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, 0);
  if (year < 1 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) throw new Error('Invalid timestamp');
  const microseconds = (fraction: string): bigint => BigInt(fraction.slice(0, 6).padEnd(6, '0') || '0');
  let offset = 0n;
  if (zone !== 'Z') {
    const parts = /^([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2})(?:[.,](\d+))?)?$/.exec(zone)!;
    offset = BigInt(Number(parts[2]) * 3600 + Number(parts[3] || 0) * 60 + Number(parts[4] || 0)) * 1000000n + microseconds(parts[5] || '');
    if (offset >= 86400000000n) throw new Error('Invalid timestamp offset');
    if (parts[1] === '-') offset = -offset;
  }
  return BigInt(date.getTime()) * 1000n + microseconds(fraction) - offset;
}
export function measurement(data: unknown): Json {
  if (!isObject(data)) throw new Error('Measurement must be an object');
  for (const key of ['task_id', 'run_id']) taskId(data[key] ?? '');
  if (!['baseline', 'harness'].includes(data.condition)) throw new Error('condition must be baseline or harness');
  let start: bigint, end: bigint;
  try { start = isoTimestamp(data.start); end = isoTimestamp(data.end); if (end < start) throw new Error('Invalid time order'); }
  catch { throw new Error('start/end must be ordered ISO timestamps with timezone'); }
  const result: Json = { ...data, elapsed_seconds: Number(end - start) / 1e6 };
  for (const key of ['model_roles', 'corrections', 'completion', 'defects', 'usage_before', 'usage_after', 'window_before', 'window_after', 'overlap'])
    if (!Object.hasOwn(result, key)) result[key] = null;
  const before = result.usage_before, after = result.usage_after;
  for (const value of [before, after]) if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)) throw new Error('usage must be percent consumed between 0 and 100');
  const reasons: string[] = [];
  if (before === null || after === null) reasons.push('missing usage');
  if (!result.window_before || (Array.isArray(result.window_before) && !result.window_before.length) || (isObject(result.window_before) && !Object.keys(result.window_before).length) || !isDeepStrictEqual(result.window_before, result.window_after)) reasons.push('missing or changed reset window');
  if (result.overlap !== false) reasons.push('overlap present or unknown');
  if (before !== null && after !== null && after < before) reasons.push('usage decreased');
  return { ...result, comparable: !reasons.length, exclusion_reasons: reasons, account_usage_delta: reasons.length ? null : after - before };
}
const HELP = `Codex Harness (Node.js 22+)\n\nCommands:\n  status|doctor [--project PATH] [--home PATH] [--host codex|claude]\n  install [--home PATH] [--skills-dir PARENT] [--host codex|claude]\n  uninstall [--home PATH] [--host codex|claude]\n  data where|migrate [--home PATH]\n  task create --id ID --goal TEXT --acceptance TEXT --scope PATH [--base HEAD]\n    [--depends-on ID] [--non-goal TEXT] [--constraint TEXT] [--reference TEXT] [--spec-revision 1]\n  task show --id ID | task validate\n  worktree create --id ID --base COMMIT\n  measure record --input FILE\n  preferences register|read|sync|migrate [--offline true]\n  preferences sync-all [--project PATH] [--home PATH]\n  preferences write --input FILE --revision TOKEN [--offline true] [--base-sha SHA|missing] [--kind create|update|correction|forget]\n  lessons read|sync --id ID [--offline true]\n  lessons write --input FILE --revision TOKEN [--kind create|update|correction]\n  lessons forget --id ID --revision TOKEN\n  lessons search [--query TEXT] [--limit 1..10]\n  authoring install|uninstall [--project PATH] [--skills-dir PARENT] [--skill NAME]\n\nRuntime task/worktree/measure/preferences commands accept --project and --home.\nRepeat --acceptance, --scope, --depends-on, --non-goal, --constraint, --reference, --skill.\nSettings: improvement_loop (boolean, default true), model_selection (auto|fixed, default auto).\nShared data lives in $HARNESS_HOME or ~/.agents/harness; data migrate copies a pre-0.5 ~/.codex/harness store.\nStatus is read-only; auto models are resolved by the agent from the live host launch catalog.\nAuthoring defaults to five skills in PROJECT/.agents/skills; it never activates orchestration.\nOptional codex-slide-plan requires --skill codex-slide-plan from a supporting release package.\nUnspecified authoring install/uninstall leaves optional skills untouched.\n`;
function parse(argv: string[]): Json {
  const [command, ...rest] = argv;
  const args: Json = { command, project: '.', acceptance: [], scope: [], depends_on: [], non_goal: [], constraint: [], reference: [], skill: [], spec_revision: '1', base: 'HEAD' };
  const nested = ['task', 'worktree', 'measure', 'authoring', 'preferences', 'lessons', 'data'].includes(command);
  if (nested) args.action = rest.shift();
  const key = command + (nested ? ' ' + args.action : '');
  const common = ['project', 'home'];
  const allowed: Record<string, string[]> = {
    status: [...common, 'host'], doctor: [...common, 'host'], install: ['home', 'skills-dir', 'host'], uninstall: ['home', 'host'], 'data where': ['home'], 'data migrate': ['home'],
    'task create': [...common, 'id', 'goal', 'acceptance', 'scope', 'depends-on', 'non-goal', 'constraint', 'reference', 'spec-revision', 'base'],
    'task show': [...common, 'id'], 'task validate': common, 'worktree create': [...common, 'id', 'base'],
    'preferences register': [...common, 'project-key'], 'preferences sync-all': common,
    'preferences read': [...common, 'offline'], 'preferences sync': [...common, 'offline'],
    'preferences migrate': [...common, 'offline'], 'preferences write': [...common, 'input', 'revision', 'offline', 'base-sha', 'kind'],
    'lessons read': [...common, 'id', 'offline'], 'lessons sync': [...common, 'id', 'offline'],
    'lessons write': [...common, 'input', 'revision', 'offline', 'base-sha', 'kind'],
    'lessons forget': [...common, 'id', 'revision', 'offline', 'base-sha'], 'lessons search': [...common, 'query', 'limit', 'offline'],
    'measure record': [...common, 'input'], 'authoring install': ['project', 'skills-dir', 'skill'], 'authoring uninstall': ['project', 'skills-dir', 'skill'],
  };
  if (!Object.hasOwn(allowed, key)) throw new Error('Unknown or missing command; use --help');
  const provided = new Set<string>();
  while (rest.length) {
    const token = rest.shift()!, match = /^--([^=]+)(?:=(.*))?$/.exec(token);
    if (!match || !allowed[key].includes(match[1])) throw new Error('Unknown argument: ' + token);
    const value = match[2] ?? rest.shift();
    if (value === undefined || (match[2] === undefined && value.startsWith('--'))) throw new Error('Missing value: ' + token);
    const option = match[1].replaceAll('-', '_'); provided.add(option);
    if (Array.isArray(args[option])) args[option].push(value); else args[option] = value;
  }
  const required: Record<string, string[]> = { 'task create': ['id', 'goal'], 'task show': ['id'], 'worktree create': ['id', 'base'], 'measure record': ['input'], 'preferences write': ['input', 'revision'], 'lessons write': ['input', 'revision'], 'lessons read': ['id'], 'lessons sync': ['id'], 'lessons forget': ['id', 'revision'] };
  for (const option of required[key] || []) if (!provided.has(option)) throw new Error('Missing required --' + option);
  return args;
}
function executable(name: string): string | null {
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) for (const ext of extensions) {
    const file = path.join(dir, name + ext);
    try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return file; } catch { /* continue */ }
  }
  return null;
}
export function execute(args: Json): Json {
  if (['install', 'uninstall'].includes(args.command) && args.host !== undefined && !['codex', 'claude'].includes(args.host)) throw new Error('Unknown host: expected codex or claude');
  if (args.command === 'install') return { ...(args.host === 'claude' ? installClaude(args) : install(args)), data: migrateData(args.home) };
  if (args.command === 'data') return args.action === 'migrate' ? migrateData(args.home) : { data_home: dataHome(args.home) };
  if (args.command === 'uninstall') return args.host === 'claude' ? uninstallClaude(args) : uninstall(args);
  if (args.command === 'authoring') return authoring(args);
  args.project = canonical(args.project);
  if (!fs.existsSync(args.project) || !fs.statSync(args.project).isDirectory()) throw new Error('Project directory does not exist');
  const resolved = resolveSettings(args.project, args.home, args.host);
  const config = resolved.config;
  if (args.command === 'status') return { config, model_selection: resolved.model_selection, active: active(config), project: args.project, data_home: dataHome(args.home), local_root: localRoot(args.project, args.home), preferences: preferenceLocation(args, config) };
  if (args.command === 'preferences') return preferences(args, config);
  if (args.command === 'lessons') return lessons(args, config);
  if (!active(config)) return { active: false, skipped: 'harness disabled' };
  if (args.command === 'doctor') {
    let root = null, committed = null;
    try { root = git(args.project, 'rev-parse', '--show-toplevel'); committed = git(args.project, 'rev-parse', '--verify', 'HEAD^{commit}'); } catch { /* non-repository or unborn HEAD */ }
    return { node: process.versions.node, git_repository: root, git_executable: executable('git'), codex_executable: executable('codex'), claude_executable: executable('claude'), parallel_worktrees: Boolean(committed), host_capabilities: 'Model availability and no-history spawning require live host validation' };
  }
  if (args.command === 'task') {
    if (args.action === 'create') return createTask(args, config);
    if (!config.persistence) return { skipped: 'persistence disabled; use inline packet' };
    if (args.action === 'show') return readJson(safePath(args.project, 'docs/harness/tasks', taskId(args.id) + '.json'));
    const items = packets(args.project); validateGraph(items); return { valid: true, tasks: Object.keys(items).sort() };
  }
  if (args.command === 'worktree') return createWorktree(args, config);
  if (!config.measurement) return { skipped: 'measurement disabled' };
  const output = measurement(readJson(args.input));
  saveNew(safePath(localRoot(args.project, args.home), 'measurements', output.run_id + '.json'), output);
  return output;
}
export function main(argv = process.argv.slice(2)): number {
  if (argv.includes('--help') || argv.includes('-h')) { console.log(HELP); return 0; }
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required');
    const result = execute(parse(argv));
    console.log(JSON.stringify(result, null, 2)); return result.ok === false ? 2 : 0;
  } catch (error: any) {
    console.error('harness: ' + error.message);
    return ['install', 'uninstall', 'authoring'].includes(argv[0]) ? 1 : 2;
  }
}
if (require.main === module) process.exitCode = main();
