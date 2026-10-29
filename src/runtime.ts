#!/usr/bin/env node
// CLI entry point: parses arguments against a per-command option table, dispatches to the
// install/authoring/preferences/lessons modules, and owns task packets, worktrees and measurements.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  active, canonical, dataHome, migrateData, git, isObject, Json, localRoot, readJson, safePath, saveNew,
  resolveSettings, taskId, exists,
} from './lib';
import { install, uninstall } from './install';
import { installClaude, uninstallClaude } from './claude';
import { authoring } from './authoring';
import { lessons } from './lessons';
import { preferences, preferenceLocation } from './preferences';

const TASKS_DIRECTORY = ['docs', 'harness', 'tasks'];

/** Task packets keyed by ID. Values are unvalidated file contents; see validateGraph. */
export function packets(project: string): Record<string, unknown> {
  const directory = safePath(project, ...TASKS_DIRECTORY);
  if (!fs.existsSync(directory)) return {};
  const names = fs.readdirSync(directory).filter(name => name.endsWith('.json'));
  const entries = names.map(name => [name.slice(0, -5), readJson(safePath(project, ...TASKS_DIRECTORY, name))]);
  return Object.fromEntries(entries);
}

export function validateGraph(items: Record<string, unknown>): void {
  for (const [key, packet] of Object.entries(items)) {
    taskId(key);
    if (!isObject(packet) || !Array.isArray(packet.dependencies)) {
      throw new Error(`Task ${key} must contain a dependencies list`);
    }
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  function visit(key: string) {
    if (visiting.has(key)) throw new Error('Dependency cycle involving ' + key);
    if (!Object.hasOwn(items, key)) throw new Error('Missing dependency: ' + key);
    if (done.has(key)) return;
    visiting.add(key);
    // Every packet was checked for a dependencies list above.
    for (const dep of (items[key] as Json).dependencies) visit(taskId(dep));
    visiting.delete(key);
    done.add(key);
  }
  for (const key of Object.keys(items)) visit(key);
}

const isProjectRelative = (owned: string): boolean =>
  !path.isAbsolute(owned) && !path.win32.isAbsolute(owned) && !owned.split(/[/\\]/).includes('..');

export function createTask(args: Json, config: Json): Json {
  const key = taskId(args.id);
  if (!args.acceptance.length || !args.scope.length) {
    throw new Error('At least one --acceptance and --scope are required');
  }
  for (const owned of args.scope) {
    if (!isProjectRelative(owned)) throw new Error('Owned paths must be project-relative');
  }
  let revision: string | null = null;
  try {
    revision = git(args.project, 'rev-parse', '--verify', args.base + '^{commit}');
  } catch {
    if (args.base !== 'HEAD') throw new Error('Explicit base cannot be resolved');
  }
  const packet = {
    id: key,
    goal: args.goal,
    non_goals: args.non_goal,
    acceptance_criteria: args.acceptance.map((text: string, i: number) => ({ id: i + 1, text })),
    owned_paths: args.scope,
    dependencies: args.depends_on,
    spec_revision: args.spec_revision,
    code_base_revision: revision,
    constraints: args.constraint,
    source_references: args.reference,
    open_questions: [],
    state: 'planned',
    completion: null,
  };
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
    const packetPath = safePath(args.project, ...TASKS_DIRECTORY, key + '.json');
    if (fs.existsSync(packetPath)) {
      const packet = readJson(packetPath);
      if (!isObject(packet)) throw new Error(`Task ${key} packet must be an object`);
      if (!packet.code_base_revision) throw new Error(`Task ${key} has no recorded code_base_revision`);
      if (packet.code_base_revision !== revision) {
        throw new Error(`Task ${key} code_base_revision does not match requested base`);
      }
    }
  }
  // Harness records and the project settings file may change without blocking a worktree.
  const uncommitted = git(args.project, 'status', '--porcelain', '--', '.',
    ':(top,exclude)docs/harness/**', ':(top,exclude).harness.json');
  if (uncommitted) throw new Error('Checkout has uncommitted changes; checkpoint or use serial work first');
  const directory = safePath(localRoot(args.project, args.home), 'worktrees', key);
  const branch = 'harness/' + key;
  const existingBranch = git(args.project, 'for-each-ref', '--format=%(refname)', 'refs/heads/' + branch);
  if (existingBranch || exists(directory)) throw new Error('Worktree path or branch already exists');
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  git(args.project, 'worktree', 'add', '-b', branch, directory, revision);
  return { path: directory, branch, base_revision: revision };
}

// ISO 8601 date, time, optional fraction and a mandatory zone (Z or an offset).
const ISO_TIMESTAMP = new RegExp([
  String.raw`^(\d{4})-?(\d{2})-?(\d{2})`,
  String.raw`[\s\S](\d{2})(?::?(\d{2}))?(?::?(\d{2}))?`,
  String.raw`(?:[.,](\d+))?`,
  String.raw`(Z|[+-]\d{2}(?::?\d{2})?(?::?\d{2}(?:[.,]\d+)?)?)$`,
].join(''));
const ZONE_OFFSET = /^([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2})(?:[.,](\d+))?)?$/;
const MICROSECONDS_PER_DAY = 86400000000n;

const microseconds = (fraction: string): bigint => BigInt(fraction.slice(0, 6).padEnd(6, '0') || '0');

// Parse calendar timestamps explicitly: Date.parse silently normalizes February 30
// and discards sub-millisecond precision. Preserve Python's microsecond precision.
function isoTimestamp(value: unknown): bigint {
  if (typeof value !== 'string') throw new Error('Invalid timestamp');
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) throw new Error('Invalid timestamp');
  const [, yearText, monthText, dayText, hourText, minuteText = '0', secondText = '0', fraction = '', zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  const yearOutOfRange = year < 1 || year > 9999;
  // Date normalizes overflow (February 30 becomes March 2), so a round trip detects invalid dates.
  const dateNormalized = date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day;
  const timeOutOfRange = hour > 23 || minute > 59 || second > 59;
  if (yearOutOfRange || dateNormalized || timeOutOfRange) throw new Error('Invalid timestamp');
  let offset = 0n;
  if (zone !== 'Z') {
    const parts = ZONE_OFFSET.exec(zone)!;
    const seconds = Number(parts[2]) * 3600 + Number(parts[3] || 0) * 60 + Number(parts[4] || 0);
    offset = BigInt(seconds) * 1000000n + microseconds(parts[5] || '');
    if (offset >= MICROSECONDS_PER_DAY) throw new Error('Invalid timestamp offset');
    if (parts[1] === '-') offset = -offset;
  }
  return BigInt(date.getTime()) * 1000n + microseconds(fraction) - offset;
}

const MEASUREMENT_OPTIONAL_FIELDS = [
  'model_roles', 'corrections', 'completion', 'defects', 'usage_before', 'usage_after',
  'window_before', 'window_after', 'overlap',
];

const invalidUsage = (value: unknown): boolean =>
  value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100);

const missingWindow = (value: unknown): boolean =>
  !value || (Array.isArray(value) && !value.length) || (isObject(value) && !Object.keys(value).length);

export function measurement(data: unknown): Json {
  if (!isObject(data)) throw new Error('Measurement must be an object');
  for (const key of ['task_id', 'run_id']) taskId(data[key] ?? '');
  if (!['baseline', 'harness'].includes(data.condition)) throw new Error('condition must be baseline or harness');
  let start: bigint;
  let end: bigint;
  try {
    start = isoTimestamp(data.start);
    end = isoTimestamp(data.end);
    if (end < start) throw new Error('Invalid time order');
  } catch {
    throw new Error('start/end must be ordered ISO timestamps with timezone');
  }
  const result: Json = { ...data, elapsed_seconds: Number(end - start) / 1e6 };
  for (const key of MEASUREMENT_OPTIONAL_FIELDS) {
    if (!Object.hasOwn(result, key)) result[key] = null;
  }
  const before = result.usage_before;
  const after = result.usage_after;
  for (const value of [before, after]) {
    if (invalidUsage(value)) throw new Error('usage must be percent consumed between 0 and 100');
  }
  const reasons: string[] = [];
  if (before === null || after === null) reasons.push('missing usage');
  if (missingWindow(result.window_before) || !isDeepStrictEqual(result.window_before, result.window_after)) {
    reasons.push('missing or changed reset window');
  }
  if (result.overlap !== false) reasons.push('overlap present or unknown');
  if (before !== null && after !== null && after < before) reasons.push('usage decreased');
  return {
    ...result,
    comparable: !reasons.length,
    exclusion_reasons: reasons,
    account_usage_delta: reasons.length ? null : after - before,
  };
}

const HELP = [
  'Codex Harness (Node.js 22+)',
  '',
  'Commands:',
  '  status|doctor [--project PATH] [--home PATH] [--host codex|claude]',
  '  install [--home PATH] [--skills-dir PARENT] [--host codex|claude]',
  '  uninstall [--home PATH] [--host codex|claude]',
  '  data where|migrate [--home PATH]',
  '  task create --id ID --goal TEXT --acceptance TEXT --scope PATH [--base HEAD]',
  '    [--depends-on ID] [--non-goal TEXT] [--constraint TEXT] [--reference TEXT] [--spec-revision 1]',
  '  task show --id ID | task validate',
  '  worktree create --id ID --base COMMIT',
  '  measure record --input FILE',
  '  preferences register|read|sync|migrate [--offline true]',
  '  preferences sync-all [--project PATH] [--home PATH]',
  '  preferences write --input FILE --revision TOKEN [--offline true] [--base-sha SHA|missing]'
    + ' [--kind create|update|correction|forget]',
  '  lessons read|sync --id ID [--offline true]',
  '  lessons write --input FILE --revision TOKEN [--kind create|update|correction]',
  '  lessons forget --id ID --revision TOKEN',
  '  lessons search [--query TEXT] [--limit 1..10]',
  '  authoring install|uninstall [--project PATH] [--skills-dir PARENT] [--skill NAME]',
  '',
  'Runtime task/worktree/measure/preferences commands accept --project and --home.',
  'Repeat --acceptance, --scope, --depends-on, --non-goal, --constraint, --reference, --skill.',
  'Settings: improvement_loop (boolean, default true), model_selection (auto|fixed, default auto).',
  'Shared data lives in $HARNESS_HOME or ~/.agents/harness; data migrate copies a pre-0.5 ~/.codex/harness store.',
  'Status is read-only; auto models are resolved by the agent from the live host launch catalog.',
  'Authoring defaults to five skills in PROJECT/.agents/skills; it never activates orchestration.',
  'Optional codex-slide-plan requires --skill codex-slide-plan from a supporting release package.',
  'Unspecified authoring install/uninstall leaves optional skills untouched.',
  '',
].join('\n');

/** Commands whose second word is an action, e.g. `task create`. */
const NESTED_COMMANDS = ['task', 'worktree', 'measure', 'authoring', 'preferences', 'lessons', 'data'];
const COMMON = ['project', 'home'];

interface CommandSpec {
  /** Accepted `--option` names. */
  options: string[];
  /** Options that must be present, checked in this order. */
  required?: string[];
}

const COMMANDS: Record<string, CommandSpec> = {
  'status': { options: [...COMMON, 'host'] },
  'doctor': { options: [...COMMON, 'host'] },
  'install': { options: ['home', 'skills-dir', 'host'] },
  'uninstall': { options: ['home', 'host'] },
  'data where': { options: ['home'] },
  'data migrate': { options: ['home'] },
  'task create': {
    options: [
      ...COMMON, 'id', 'goal', 'acceptance', 'scope', 'depends-on', 'non-goal', 'constraint', 'reference',
      'spec-revision', 'base',
    ],
    required: ['id', 'goal'],
  },
  'task show': { options: [...COMMON, 'id'], required: ['id'] },
  'task validate': { options: COMMON },
  'worktree create': { options: [...COMMON, 'id', 'base'], required: ['id', 'base'] },
  'preferences register': { options: [...COMMON, 'project-key'] },
  'preferences sync-all': { options: COMMON },
  'preferences read': { options: [...COMMON, 'offline'] },
  'preferences sync': { options: [...COMMON, 'offline'] },
  'preferences migrate': { options: [...COMMON, 'offline'] },
  'preferences write': {
    options: [...COMMON, 'input', 'revision', 'offline', 'base-sha', 'kind'],
    required: ['input', 'revision'],
  },
  'lessons read': { options: [...COMMON, 'id', 'offline'], required: ['id'] },
  'lessons sync': { options: [...COMMON, 'id', 'offline'], required: ['id'] },
  'lessons write': {
    options: [...COMMON, 'input', 'revision', 'offline', 'base-sha', 'kind'],
    required: ['input', 'revision'],
  },
  'lessons forget': { options: [...COMMON, 'id', 'revision', 'offline', 'base-sha'], required: ['id', 'revision'] },
  'lessons search': { options: [...COMMON, 'query', 'limit', 'offline'] },
  'measure record': { options: [...COMMON, 'input'], required: ['input'] },
  'authoring install': { options: ['project', 'skills-dir', 'skill'] },
  'authoring uninstall': { options: ['project', 'skills-dir', 'skill'] },
};

/** Parses `--name value` or `--name=value`; array-valued defaults collect repeated options. */
function parse(argv: string[]): Json {
  const [command, ...rest] = argv;
  const args: Json = {
    command,
    project: '.',
    acceptance: [],
    scope: [],
    depends_on: [],
    non_goal: [],
    constraint: [],
    reference: [],
    skill: [],
    spec_revision: '1',
    base: 'HEAD',
  };
  const nested = NESTED_COMMANDS.includes(command);
  if (nested) args.action = rest.shift();
  const key = command + (nested ? ' ' + args.action : '');
  if (!Object.hasOwn(COMMANDS, key)) throw new Error('Unknown or missing command; use --help');
  const spec = COMMANDS[key];
  const provided = new Set<string>();
  while (rest.length) {
    const token = rest.shift()!;
    const match = /^--([^=]+)(?:=(.*))?$/.exec(token);
    if (!match || !spec.options.includes(match[1])) throw new Error('Unknown argument: ' + token);
    const [, name, inlineValue] = match;
    const value = inlineValue ?? rest.shift();
    // A separate value must not look like the next option.
    const missingValue = value === undefined || (inlineValue === undefined && value.startsWith('--'));
    if (missingValue) throw new Error('Missing value: ' + token);
    const option = name.replaceAll('-', '_');
    provided.add(option);
    if (Array.isArray(args[option])) args[option].push(value);
    else args[option] = value;
  }
  for (const option of spec.required || []) {
    if (!provided.has(option)) throw new Error('Missing required --' + option);
  }
  return args;
}

function executable(name: string): string | null {
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of extensions) {
      const file = path.join(dir, name + ext);
      try {
        fs.accessSync(file, fs.constants.X_OK);
        if (fs.statSync(file).isFile()) return file;
      } catch { /* continue */ }
    }
  }
  return null;
}

function doctor(project: string): Json {
  let root = null;
  let committed = null;
  try {
    root = git(project, 'rev-parse', '--show-toplevel');
    committed = git(project, 'rev-parse', '--verify', 'HEAD^{commit}');
  } catch { /* non-repository or unborn HEAD */ }
  return {
    node: process.versions.node,
    git_repository: root,
    git_executable: executable('git'),
    codex_executable: executable('codex'),
    claude_executable: executable('claude'),
    parallel_worktrees: Boolean(committed),
    host_capabilities: 'Model availability and no-history spawning require live host validation',
  };
}

export function execute(args: Json): Json {
  const isInstallCommand = ['install', 'uninstall'].includes(args.command);
  if (isInstallCommand && args.host !== undefined && !['codex', 'claude'].includes(args.host)) {
    throw new Error('Unknown host: expected codex or claude');
  }
  // Only the Codex install migrates: it replaces the Codex runtime that would otherwise keep writing the legacy store.
  if (args.command === 'install') {
    return args.host === 'claude' ? installClaude(args) : { ...install(args), data: migrateData(args.home) };
  }
  if (args.command === 'data') {
    return args.action === 'migrate' ? migrateData(args.home) : { data_home: dataHome(args.home) };
  }
  if (args.command === 'uninstall') return args.host === 'claude' ? uninstallClaude(args) : uninstall(args);
  if (args.command === 'authoring') return authoring(args);

  args.project = canonical(args.project);
  if (!fs.existsSync(args.project) || !fs.statSync(args.project).isDirectory()) {
    throw new Error('Project directory does not exist');
  }
  const resolved = resolveSettings(args.project, args.home, args.host);
  const config = resolved.config;
  if (args.command === 'status') {
    return {
      config,
      model_selection: resolved.model_selection,
      active: active(config),
      collaboration: resolved.collaboration,
      project: args.project,
      data_home: dataHome(args.home),
      local_root: localRoot(args.project, args.home),
      preferences: preferenceLocation(args, config),
    };
  }
  if (args.command === 'preferences') return preferences(args, config);
  if (args.command === 'lessons') return lessons(args, config);

  if (!active(config)) return { active: false, skipped: 'harness disabled' };
  if (args.command === 'doctor') return doctor(args.project);
  if (args.command === 'task') {
    if (args.action === 'create') return createTask(args, config);
    if (!config.persistence) return { skipped: 'persistence disabled; use inline packet' };
    if (args.action === 'show') {
      return readJson(safePath(args.project, 'docs/harness/tasks', taskId(args.id) + '.json')) as Json;
    }
    const items = packets(args.project);
    validateGraph(items);
    return { valid: true, tasks: Object.keys(items).sort() };
  }
  if (args.command === 'worktree') return createWorktree(args, config);

  if (!config.measurement) return { skipped: 'measurement disabled' };
  const output = measurement(readJson(args.input));
  saveNew(safePath(localRoot(args.project, args.home), 'measurements', output.run_id + '.json'), output);
  return output;
}

export function main(argv = process.argv.slice(2)): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required');
    const result = execute(parse(argv));
    console.log(JSON.stringify(result, null, 2));
    return result.ok === false ? 2 : 0;
  } catch (error) {
    console.error('harness: ' + (error as Error).message);
    return ['install', 'uninstall', 'authoring'].includes(argv[0]) ? 1 : 2;
  }
}

if (require.main === module) process.exitCode = main();
