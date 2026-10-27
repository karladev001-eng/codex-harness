import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { canonical, equalFiles, exists, inventory, isObject, Json, readJson, rejectSymlink, sourceRoot } from './lib';

export const MARKETPLACE = 'codex-harness';
export const PLUGIN = 'harness@' + MARKETPLACE;
export interface ClaudeArgs { home?: string }
export const claudeHome = (home?: string): string =>
  canonical(home ? path.join(canonical(home), '.claude') : process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'));
// Built next to dist/skill; an installed Codex copy has no marketplace and cannot install for Claude.
export const marketplaceSource = (): string => path.resolve(sourceRoot, '..', 'claude-marketplace');

function cli(args: string[], home?: string): { ok: boolean; command: string; output: string } {
  const env = home ? { ...process.env, CLAUDE_CONFIG_DIR: claudeHome(home) } : process.env;
  const result = spawnSync('claude', args, { encoding: 'utf8', env, timeout: 120000, windowsHide: true, shell: process.platform === 'win32' });
  const command = ['claude', ...args].join(' ');
  if (result.error) return { ok: false, command, output: String(result.error.message) };
  return { ok: result.status === 0, command, output: (result.stdout + result.stderr).trim().slice(-2000) };
}
function register(target: string, update: boolean, home?: string): Json {
  const steps = update
    ? [['plugin', 'marketplace', 'update', MARKETPLACE], ['plugin', 'update', PLUGIN, '--scope', 'user']]
    : [['plugin', 'marketplace', 'add', target, '--scope', 'user'], ['plugin', 'install', PLUGIN, '--scope', 'user']];
  const commands = steps.map(step => ['claude', ...step].join(' '));
  const probe = cli(['--version'], home);
  if (!probe.ok) return { ok: false, reason: 'claude CLI unavailable', run_manually: commands };
  const results = [];
  for (const step of steps) {
    const result = cli(step, home); results.push(result);
    if (!result.ok) return { ok: false, results, run_manually: commands };
  }
  return { ok: true, results };
}
function loadOwned(manifest: string): Json | null {
  rejectSymlink(manifest, 'Claude ownership manifest');
  if (!exists(manifest)) return null;
  const state = readJson(manifest);
  if (!isObject(state) || state.schema_version !== 1 || typeof state.target !== 'string' || !path.isAbsolute(state.target)) throw new Error('Invalid Claude installation manifest');
  if (!equalFiles(inventory(state.target), state.files)) throw new Error('Installed Claude marketplace has user changes; preserve or restore them before update/uninstall');
  return state;
}
export function installClaude(args: ClaudeArgs, source = marketplaceSource()): Json {
  if (!exists(path.join(source, '.claude-plugin/marketplace.json'))) throw new Error('Claude marketplace is not in this package; run install --host claude from a built release package');
  const user = args.home ? canonical(args.home) : os.homedir();
  const manifest = path.join(claudeHome(args.home), 'harness/install.json'), state = loadOwned(manifest);
  const target = state?.target || canonical(path.join(user, '.agents/claude-marketplaces', MARKETPLACE));
  rejectSymlink(target, 'Claude marketplace target');
  if (!state && exists(target)) throw new Error('Unowned Claude marketplace target already exists: ' + target);
  const files = inventory(source);
  if (state && equalFiles(state.files, files)) return { status: 'unchanged', host: 'claude', target };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = fs.mkdtempSync(path.join(path.dirname(target), '.harness-stage-'));
  const staged = path.join(temporary, 'marketplace'), previous = path.join(temporary, 'previous');
  try {
    fs.cpSync(source, staged, { recursive: true });
    if (exists(target)) fs.renameSync(target, previous);
    fs.renameSync(staged, target);
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, JSON.stringify({ schema_version: 1, target, files }, null, 2) + '\n');
  } catch (error) {
    if (exists(previous)) { fs.rmSync(target, { recursive: true, force: true }); fs.renameSync(previous, target); }
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(temporary, { recursive: true, force: true });
  const registration = register(target, Boolean(state), args.home);
  return { ok: registration.ok, status: state ? 'updated' : 'installed', host: 'claude', target, registration };
}
export function uninstallClaude(args: ClaudeArgs): Json {
  const manifest = path.join(claudeHome(args.home), 'harness/install.json'), state = loadOwned(manifest);
  if (!state) return { status: 'not_installed', host: 'claude' };
  const results = [cli(['plugin', 'uninstall', PLUGIN, '--scope', 'user'], args.home), cli(['plugin', 'marketplace', 'remove', MARKETPLACE], args.home)];
  fs.rmSync(state.target, { recursive: true, force: true });
  fs.unlinkSync(manifest);
  return { status: 'uninstalled', host: 'claude', target: state.target, registration: { ok: results.every(result => result.ok), results } };
}
