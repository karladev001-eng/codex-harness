import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Json, digest, exists, isObject, localRoot, readJson, rejectSymlink, safePath } from './lib';

export type Transport = (method: string, endpoint: string, body?: Json) => any;
export class RemoteError extends Error {
  constructor(public kind: string) { super('GitHub preferences: ' + kind); }
}
// No shell, credentials, response bodies, or gh stderr enter persistent records.
export const github: Transport = (method, endpoint, body) => {
  const result = spawnSync('gh', ['api', '--hostname', 'github.com', '--method', method,
    '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28',
    endpoint, ...(body ? ['--input', '-'] : [])], {
    input: body ? JSON.stringify(body) : undefined, encoding: 'utf8', windowsHide: true,
    timeout: 30000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const status = /\bHTTP (\d{3})\b/.exec(result.stderr || '')?.[1];
    throw new RemoteError(status === '401' ? 'authentication' : status === '403' ? 'forbidden' :
      status === '404' ? 'not_found_or_inaccessible' : ['409', '422'].includes(status || '') ? 'conflict' : 'unavailable');
  }
  try { return JSON.parse(result.stdout); } catch { throw new RemoteError('invalid_response'); }
};
export function preferenceTarget(config: Json): Json | null {
  const value = config.preferences;
  if (!value.repository && !value.project_key) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value.repository) ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value.project_key) ||
      !value.branch.trim() || /[\x00-\x20\x7f]/.test(value.branch)) throw new Error('preferences requires valid repository, branch and project_key');
  return { hostname: 'github.com', repository: value.repository.toLowerCase(), branch: value.branch,
    path: `improvement/projects/${value.project_key}/preferences.md` };
}
export function preferenceLocation(args: Json, config: Json): Json {
  const target = preferenceTarget(config), root = localRoot(args.project, args.home);
  const retirement_file = safePath(root, 'creative', 'legacy-retired.json');
  return target ? { retirement_file, backend: 'github', target, directory: safePath(root, 'creative', 'github', digest(JSON.stringify(target))),
    legacy_file: safePath(root, 'creative', 'preferences.md') } :
    { retirement_file, backend: 'local', directory: safePath(root, 'creative'), file: safePath(root, 'creative', 'preferences.md') };
}
function atomic(file: string, content: string): void {
  rejectSymlink(file, 'Preferences file');
  const temporary = safePath(path.dirname(file), '.preferences-' + crypto.randomUUID() + '.tmp');
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, content, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    if (process.platform !== 'win32') {
      const directory = fs.openSync(path.dirname(file), 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
  } finally { if (exists(temporary)) fs.unlinkSync(temporary); }
}
function locked<T>(directory: string, action: () => T): T {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = safePath(directory, '.preferences.lock');
  try { fs.mkdirSync(lock); } catch (error: any) {
    if (error.code === 'EEXIST') throw new Error('Preferences locked; do not remove an unknown or stale lock automatically');
    throw error;
  }
  try { return action(); } finally { fs.rmdirSync(lock); }
}
const revision = (sha: string | null, content: string): string => digest(JSON.stringify([sha, content]));
function textInput(file: string): string {
  const data = fs.readFileSync(file);
  if (data.length > 512 * 1024) throw new Error('Preferences must be at most 512 KiB');
  const content = data.toString('utf8');
  if (!Buffer.from(content).equals(data) || content.includes('\0')) throw new Error('Preferences must be UTF-8 text');
  return content;
}
function remote(target: Json, transport: Transport): Json {
  const repo = transport('GET', `repos/${target.repository}`);
  if (repo.private !== true) throw new RemoteError('private_repository_required');
  transport('GET', `repos/${target.repository}/branches/${encodeURIComponent(target.branch)}`);
  try {
    const result = transport('GET', `repos/${target.repository}/contents/${target.path}?ref=${encodeURIComponent(target.branch)}`);
    if (!result || result.type !== 'file' || result.encoding !== 'base64' || !/^[a-f0-9]{40}$/.test(result.sha) || typeof result.content !== 'string') throw new RemoteError('invalid_response');
    const encoded = result.content.replace(/\s/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new RemoteError('invalid_response');
    const bytes = Buffer.from(encoded, 'base64'), content = bytes.toString('utf8');
    if (bytes.toString('base64') !== encoded) throw new RemoteError('invalid_response');
    if (bytes.length > 512 * 1024 || !Buffer.from(content).equals(bytes) || content.includes('\0')) throw new RemoteError('invalid_response');
    return { sha: result.sha, content, fetched_at: new Date().toISOString() };
  } catch (error) {
    if (!(error instanceof RemoteError) || error.kind !== 'not_found_or_inaccessible') throw error;
    // A missing file is only inferred after verifying both private repository and ref.
    const checked = transport('GET', `repos/${target.repository}`);
    if (checked.private !== true) throw new RemoteError('private_repository_required');
    transport('GET', `repos/${target.repository}/branches/${encodeURIComponent(target.branch)}`);
    return { sha: null, content: '', fetched_at: new Date().toISOString() };
  }
}
function validateState(value: any, target: Json): Json {
  if (!isObject(value) || value.schema !== 1 || JSON.stringify(value.target) !== JSON.stringify(target) ||
      (value.cache !== null && (!isObject(value.cache) || typeof value.cache.content !== 'string' ||
      !(value.cache.sha === null || /^[a-f0-9]{40}$/.test(value.cache.sha)) || typeof value.cache.fetched_at !== 'string')) ||
      (value.pending !== null && (!isObject(value.pending) || typeof value.pending.content !== 'string' ||
      !(value.pending.base_sha === null || /^[a-f0-9]{40}$/.test(value.pending.base_sha)))) ||
      typeof value.migrated !== 'boolean' || (value.pending && !value.cache)) throw new Error('Corrupt preferences state; refusing to overwrite');
  return value;
}
function view(state: Json): Json {
  const item = state.pending ? { sha: state.pending.base_sha, content: state.pending.content } : state.cache;
  return item ? { content: item.content, revision: revision(item.sha, item.content), sha: item.sha,
    fetched_at: state.cache.fetched_at, pending: Boolean(state.pending) } : { content: null, revision: null, sha: null, fetched_at: null, pending: false };
}
export function preferences(args: Json, config: Json, transport: Transport = github): Json {
  if (!config.enabled || !config.persistence) return { skipped: !config.enabled ? 'harness disabled' : 'persistence disabled' };
  if (args.offline !== undefined && !['true', 'false'].includes(args.offline)) throw new Error('--offline must be true or false');
  const location = preferenceLocation(args, config), offline = args.offline === 'true';
  return locked(location.directory, () => {
    if (location.backend === 'local') {
      if (exists(location.retirement_file)) throw new Error('Local preferences retired by migration; restore the GitHub preferences configuration and use its current canonical record');
      if (args.action === 'migrate') throw new Error('Configure GitHub preferences before migration');
      rejectSymlink(location.file, 'Preferences file');
      const content = exists(location.file) ? textInput(location.file) : '';
      if (args.action === 'write') {
        if (args.revision !== revision(null, content)) throw new Error('Preferences conflict: reread before writing');
        const updated = textInput(args.input); atomic(location.file, updated);
        return { ok: true, backend: 'local', content: updated, revision: revision(null, updated), pending: false, freshness: 'local' };
      }
      return { ok: true, backend: 'local', content, revision: revision(null, content), pending: false, freshness: 'local' };
    }
    const file = safePath(location.directory, 'state.json'); rejectSymlink(file, 'Preferences state');
    const empty = () => ({ schema: 1, target: location.target, cache: null, pending: null, migrated: false });
    const durable = () => exists(file) ? validateState(readJson(file), location.target) : empty();
    let state = durable();
    const save = () => atomic(file, JSON.stringify(state, null, 2) + '\n');
    const output = (extra: Json = {}) => ({ ok: true, backend: 'github', target: location.target, ...view(state), freshness: offline ? 'cached' : 'fresh', ...extra });
    const failure = (error: any) => {
      // In-memory drafts/acknowledgements are not durable until atomic() has succeeded.
      state = durable();
      return output({ ok: false, freshness: 'stale', error: error instanceof RemoteError ? error.kind : 'local_save_or_transport_failure' });
    };
    const retire = () => {
      rejectSymlink(location.retirement_file, 'Legacy retirement marker');
      if (exists(location.retirement_file)) {
        const marker = readJson(location.retirement_file);
        if (!isObject(marker) || marker.schema !== 1 || marker.retired !== true) throw new Error('Corrupt legacy retirement marker');
        // Retry durability too: a previous rename may have succeeded before fsync failed.
        // Windows FlushFileBuffers requires write access; r+ preserves the marker bytes.
        const fd = fs.openSync(location.retirement_file, 'r+');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        if (process.platform !== 'win32') {
          const directory = fs.openSync(path.dirname(location.retirement_file), 'r');
          try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
        }
        return;
      }
      atomic(location.retirement_file, JSON.stringify({ schema: 1, retired: true,
        target: location.target, retired_at: new Date().toISOString() }, null, 2) + '\n');
    };
    const ensureRetired = () => {
      if (state.migrated) locked(path.dirname(location.legacy_file), retire);
    };
    const sync = (): Json => {
      if (offline) return output({ ok: Boolean(state.cache) && !state.pending, freshness: 'cached',
        ...(!state.cache ? { error: 'no_cache' } : state.pending ? { error: 'pending_offline' } : {}) });
      try {
        // A failed retirement save must be repaired before any migration can transmit.
        ensureRetired();
        const fetched = remote(location.target, transport);
        if (!state.pending) { state.cache = fetched; save(); return output(); }
        if (fetched.content === state.pending.content && fetched.sha !== null) {
          state.cache = fetched; state.pending = null; save(); return output({ acknowledged: true });
        }
        if (fetched.sha !== state.pending.base_sha) return output({ ok: false, freshness: 'stale', error: 'conflict', remote_sha: fetched.sha,
          remote_revision: revision(fetched.sha, fetched.content), remote_content: fetched.content });
        const body: Json = { message: 'Update creative preferences', branch: location.target.branch,
          content: Buffer.from(state.pending.content).toString('base64') };
        if (state.pending.base_sha !== null) body.sha = state.pending.base_sha;
        const result = transport('PUT', `repos/${location.target.repository}/contents/${location.target.path}`, body);
        if (!/^[a-f0-9]{40}$/.test(result?.content?.sha)) throw new RemoteError('invalid_response');
        state.cache = { sha: result.content.sha, content: state.pending.content, fetched_at: new Date().toISOString() };
        state.pending = null; save(); return output();
      } catch (error) { return failure(error); }
    };
    if (args.action === 'read') {
      if (offline) return output({ ok: Boolean(state.cache), freshness: 'cached', ...(state.cache ? {} : { error: 'no_cache' }) });
      if (state.pending) {
        // Read does not transmit drafts or bring replaced/forgotten content into the cache.
        try {
          const fetched = remote(location.target, transport);
          return output({ freshness: 'pending', remote_sha: fetched.sha, remote_revision: revision(fetched.sha, fetched.content),
            ...(fetched.sha !== state.pending.base_sha && fetched.content !== state.pending.content ? { ok: false, error: 'conflict', remote_content: fetched.content } : {}) });
        } catch (error) { return failure(error); }
      }
      return sync();
    }
    if (args.action === 'sync') return sync();
    if (args.action === 'migrate') {
      if (state.migrated) return output({ ok: false, error: 'already_migrated', freshness: 'cached' });
      if (state.pending) throw new Error('Pending update exists; sync or reconcile before migration');
      if (offline) return output({ ok: false, error: 'migration_requires_remote_check', freshness: 'cached' });
      try {
        const rejected = locked(path.dirname(location.legacy_file), () => {
          if (exists(location.retirement_file)) return output({ ok: false, error: 'legacy_retired', freshness: 'cached' });
          rejectSymlink(location.legacy_file, 'Legacy preferences file');
          if (!exists(location.legacy_file)) throw new Error('No local preferences to migrate');
          const content = textInput(location.legacy_file);
          const fetched = remote(location.target, transport);
          if (fetched.sha !== null && fetched.content !== content) return output({ ok: false, error: 'migration_conflict', remote_sha: fetched.sha });
          state.cache = { ...fetched, content }; state.migrated = true;
          if (fetched.sha === null) state.pending = { content, base_sha: null };
          // First protect the draft, then permanently retire the legacy source, then transmit.
          save(); retire();
          return null;
        });
        return rejected || sync();
      } catch (error) { return failure(error); }
    }
    if (args.action !== 'write') throw new Error('Unknown preferences action');
    if (!state.cache) throw new Error('Read a verified remote revision before writing; no cache exists');
    if (args.revision !== view(state).revision) throw new Error('Preferences conflict: reread before writing');
    if (args.base_sha !== undefined && args.base_sha !== 'missing' && !/^[a-f0-9]{40}$/.test(args.base_sha)) throw new Error('--base-sha must be a remote SHA or missing');
    const content = textInput(args.input), base = args.base_sha === undefined ? (state.pending ? state.pending.base_sha : state.cache.sha) : args.base_sha === 'missing' ? null : args.base_sha;
    state.pending = { content, base_sha: base };
    // Replace cached text as well: current corrections/forgetting must not survive in hidden local snapshots.
    state.cache.content = content;
    try { save(); } catch (error) { return failure(error); }
    return sync();
  });
}
