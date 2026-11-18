// One-command setup: runs the Codex and Claude Code installs, installs the upstream html-plan
// plugin, records the knowledge repository in personal settings and checks GitHub CLI login.
// Every step reports on its own, so an independent failure never blocks the others.
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { spawnSync } from 'node:child_process';
import {
  DEFAULTS, dataHome, exists, invalidPreferenceTarget, isObject, Json, mergeSettings, migrateData, readJson,
  rejectSymlink,
} from './lib';
import { install } from './install';
import { cli, installClaude } from './claude';

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

/** Checked before any step runs, so invalid input changes nothing. */
function validate(args: SetupArgs): { host: string; htmlPlan: boolean; repository?: string; branch: string } {
  const host = args.host ?? 'all';
  if (!['codex', 'claude', 'all'].includes(host)) throw new Error('Unknown host: expected codex, claude or all');
  if (!['true', 'false'].includes(args.html_plan ?? 'true')) throw new Error('--html-plan must be true or false');
  const repository = args.knowledge_repo;
  const branch = args.knowledge_branch ?? 'main';
  if (repository !== undefined) {
    const target = (repo: string, name: string) => ({ repository: repo, branch: name, project_key: '' });
    if (invalidPreferenceTarget(target(repository, 'main'))) {
      throw new Error('--knowledge-repo must look like OWNER/REPO');
    }
    if (invalidPreferenceTarget(target(repository, branch))) {
      throw new Error('--knowledge-branch must be a branch name without spaces or control characters');
    }
  }
  return { host, htmlPlan: (args.html_plan ?? 'true') === 'true', repository, branch };
}

/** Same as `install` for Codex: the install replaces the runtime that would keep writing the legacy store. */
function codexStep(home?: string): Json {
  return { ...install({ home }), data: migrateData(home) };
}

function htmlPlanStep(home?: string): Json {
  const installed = cli(['plugin', 'list'], home, FULL_OUTPUT);
  if (installed.ok && lists(installed.output, HTML_PLAN)) return { status: 'unchanged' };
  const known = cli(['plugin', 'marketplace', 'list'], home, FULL_OUTPUT);
  const steps = [['plugin', 'install', HTML_PLAN, '--scope', 'user']];
  if (!(known.ok && lists(known.output, COMMUNITY))) steps.unshift(['plugin', 'marketplace', 'add', COMMUNITY_SOURCE]);
  const commands = steps.map(step => ['claude', ...step].join(' '));
  const results = [];
  for (const step of steps) {
    const result = cli(step, home);
    results.push(result);
    if (!result.ok) return { ok: false, status: 'failed', results, run_manually: commands };
  }
  return { status: 'installed', commands };
}

/** Writes through a temporary file in the same directory so a crash never leaves partial settings. */
function writeSettings(file: string, data: Json): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const mode = exists(file) ? fs.statSync(file).mode & 0o777 : null;
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    if (mode !== null) fs.chmodSync(temporary, mode);
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/** Adds preferences.repository/branch/autosave to personal settings, keeping every other key. */
function knowledgeStep(home: string | undefined, repository: string, branch: string): Json {
  const file = path.join(dataHome(home), 'settings.json');
  rejectSymlink(file, 'Personal settings');
  const current = exists(file) ? readJson(file) : {};
  if (!isObject(current)) throw new Error('Personal settings must be a JSON object: ' + file);
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
  // Refuse to write a file the harness itself would reject when it reads its settings.
  mergeSettings(structuredClone(DEFAULTS), next);
  writeSettings(file, next);
  return { status: current.preferences === undefined ? 'configured' : 'updated', file, repository, branch };
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
      steps.push(attempt('claude', () => installClaude({ home: args.home })));
    } else if (host === 'all') {
      steps.push(skipped('claude', missing));
    } else {
      // installClaude would stage files and then report "unchanged" on the next run without registering.
      steps.push({
        name: 'claude',
        ok: false,
        status: 'failed',
        reason: missing,
        run_manually: ['Install Claude Code (https://claude.com/claude-code)', 'codex-harness setup --host claude'],
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
