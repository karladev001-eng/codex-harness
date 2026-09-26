import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export type Json = Record<string, any>;
export const FLAGS = ['delegation', 'review', 'persistence', 'measurement'] as const;
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
export function settings(project: string, home?: string): Json {
  const result = structuredClone(DEFAULTS);
  for (const file of [path.join(codexHome(home), 'harness/settings.json'), path.join(project, '.harness.json')])
    if (fs.existsSync(file)) mergeSettings(result, readJson(file));
  if (result.schema_version !== 1 || result.max_agents < 1) throw new Error('Unsupported schema_version or invalid max_agents');
  for (const role of Object.values(result.models) as Json[])
    if (!role.model.trim() || !['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(role.reasoning_effort)) throw new Error('Invalid model mapping');
  return result;
}
export const active = (config: Json): boolean => config.enabled && FLAGS.some(key => config[key]);
export function taskId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) throw new Error('Task ID must be 1–64 letters, digits, underscores or hyphens');
  return value;
}
export const digest = (data: string | Buffer): string => crypto.createHash('sha256').update(data).digest('hex');
export const localRoot = (project: string, home?: string): string => safePath(codexHome(home), 'harness', 'projects', digest(canonical(project)).slice(0, 20));
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
