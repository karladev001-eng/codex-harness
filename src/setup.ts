// One-command setup: runs the Codex and Claude Code installs, installs the upstream html-plan
// plugin, records the knowledge repository in personal settings and checks GitHub CLI login.
// Every step reports on its own, so an independent failure never blocks the others.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import {
  DEFAULTS, REPOSITORY_PATTERN, dataHome, exists, invalidPreferenceTarget, isObject, Json, mergeSettings,
  migrateData, readJson, rejectSymlink, validateSettings,
} from './lib';
import { install } from './install';
import { cli, installClaude, MARKETPLACE, PLUGIN } from './claude';

export interface SetupArgs {
  home?: string;
  host?: string;
  knowledge_repo?: string;
  knowledge_branch?: string;
  html_plan?: string;
}

const HTML_PLAN = 'html-plan@claude-community';
const COMMUNITY = 'claude-community';
const COMMUNITY_SOURCE = 'anthropics/claude-plugins-community';
const GH_LOGIN = 'gh auth login --hostname github.com';
// `plugin list` output can be long; do not let the default truncation hide the entry being searched for.
const FULL_OUTPUT = 1_000_000;

/** True when `name` appears as a whole token, so `my-html-plan@x` does not match `html-plan@x`. */
const lists = (output: string, name: string): boolean =>
  new RegExp(`(^|[^\\w@.-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.-])`, 'm').test(output);

/** Runs one step; a thrown error becomes a failed step instead of aborting the others. */
function attempt(name: string, work: () => Json): Json {
  try {
    const { ok, ...result } = work();
    return { name, ok: ok !== false, ...result };
  } catch (error) {
    return { name, ok: false, status: 'failed', error: (error as Error).message };
  }
}

const skipped = (name: string, reason: string): Json => ({ name, ok: true, status: 'skipped', reason });

const invalidBranch = (branch: string): boolean =>
  invalidPreferenceTarget({ repository: 'owner/repo', branch, project_key: '' });

/** Checked before any step runs, so invalid input changes nothing. */
function validate(args: SetupArgs): { host: string; htmlPlan: boolean; repository?: string; branch: string } {
  const host = args.host ?? 'all';
  if (!['codex', 'claude', 'all'].includes(host)) throw new Error('Unknown host: expected codex, claude or all');
  if (!['true', 'false'].includes(args.html_plan ?? 'true')) throw new Error('--html-plan must be true or false');
  const repository = args.knowledge_repo;
  const branch = args.knowledge_branch ?? 'main';
  // invalidPreferenceTarget accepts an empty repository, so the pattern is checked directly.
  if (repository !== undefined && !REPOSITORY_PATTERN.test(repository)) {
    throw new Error('--knowledge-repo must look like OWNER/REPO');
  }
  if (invalidBranch(branch)) {
    throw new Error('--knowledge-branch must be a branch name without spaces or control characters');
  }
  if (repository === undefined && args.knowledge_branch !== undefined) {
    throw new Error('--knowledge-branch requires --knowledge-repo');
  }
  return { host, htmlPlan: (args.html_plan ?? 'true') === 'true', repository, branch };
}

/** Same as `install` for Codex: the install replaces the runtime that would keep writing the legacy store. */
function codexStep(home?: string): Json {
  return { ...install({ home }), data: migrateData(home) };
}

interface Installed { version?: string; enabled: boolean }

/**
 * Finds `id` at user scope in `plugin list --json` (stdout only, so stderr warnings cannot break the parse).
 * Only when that command fails or prints something that is not a JSON array is the plain `plugin list` text
 * matched instead; the text shows neither scope, enabled state nor version.
 */
function findPlugin(home: string | undefined, id: string): Installed | null {
  const listed = cli(['plugin', 'list', '--json'], home, FULL_OUTPUT);
  let entries: unknown = null;
  try {
    entries = listed.ok ? JSON.parse(listed.stdout) : null;
  } catch { /* not JSON */ }
  if (Array.isArray(entries)) {
    const entry = entries.find(item => isObject(item) && item.id === id && item.scope === 'user');
    if (!entry) return null;
    return { version: typeof entry.version === 'string' ? entry.version : undefined, enabled: entry.enabled !== false };
  }
  const text = cli(['plugin', 'list'], home, FULL_OUTPUT);
  return text.ok && lists(text.output, id) ? { enabled: true } : null;
}

interface MarketplaceRef { name: string; add: string[] }

/** Runs the commands in order, stopping at the first failure, which is reported with all of them. */
function runCommands(home: string | undefined, steps: string[][], done: string): Json {
  const commands = steps.map(step => ['claude', ...step].join(' '));
  const results = [];
  for (const step of steps) {
    const result = cli(step, home);
    results.push(result);
    if (!result.ok) return { ok: false, status: 'failed', results, run_manually: commands };
  }
  return { status: done, commands };
}

/** Installs `plugin` at user scope; adds its marketplace first when it is not registered. */
function installPlugin(home: string | undefined, plugin: string, marketplace: MarketplaceRef): Json {
  const known = cli(['plugin', 'marketplace', 'list'], home, FULL_OUTPUT);
  const steps = [['plugin', 'install', plugin, '--scope', 'user']];
  if (!(known.ok && lists(known.output, marketplace.name))) {
    steps.unshift(['plugin', 'marketplace', 'add', ...marketplace.add]);
  }
  return runCommands(home, steps, 'installed');
}

/**
 * An entry that is present counts as installed whether or not it is enabled: `claude plugin install` on a
 * disabled plugin exits 0 and enables it again (observed on Claude Code 2.1.319), which would undo the
 * user's choice on every run. A disabled entry is reported with the command to enable it.
 */
const presence = (id: string, found: Installed): Json => found.enabled
  ? { status: 'unchanged' }
  : { status: 'unchanged', enabled: false, hint: `claude plugin enable ${id} --scope user` };

function ensurePlugin(home: string | undefined, plugin: string, marketplace: MarketplaceRef): Json {
  const found = findPlugin(home, plugin);
  return found ? presence(plugin, found) : installPlugin(home, plugin, marketplace);
}

const htmlPlanStep = (home?: string): Json =>
  ensurePlugin(home, HTML_PLAN, { name: COMMUNITY, add: [COMMUNITY_SOURCE] });

/** The version staged from this package, which the installed plugin must match. */
function bundledVersion(target: string): string | undefined {
  try {
    const manifest = readJson(path.join(target, 'plugins/harness/.claude-plugin/plugin.json'));
    return isObject(manifest) && typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

function claudeStep(home?: string): Json {
  const result = installClaude({ home });
  const manual = result.registration?.run_manually;
  if (manual) return { ...result, run_manually: manual };
  if (result.status !== 'unchanged') return result;
  // installClaude reports `unchanged` without registering or updating, because it records the new files before
  // it registers; a run whose registration or update failed would look healthy. Compare with what Claude holds.
  const marketplace = { name: MARKETPLACE, add: [result.target, '--scope', 'user'] };
  const found = findPlugin(home, PLUGIN);
  if (!found) {
    const repaired = installPlugin(home, PLUGIN, marketplace);
    return { ...result, ...repaired, status: repaired.status === 'installed' ? 'registered' : repaired.status };
  }
  if (!found.enabled) return { ...result, ...presence(PLUGIN, found) };
  const wanted = bundledVersion(result.target);
  if (!wanted || !found.version || found.version === wanted) return result;
  const updated = runCommands(home, [['plugin', 'marketplace', 'update', MARKETPLACE],
    ['plugin', 'update', PLUGIN, '--scope', 'user']], 'updated');
  return { ...result, ...updated };
}

/**
 * Writes through a temporary file in the same directory so a crash never leaves partial settings. The file ends
 * with the destination's exact mode (0o600 when new), whatever the umask. `snapshot` is the content the new data was derived from: just
 * before the rename the destination is read again and, if it changed, nothing is written and false is returned.
 * This narrows the race with another writer but does not eliminate it: a change between that read and the
 * rename is lost, so concurrent setup runs editing the same settings are not supported.
 */
export function writeSettings(file: string, data: Json, snapshot: Buffer | null): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = snapshot ? fs.statSync(file).mode & 0o777 : 0o600;
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    // Created owner-only so the content is never readable more widely than the final file; then set the exact
    // mode (the umask would otherwise alter it) before the file becomes visible.
    fs.chmodSync(temporary, mode);
    const current = exists(file) ? fs.readFileSync(file) : null;
    const changed = snapshot ? !current?.equals(snapshot) : current !== null;
    if (changed) {
      fs.rmSync(temporary, { force: true });
      return false;
    }
    fs.renameSync(temporary, file);
    return true;
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/** Adds preferences.repository/branch/autosave to personal settings, keeping every other key. */
function knowledgeStep(home: string | undefined, repository: string, branch: string): Json {
  const file = path.join(dataHome(home), 'settings.json');
  rejectSymlink(file, 'Personal settings');
  const snapshot = exists(file) ? fs.readFileSync(file) : null;
  const current = snapshot ? parseSettings(snapshot, file) : {};
  if (current.preferences !== undefined && !isObject(current.preferences)) {
    throw new Error('Personal settings "preferences" must be an object: ' + file);
  }
  const existing: Json = current.preferences ?? {};
  const differs = (have: unknown, want: string) => typeof have === 'string' && have !== '' && have !== want;
  if (differs(existing.repository, repository) || differs(existing.branch, branch)) {
    return {
      ok: false,
      status: 'conflict',
      file,
      existing: { repository: existing.repository, branch: existing.branch },
      requested: { repository, branch },
      error: 'Personal settings already name a different knowledge repository or branch; nothing was changed',
      run_manually: [`Edit preferences.repository/branch in ${file}, or rerun setup with the configured values`],
    };
  }
  const next = { ...current, preferences: { ...existing, repository, branch, autosave: true } };
  if (isDeepStrictEqual(current, next)) return { status: 'unchanged', file };
  // Refuse to write a file the harness itself would reject when it reads its settings: key and type checks
  // (mergeSettings) plus the value checks the runtime applies after merging.
  validateSettings(mergeSettings(structuredClone(DEFAULTS), next));
  if (!writeSettings(file, next, snapshot)) {
    return {
      ok: false,
      status: 'conflict',
      file,
      error: 'Personal settings changed while setup was running; nothing was written',
      run_manually: ['Rerun setup'],
    };
  }
  return { status: current.preferences === undefined ? 'configured' : 'updated', file, repository, branch };
}

function parseSettings(bytes: Buffer, file: string): Json {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Cannot read JSON ${file}: ${error}`);
  }
  if (!isObject(value)) throw new Error('Personal settings must be a JSON object: ' + file);
  return value;
}

/** Only checks the login; logging in is left to the user, and no token is read or written. */
function ghStep(): Json {
  const result = spawnSync('gh', ['auth', 'status', '--hostname', 'github.com'], {
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    shell: process.platform === 'win32',
  });
  if (!result.error && result.status === 0) return { status: 'authenticated' };
  const reason = result.error ? 'gh CLI unavailable; install it first' : 'not logged in to github.com';
  return { ok: false, status: 'not_authenticated', reason, run_manually: [GH_LOGIN] };
}

export function setup(args: SetupArgs, doctor: () => Json): Json {
  const { host, htmlPlan, repository, branch } = validate(args);
  const steps: Json[] = [];
  if (host !== 'claude') steps.push(attempt('codex', () => codexStep(args.home)));
  if (host !== 'codex') {
    const available = cli(['--version'], args.home).ok;
    const missing = 'claude CLI not found; install Claude Code, then rerun setup';
    if (available) {
      steps.push(attempt('claude', () => claudeStep(args.home)));
    } else if (host === 'all') {
      steps.push(skipped('claude', missing));
    } else {
      // installClaude would stage files and then report "unchanged" on the next run without registering.
      steps.push({
        name: 'claude',
        ok: false,
        status: 'failed',
        reason: missing,
        // `codex-harness` may not be on PATH when setup was started through npx, so no command line is suggested.
        run_manually: ['Install Claude Code (https://claude.com/claude-code)', 'Rerun the same setup command'],
      });
    }
    if (!htmlPlan) steps.push(skipped('html-plan', '--html-plan false'));
    else if (!available) steps.push(skipped('html-plan', missing));
    else steps.push(attempt('html-plan', () => htmlPlanStep(args.home)));
  }
  if (repository !== undefined) {
    steps.push(attempt('knowledge', () => knowledgeStep(args.home, repository, branch)));
    steps.push(attempt('gh', ghStep));
  }
  steps.push(attempt('doctor', () => ({ status: 'checked', ...doctor() })));
  const manual = steps.flatMap(step => step.run_manually ?? []);
  return { ok: steps.every(step => step.ok), steps, ...(manual.length ? { run_manually: manual } : {}) };
}
