import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export type Json = Record<string, any>;
export const LEGACY_FLAGS = ['delegation', 'review', 'persistence', 'measurement'] as const;
export const FLAGS = [...LEGACY_FLAGS, 'improvement_loop'] as const;
export const sourceRoot = __dirname;
export const DEFAULTS = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'assets/defaults.json'), 'utf8'));
export const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);
export const exists = (file: string): boolean => { try { fs.lstatSync(file); return true; } catch (error: any) { if (error.code === 'ENOENT') return false; throw error; } };
export const expand = (file: string): string => file === '~' ? os.homedir() : /^~[/\\]/.test(file) ? os.homedir() + path.sep + file.slice(2) : file;
// realpath must resolve existing symlink parents even when the last components do not exist.
export function canonical(file: string, depth = 0): string {
  if (depth > 64) throw new Error('Too many symbolic links');
  const expanded = expand(file);
  // Let realpath see '..' after symlinks; lexical path.resolve would change its meaning.
  const absolute = path.isAbsolute(expanded) ? expanded : process.cwd() + path.sep + expanded;
  try { return fs.realpathSync.native(absolute); } catch (error: any) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
  }
  if (exists(absolute) && fs.lstatSync(absolute).isSymbolicLink()) {
    const link = fs.readlinkSync(absolute);
    return canonical(path.isAbsolute(link) ? link : path.dirname(absolute) + path.sep + link, depth + 1);
  }
  const parent = path.dirname(absolute);
  return parent === absolute ? absolute : path.join(canonical(parent, depth + 1), path.basename(absolute));
}
export function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
export function safePath(root: string, ...parts: string[]): string {
  root = canonical(root);
  const file = parts.reduce((parent, part) => path.isAbsolute(part) ? part : parent + path.sep + part, root);
  if (!within(root, canonical(file))) throw new Error('Path escapes its storage root: ' + file);
  return file;
}
export function codexHome(home?: string): string {
  return canonical(home ? path.join(canonical(home), '.codex') : process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
}
// Data shared by every host (settings, preferences, lessons, sync state). Host-owned
// install manifests and backups stay under each host's own home.
export const SHARED_DATA = ['settings.json', 'projects', 'targets', 'registries'] as const;
export const sharedHome = (home?: string): string =>
  canonical(home ? path.join(canonical(home), '.agents', 'harness') : process.env.HARNESS_HOME || path.join(os.homedir(), '.agents', 'harness'));
export const legacyHome = (home?: string): string => path.join(codexHome(home), 'harness');
// Read-only resolution: until `data migrate` runs, an existing pre-0.5 Codex store stays authoritative.
export function dataHome(home?: string): string {
  const shared = sharedHome(home), legacy = legacyHome(home);
  if (exists(shared)) return shared;
  return SHARED_DATA.some(name => exists(path.join(legacy, name))) ? legacy : shared;
}
// Copy (never move) so a not-yet-updated Codex runtime keeps working; the staged
// rename makes the shared store appear complete or not at all.
export function migrateData(home?: string): Json {
  const shared = sharedHome(home), legacy = legacyHome(home);
  if (exists(shared)) return { status: 'current', data_home: shared };
  const items = SHARED_DATA.filter(name => exists(path.join(legacy, name)));
  if (!items.length) return { status: 'nothing_to_migrate', data_home: shared };
  for (const name of items) rejectSymlink(path.join(legacy, name), 'Legacy ' + name);
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  const staged = fs.mkdtempSync(path.join(path.dirname(shared), '.harness-migrate-'));
  try {
    for (const name of items) fs.cpSync(path.join(legacy, name), path.join(staged, name), { recursive: true });
    fs.renameSync(staged, shared);
  } catch (error) { fs.rmSync(staged, { recursive: true, force: true }); throw error; }
  fs.writeFileSync(path.join(legacy, 'MIGRATED.json'), JSON.stringify({ migrated_to: shared, migrated_at: new Date().toISOString(), items }, null, 2) + '\n');
  return { status: 'migrated', from: legacy, data_home: shared, items, legacy_kept: true };
}
export function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new Error(`Cannot read JSON ${file}: ${error}`); }
}
export function mergeSettings(base: Json, override: unknown): Json {
  if (!isObject(override)) throw new Error('Configuration must be an object');
  for (const [key, value] of Object.entries(override)) {
    if (!Object.hasOwn(base, key)) throw new Error('Unknown configuration key: ' + key);
    if (isObject(base[key])) mergeSettings(base[key], value);
    else if (typeof value !== typeof base[key] || (typeof base[key] === 'number' && !Number.isInteger(value)))
      throw new Error('Wrong configuration type: ' + key);
    else base[key] = value;
  }
  return base;
}
// Linked worktrees inherit the common checkout's policy, then their own explicit override.
export function projectSettings(project: string): string[] {
  const files: string[] = [];
  let common: string, top: string;
  try {
    common = canonical(git(project, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
    top = canonical(git(project, 'rev-parse', '--show-toplevel'));
  } catch { return [path.join(canonical(project), '.harness.json')]; }
  // Git lists its main locator first. With --separate-git-dir and no
  // core.worktree, that locator can be the metadata directory itself: Git
  // stores no reverse reference to the actual checkout in that configuration.
  const unresolved = () => new Error('Common project settings unresolved; configure core.worktree in the common Git configuration');
  let main: string[];
  try { main = git(project, 'worktree', 'list', '--porcelain', '-z').split('\0\0')[0].split('\0'); }
  catch { throw unresolved(); }
  if (!main.includes('bare')) {
    let configured: string | null = null;
    try { configured = git(project, 'config', '--path', '--get', 'core.worktree'); } catch { /* unset */ }
    const locator = configured ? canonical(path.resolve(common, configured)) : main[0]?.startsWith('worktree ') ? canonical(main[0].slice(9)) : null;
    if (!locator) throw unresolved();
    try {
      if (canonical(git(locator, 'rev-parse', '--show-toplevel')) !== locator ||
          canonical(git(locator, 'rev-parse', '--path-format=absolute', '--git-common-dir')) !== common) throw unresolved();
    } catch { throw unresolved(); }
    files.push(path.join(locator, '.harness.json'));
  }
  files.push(path.join(top, '.harness.json'), path.join(project, '.harness.json'));
  return [...new Set(files.map(file => canonical(file)))];
}
// Resolve configuration and model origins together so provenance cannot diverge from values.
export const HOSTS = ['codex', 'claude'] as const;
// `models` is the Codex table for compatibility; other hosts read hosts.<host>.models.
export function resolveSettings(project: string, home?: string, host = 'codex'): { config: Json; model_selection: Json } {
  if (!(HOSTS as readonly string[]).includes(host)) throw new Error('Unknown host: expected ' + HOSTS.join(' or '));
  const result = structuredClone(DEFAULTS);
  const pins: Json = {};
  let explicitLoop = false;
  for (const [source, file] of [
    ['personal', path.join(dataHome(home), 'settings.json')],
    ...projectSettings(project).map(file => ['project', file]),
  ]) {
    if (!fs.existsSync(file)) continue;
    const override = readJson(file);
    mergeSettings(result, override);
    explicitLoop ||= Object.hasOwn(override, 'improvement_loop');
    const models = host === 'codex' ? override.models : override.hosts?.[host]?.models;
    if (isObject(models)) for (const [role, mapping] of Object.entries(models))
      if (isObject(mapping) && Object.hasOwn(mapping, 'model')) pins[role] = { source, path: file };
  }
  // Before 0.4, the four disabled features meant inactive. Preserve that opt-out
  // unless a layer explicitly sets the new feature, including an explicit true.
  if (!explicitLoop && LEGACY_FLAGS.every(key => result[key] === false)) result.improvement_loop = false;
  if (result.schema_version !== 1 || result.max_agents < 1) throw new Error('Unsupported schema_version or invalid max_agents');
  if (!['auto', 'fixed'].includes(result.model_selection)) throw new Error('Invalid model_selection: expected auto or fixed');
  for (const role of [result.models, ...Object.values(result.hosts).map((entry: any) => entry.models)].flatMap(Object.values) as Json[])
    if (!role.model.trim() || !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(role.reasoning_effort)) throw new Error('Invalid model mapping');
  const preferences = result.preferences;
  if ((preferences.repository || preferences.project_key) &&
      (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(preferences.repository) ||
       (preferences.project_key && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(preferences.project_key)) ||
       !preferences.branch.trim() || /[\x00-\x20\x7f]/.test(preferences.branch)))
    throw new Error('preferences requires valid repository, branch and project_key');
  if (host !== 'codex') result.models = result.hosts[host].models;
  delete result.hosts;
  return { config: { ...result, host }, model_selection: {
    mode: result.model_selection,
    resolution: result.model_selection === 'auto' ? 'host-launch' : 'configured',
    catalog_checked: false,
    config_models: 'configured baselines; not dynamically resolved host selections',
    pinned_roles: Object.keys(pins).sort(),
    pins,
  } };
}
export function settings(project: string, home?: string, host = 'codex'): Json {
  return resolveSettings(project, home, host).config;
}
export const active = (config: Json): boolean => config.enabled && FLAGS.some(key => config[key]);
export function taskId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error('Task ID must be 1–64 letters, digits, underscores or hyphens');
  return value;
}
export const digest = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');
export const localRoot = (project: string, home?: string): string => safePath(dataHome(home), 'projects', digest(canonical(project)).slice(0, 20));
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
      if (stat.isDirectory()) walk(file, skip);
      else if (stat.isFile()) { if (!skip) result[path.relative(root, file).split(path.sep).join('/')] = digest(fs.readFileSync(file)); }
      else throw new Error('Unsupported file in skill: ' + file);
    }
  }
  walk(root);
  return result;
}
export function equalFiles(a: unknown, b: unknown): boolean {
  return isObject(a) && isObject(b) && Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key] === value);
}
export function copySkill(source: string, target: string): void {
  fs.cpSync(source, target, { recursive: true, filter: file => path.basename(file) !== '__pycache__' });
}
export function rejectSymlink(file: string, label: string): void {
  if (exists(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error(label + ' must not be a symlink');
}
