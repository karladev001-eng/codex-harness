// Shared foundations: storage locations, symlink-safe path handling, layered settings
// resolution, skill inventories and the Git wrapper used by every other module.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export type Json = Record<string, any>;
export const LEGACY_FLAGS = ['delegation', 'review', 'persistence', 'measurement'] as const;
export const FLAGS = [...LEGACY_FLAGS, 'improvement_loop'] as const;
export const sourceRoot = __dirname;
export const DEFAULTS: Json = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'assets/defaults.json'), 'utf8'));

const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const COLLABORATION_MODES = ['codex', 'claude', 'both', 'host', 'peer', 'off'];
const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/;
const PROJECT_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const TASK_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const CONTROL_OR_SPACE = /[\x00-\x20\x7f]/;

const errorCode = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;

export const isObject = (value: unknown): value is Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const exists = (file: string): boolean => {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
};

export const expand = (file: string): string => {
  if (file === '~') return os.homedir();
  if (/^~[/\\]/.test(file)) return os.homedir() + path.sep + file.slice(2);
  return file;
};

// realpath must resolve existing symlink parents even when the last components do not exist.
export function canonical(file: string, depth = 0): string {
  if (depth > 64) throw new Error('Too many symbolic links');
  const expanded = expand(file);
  // Let realpath see '..' after symlinks; lexical path.resolve would change its meaning.
  const absolute = path.isAbsolute(expanded) ? expanded : process.cwd() + path.sep + expanded;
  try {
    return fs.realpathSync.native(absolute);
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(errorCode(error) as string)) throw error;
  }
  if (exists(absolute) && fs.lstatSync(absolute).isSymbolicLink()) {
    const link = fs.readlinkSync(absolute);
    const linked = path.isAbsolute(link) ? link : path.dirname(absolute) + path.sep + link;
    return canonical(linked, depth + 1);
  }
  const parent = path.dirname(absolute);
  if (parent === absolute) return absolute;
  return path.join(canonical(parent, depth + 1), path.basename(absolute));
}

/** True when `file` is strictly inside `root` (the root itself does not count). */
export function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  const leavesRoot = relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);
  return relative !== '' && !leavesRoot;
}

export function safePath(root: string, ...parts: string[]): string {
  root = canonical(root);
  const file = parts.reduce((parent, part) => path.isAbsolute(part) ? part : parent + path.sep + part, root);
  if (!within(root, canonical(file))) throw new Error('Path escapes its storage root: ' + file);
  return file;
}

export function codexHome(home?: string): string {
  const configured = home
    ? path.join(canonical(home), '.codex')
    : process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return canonical(configured);
}

// Data shared by every host (settings, preferences, lessons, sync state). Host-owned
// install manifests and backups stay under each host's own home.
export const SHARED_DATA = ['settings.json', 'projects', 'targets', 'registries'] as const;

export const sharedHome = (home?: string): string => {
  const configured = home
    ? path.join(canonical(home), '.agents', 'harness')
    : process.env.HARNESS_HOME || path.join(os.homedir(), '.agents', 'harness');
  return canonical(configured);
};

export const legacyHome = (home?: string): string => path.join(codexHome(home), 'harness');

// Read-only resolution: until `data migrate` runs, an existing pre-0.5 Codex store stays authoritative.
export function dataHome(home?: string): string {
  const shared = sharedHome(home);
  const legacy = legacyHome(home);
  if (exists(shared)) return shared;
  const legacyHasData = SHARED_DATA.some(name => exists(path.join(legacy, name)));
  return legacyHasData ? legacy : shared;
}

// Copy (never move) so recovery material survives; the staged
// rename makes the shared store appear complete or not at all.
export function migrateData(home?: string): Json {
  const shared = sharedHome(home);
  const legacy = legacyHome(home);
  if (exists(shared)) return { status: 'current', data_home: shared };
  const items = SHARED_DATA.filter(name => exists(path.join(legacy, name)));
  if (!items.length) return { status: 'nothing_to_migrate', data_home: shared };
  for (const name of items) rejectSymlink(path.join(legacy, name), 'Legacy ' + name);
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  const staged = fs.mkdtempSync(path.join(path.dirname(shared), '.harness-migrate-'));
  try {
    for (const name of items) fs.cpSync(path.join(legacy, name), path.join(staged, name), { recursive: true });
    fs.renameSync(staged, shared);
  } catch (error) {
    fs.rmSync(staged, { recursive: true, force: true });
    // A concurrent migration that published first wins; ours is discarded unchanged.
    if (exists(shared)) return { status: 'current', data_home: shared };
    throw error;
  }
  const result: Json = { status: 'migrated', from: legacy, data_home: shared, items, legacy_kept: true };
  // The shared store is already authoritative; a missing marker is informational only.
  try {
    const marker = { migrated_to: shared, migrated_at: new Date().toISOString(), items };
    fs.writeFileSync(path.join(legacy, 'MIGRATED.json'), JSON.stringify(marker, null, 2) + '\n');
  } catch (error) {
    result.warning = 'MIGRATED.json not written: ' + error;
  }
  return result;
}

/** Parses a JSON file. Callers validate the shape of the returned value. */
export function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read JSON ${file}: ${error}`);
  }
}

/** Deep-merges `override` into `base`, accepting only keys and value types that `base` already has. */
export function mergeSettings(base: Json, override: unknown): Json {
  if (!isObject(override)) throw new Error('Configuration must be an object');
  for (const [key, value] of Object.entries(override)) {
    if (!Object.hasOwn(base, key)) throw new Error('Unknown configuration key: ' + key);
    if (isObject(base[key])) {
      mergeSettings(base[key], value);
      continue;
    }
    const wrongType = typeof value !== typeof base[key]
      || (typeof base[key] === 'number' && !Number.isInteger(value));
    if (wrongType) throw new Error('Wrong configuration type: ' + key);
    base[key] = value;
  }
  return base;
}

// Linked worktrees inherit the common checkout's policy, then their own explicit override.
export function projectSettings(project: string): string[] {
  const files: string[] = [];
  let common: string;
  let top: string;
  try {
    common = canonical(git(project, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
    top = canonical(git(project, 'rev-parse', '--show-toplevel'));
  } catch {
    return [path.join(canonical(project), '.harness.json')];
  }
  // Git lists its main locator first. With --separate-git-dir and no
  // core.worktree, that locator can be the metadata directory itself: Git
  // stores no reverse reference to the actual checkout in that configuration.
  const unresolved = () =>
    new Error('Common project settings unresolved; configure core.worktree in the common Git configuration');
  let main: string[];
  try {
    main = git(project, 'worktree', 'list', '--porcelain', '-z').split('\0\0')[0].split('\0');
  } catch {
    throw unresolved();
  }
  if (!main.includes('bare')) {
    let configured: string | null = null;
    try {
      configured = git(project, 'config', '--path', '--get', 'core.worktree');
    } catch { /* unset */ }
    let locator: string | null = null;
    if (configured) locator = canonical(path.resolve(common, configured));
    else if (main[0]?.startsWith('worktree ')) locator = canonical(main[0].slice(9));
    if (!locator) throw unresolved();
    try {
      const locatorIsMainCheckout =
        canonical(git(locator, 'rev-parse', '--show-toplevel')) === locator
        && canonical(git(locator, 'rev-parse', '--path-format=absolute', '--git-common-dir')) === common;
      if (!locatorIsMainCheckout) throw unresolved();
    } catch {
      throw unresolved();
    }
    files.push(path.join(locator, '.harness.json'));
  }
  files.push(path.join(top, '.harness.json'), path.join(project, '.harness.json'));
  return [...new Set(files.map(file => canonical(file)))];
}

// Resolve configuration and model origins together so provenance cannot diverge from values.
export const HOSTS = ['codex', 'claude'] as const;

// Named hosts resolve relative to the running host: itself is `host`, the other is `peer`.
export function collaboration(tasks: Json, host: string): Json {
  const peer = HOSTS.find(name => name !== host)!;
  const relative = (mode: unknown) => mode === host ? 'host' : mode === peer ? 'peer' : mode;
  return {
    host,
    peer,
    tasks: Object.fromEntries(Object.entries(tasks).map(([task, mode]) => [task, relative(mode)])),
  };
}

function validModelMapping(role: Json): boolean {
  return Boolean(role.model.trim()) && REASONING_EFFORTS.includes(role.reasoning_effort);
}

function invalidPreferenceTarget(preferences: Json): boolean {
  if (!preferences.repository && !preferences.project_key) return false;
  return !REPOSITORY_PATTERN.test(preferences.repository)
    || (preferences.project_key && !PROJECT_KEY_PATTERN.test(preferences.project_key))
    || !preferences.branch.trim()
    || CONTROL_OR_SPACE.test(preferences.branch);
}

// `models` is the Codex table for compatibility; other hosts read hosts.<host>.models.
export function resolveSettings(
  project: string,
  home?: string,
  host = 'codex',
): { config: Json; collaboration: Json; model_selection: Json } {
  if (!(HOSTS as readonly string[]).includes(host)) throw new Error('Unknown host: expected ' + HOSTS.join(' or '));
  const result = structuredClone(DEFAULTS);
  const pins: Json = {};
  let explicitLoop = false;
  const layers = [
    ['personal', path.join(dataHome(home), 'settings.json')],
    ...projectSettings(project).map(file => ['project', file]),
  ];
  for (const [source, file] of layers) {
    if (!fs.existsSync(file)) continue;
    const override = readJson(file);
    mergeSettings(result, override);
    // mergeSettings has rejected anything that is not an object.
    const layer = override as Json;
    explicitLoop ||= Object.hasOwn(layer, 'improvement_loop');
    const models = host === 'codex' ? layer.models : layer.hosts?.[host]?.models;
    if (!isObject(models)) continue;
    for (const [role, mapping] of Object.entries(models)) {
      if (isObject(mapping) && Object.hasOwn(mapping, 'model')) pins[role] = { source, path: file };
    }
  }
  // Before 0.4, the four disabled features meant inactive. Preserve that opt-out
  // unless a layer explicitly sets the new feature, including an explicit true.
  if (!explicitLoop && LEGACY_FLAGS.every(key => result[key] === false)) result.improvement_loop = false;
  if (result.schema_version !== 1 || result.max_agents < 1) {
    throw new Error('Unsupported schema_version or invalid max_agents');
  }
  if (!['auto', 'fixed'].includes(result.model_selection)) {
    throw new Error('Invalid model_selection: expected auto or fixed');
  }
  const modelTables = [result.models, ...Object.values<Json>(result.hosts).map(entry => entry.models)];
  for (const role of modelTables.flatMap(Object.values) as Json[]) {
    if (!validModelMapping(role)) throw new Error('Invalid model mapping');
  }
  if (invalidPreferenceTarget(result.preferences)) {
    throw new Error('preferences requires valid repository, branch and project_key');
  }
  for (const [task, mode] of Object.entries(result.collaboration)) {
    if (!COLLABORATION_MODES.includes(mode as string)) {
      throw new Error(`Invalid collaboration.${task}: expected ${COLLABORATION_MODES.join(', ')}`);
    }
  }
  if (host !== 'codex') result.models = result.hosts[host].models;
  delete result.hosts;
  return {
    config: { ...result, host },
    collaboration: collaboration(result.collaboration, host),
    model_selection: {
      mode: result.model_selection,
      resolution: result.model_selection === 'auto' ? 'host-launch' : 'configured',
      catalog_checked: false,
      config_models: 'configured baselines; not dynamically resolved host selections',
      pinned_roles: Object.keys(pins).sort(),
      pins,
    },
  };
}

export function settings(project: string, home?: string, host = 'codex'): Json {
  return resolveSettings(project, home, host).config;
}

export const active = (config: Json): boolean => config.enabled && FLAGS.some(key => config[key]);

export function taskId(value: unknown): string {
  if (typeof value !== 'string' || !TASK_ID_PATTERN.test(value)) {
    throw new Error('Task ID must be 1–64 letters, digits, underscores or hyphens');
  }
  return value;
}

export const digest = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');

export const localRoot = (project: string, home?: string): string =>
  safePath(dataHome(home), 'projects', digest(canonical(project)).slice(0, 20));

/** Writes pretty JSON to a file that must not exist yet. */
export function saveNew(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
}

export function git(project: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', project, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git operation failed');
  return result.stdout.trim();
}

/** Maps every regular file under a skill directory (POSIX-relative path) to its SHA-256. */
export function inventory(root: string): Record<string, string> {
  if (exists(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error('Skill directory must not be a symlink');
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Skill directory missing: ' + root);
  const result: Record<string, string> = {};
  function walk(dir: string, ignored = false) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('Symlink in skill: ' + file);
      const skip = ignored || name === '__pycache__';
      if (stat.isDirectory()) {
        walk(file, skip);
      } else if (stat.isFile()) {
        if (skip) continue;
        const relative = path.relative(root, file).split(path.sep).join('/');
        result[relative] = digest(fs.readFileSync(file));
      } else {
        throw new Error('Unsupported file in skill: ' + file);
      }
    }
  }
  walk(root);
  return result;
}

export function equalFiles(a: unknown, b: unknown): boolean {
  return isObject(a)
    && isObject(b)
    && Object.keys(a).length === Object.keys(b).length
    && Object.entries(a).every(([key, value]) => b[key] === value);
}

export function copySkill(source: string, target: string): void {
  fs.cpSync(source, target, { recursive: true, filter: file => path.basename(file) !== '__pycache__' });
}

export function rejectSymlink(file: string, label: string): void {
  if (exists(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error(label + ' must not be a symlink');
}
