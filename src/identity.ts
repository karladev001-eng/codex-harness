import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Json, canonical, dataHome, digest, exists, git, isObject, projectSettings, readJson, rejectSymlink, safePath, taskId } from './lib';
import { Transport, RemoteError, atomic, locked, remote, metadata, commitMessage } from './records';
export function normalizeOrigin(origin: string): string {
  if (typeof origin !== 'string' || /[\x00-\x20\x7f]/.test(origin)) throw new Error('Unsupported Git origin');
  let host: string, repository: string;
  if (/^(https?|ssh|git):\/\//i.test(origin)) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error('Unsupported Git origin'); }
    if (parsed.search || parsed.hash) throw new Error('Unsupported Git origin');
    host = parsed.hostname.toLowerCase();
    if (parsed.port && !(host === 'github.com' && ['22', '443', '9418'].includes(parsed.port))) host += ':' + parsed.port;
    repository = parsed.pathname.replace(/^\/+/, '');
  } else {
    const match = /^(?:[^@/:]+@)?([A-Za-z0-9.-]+):(.+)$/.exec(origin);
    if (!match) throw new Error('Unsupported Git origin');
    host = match[1].toLowerCase(); repository = match[2];
  }
  repository = repository.replace(/\/+$/, '').replace(/\.git$/i, '');
  if (!repository || /[?#%\\]/.test(repository) || repository.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsupported Git origin');
  if (host === 'github.com') repository = repository.toLowerCase();
  return 'git:' + host + '/' + repository;
}
export function projectIdentity(project: string): string | null {
  let origin: string;
  try { origin = git(project, 'remote', 'get-url', 'origin'); } catch { return null; }
  return normalizeOrigin(origin);
}
function registryTarget(config: Json): Json {
  return { hostname: 'github.com', repository: config.preferences.repository.toLowerCase(), branch: config.preferences.branch, path: 'improvement/projects.json' };
}
function validateRegistry(value: any): Json {
  if (!isObject(value) || value.schema_version !== 1 || !Array.isArray(value.projects)) throw new RemoteError('invalid_registry');
  const identities = new Set(), keys = new Set();
  for (const entry of value.projects) {
    if (!isObject(entry) || typeof entry.identity !== 'string' || !(/^(?:git:[A-Za-z0-9.:-]+\/[^\s?#%\\]+|id:[A-Za-z0-9][A-Za-z0-9_-]{0,63})$/.test(entry.identity)) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(entry.project_key) || identities.has(entry.identity) || keys.has(entry.project_key)) throw new RemoteError('registry_conflict');
    identities.add(entry.identity); keys.add(entry.project_key);
  }
  return value;
}
function registryFile(args: Json, config: Json): string {
  return safePath(dataHome(args.home), 'registries', digest(JSON.stringify(registryTarget(config))) + '.json');
}
export function identityStatus(args: Json, config: Json): Json {
  const key = config.preferences.project_key;
  if (key) return { resolved: true, source: 'explicit', project_key: key, identity: 'id:' + key };
  const identity = projectIdentity(args.project);
  if (!identity) return { resolved: false, source: 'unregistered', identity: null, project_key: null };
  const file = registryFile(args, config); rejectSymlink(file, 'Identity cache');
  if (exists(file)) {
    const cached = validateRegistry(readJson(file));
    const entry = cached.projects.find((entry: Json) => entry.identity === identity);
    if (entry) return { resolved: true, source: 'registry-cache', ...entry };
  }
  return { resolved: false, source: 'unregistered', identity, project_key: null };
}
function persistNonGitKey(args: Json, key: string): void {
  // Write beside the common checkout policy, so linked worktrees inherit the ID too.
  const file = projectSettings(args.project)[0] || path.join(canonical(args.project), '.harness.json');
  locked(path.dirname(file), () => {
    rejectSymlink(file, 'Project configuration');
    const value = exists(file) ? readJson(file) : {};
    if (!isObject(value) || (value.preferences !== undefined && !isObject(value.preferences))) throw new Error('Invalid project configuration');
    if (value.preferences?.project_key && value.preferences.project_key !== key) throw new RemoteError('registry_conflict');
    value.preferences = { ...value.preferences, project_key: key };
    atomic(file, JSON.stringify(value, null, 2) + '\n');
  }, '.harness-identity.lock');
}
// Status never calls this function. Read may look up a registry but only a recording/register action creates a row.
export function resolveIdentity(args: Json, config: Json, transport: Transport, register: boolean): Json {
  const explicit = config.preferences.project_key || args.project_key;
  if (explicit) taskId(explicit);
  let gitIdentity: string | null = null;
  try { gitIdentity = projectIdentity(args.project); }
  catch (error) { if (!explicit) throw error; }
  // An explicit portable ID remains usable when a later Git origin is local or
  // otherwise unsupported. It still must agree with the remote registry row.
  let key = explicit || (gitIdentity ? 'git-' + digest(gitIdentity).slice(0, 24) : null);
  if (!key && !register) return { resolved: false, identity: null, project_key: null };
  if (!key) key = 'project-' + crypto.randomUUID();
  if (!gitIdentity && register && !config.preferences.project_key) persistNonGitKey(args, key);
  let identity = gitIdentity || 'id:' + key;
  const target = registryTarget(config), file = registryFile(args, config);
  if (args.offline === 'true') {
    const cached = identityStatus(args, { ...config, preferences: { ...config.preferences, project_key: explicit || '' } });
    if (!cached.resolved) throw new RemoteError('identity_requires_remote_check');
    return cached;
  }
  const operation = metadata(key, 'register', 'project_registry');
  for (let attempt = 0; attempt < 3; attempt++) {
    const fetched = remote(target, transport);
    let registry: Json;
    try { registry = fetched.sha ? validateRegistry(JSON.parse(fetched.content)) : { schema_version: 1, projects: [] }; }
    catch (error) { if (error instanceof RemoteError) throw error; throw new RemoteError('invalid_registry'); }
    if (explicit && registry.projects.some((entry: Json) => entry.project_key === explicit && entry.identity === 'id:' + explicit)) identity = 'id:' + explicit;
    const match = registry.projects.find((entry: Json) => entry.identity === identity);
    if (match && explicit && match.project_key !== explicit) throw new RemoteError('registry_conflict');
    if (match) key = match.project_key;
    if (registry.projects.some((entry: Json) => entry.project_key === key && entry.identity !== identity)) throw new RemoteError('registry_conflict');
    if (!match && register) {
      registry.projects.push({ identity, project_key: key });
      const body: Json = { branch: target.branch, message: commitMessage(operation), content: Buffer.from(JSON.stringify(registry, null, 2) + '\n').toString('base64') };
      if (fetched.sha) body.sha = fetched.sha;
      try {
        const result = transport('PUT', `repos/${target.repository}/contents/${target.path}`, body);
        if (!/^[a-f0-9]{40}$/.test(result?.content?.sha)) throw new RemoteError('invalid_response');
      }
      catch (error) {
        if (error instanceof RemoteError && ['conflict', 'unavailable'].includes(error.kind) && attempt < 2) continue;
        throw error;
      }
    }
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    locked(path.dirname(file), () => atomic(file, JSON.stringify(registry, null, 2) + '\n'), '.registry-cache.lock');
    return { resolved: Boolean(match || register), identity, project_key: key, source: match || register ? 'registry' : 'unregistered' };
  }
  throw new RemoteError('registry_conflict');
}
