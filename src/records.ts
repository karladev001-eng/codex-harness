// Record storage primitives shared by preferences, lessons and identity: the GitHub
// transport, atomic writes, directory locks, remote file decoding and the local target index.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Json, dataHome, digest, exists, isObject, readJson, rejectSymlink, safePath, canonical } from './lib';

/** Performs one GitHub REST call and returns the parsed, still unvalidated response body. */
export type Transport = (method: string, endpoint: string, body?: Json) => unknown;

export class RemoteError extends Error {
  constructor(public kind: string) { super('GitHub preferences: ' + kind); }
}

const MAX_RECORD_BYTES = 512 * 1024;
const GIT_SHA = /^[a-f0-9]{40}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const OPERATION_KINDS = ['create', 'update', 'correction', 'forget', 'migrate', 'register'];

function remoteErrorKind(httpStatus: string | undefined): string {
  if (httpStatus === '401') return 'authentication';
  if (httpStatus === '403') return 'forbidden';
  if (httpStatus === '404') return 'not_found_or_inaccessible';
  if (httpStatus === '409' || httpStatus === '422') return 'conflict';
  return 'unavailable';
}

// Neither credentials nor raw stderr/response bodies are persisted.
export const github: Transport = (method, endpoint, body) => {
  const args = [
    'api', '--hostname', 'github.com', '--method', method,
    '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', endpoint,
    ...(body ? ['--input', '-'] : []),
  ];
  const result = spawnSync('gh', args, {
    input: body ? JSON.stringify(body) : undefined,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const status = /\bHTTP (\d{3})\b/.exec(result.stderr || '')?.[1];
    throw new RemoteError(remoteErrorKind(status));
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new RemoteError('invalid_response');
  }
};

/** Opens `file` with `flags`, fsyncs it and closes it again. */
function fsyncPath(file: string, flags: string): void {
  const fd = fs.openSync(file, flags);
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Replaces `file` via a synced temporary file and rename, then syncs the directory where supported. */
export function atomic(file: string, content: string): void {
  rejectSymlink(file, 'Record file');
  const temporary = safePath(path.dirname(file), '.preferences-' + crypto.randomUUID() + '.tmp');
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
    if (process.platform !== 'win32') fsyncPath(path.dirname(file), 'r');
  } finally {
    if (exists(temporary)) fs.unlinkSync(temporary);
  }
}

/** Runs `action` while holding a lock directory; a held lock fails immediately instead of waiting. */
export function locked<T>(directory: string, action: () => T, name = '.preferences.lock'): T {
  rejectSymlink(directory, 'Record directory');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = safePath(directory, name);
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Preferences locked; do not remove an unknown or stale lock automatically');
    }
    throw error;
  }
  try {
    return action();
  } finally {
    fs.rmdirSync(lock);
  }
}

export function textInput(file: string): string {
  const data = fs.readFileSync(file);
  if (data.length > MAX_RECORD_BYTES) throw new Error('Preferences must be at most 512 KiB');
  const content = data.toString('utf8');
  const lossless = Buffer.from(content).equals(data);
  if (!lossless || content.includes('\0')) throw new Error('Preferences must be UTF-8 text');
  return content;
}

/** Refuses non-private repositories and confirms that the target branch exists. */
export function privateRef(target: Json, transport: Transport): void {
  const repository = transport('GET', `repos/${target.repository}`) as Json;
  if (repository.private !== true) throw new RemoteError('private_repository_required');
  transport('GET', `repos/${target.repository}/branches/${encodeURIComponent(target.branch)}`);
}

/** Validates a GitHub contents response and decodes it to strict UTF-8 text. */
export function decodeRemote(result: unknown): Json {
  const wellFormed = isObject(result)
    && result.type === 'file'
    && result.encoding === 'base64'
    && GIT_SHA.test(result.sha)
    && typeof result.content === 'string';
  if (!wellFormed) throw new RemoteError('invalid_response');
  const encoded = result.content.replace(/\s/g, '');
  if (!BASE64.test(encoded)) throw new RemoteError('invalid_response');
  const bytes = Buffer.from(encoded, 'base64');
  const content = bytes.toString('utf8');
  const canonicalBase64 = bytes.toString('base64') === encoded;
  const validText = bytes.length <= MAX_RECORD_BYTES && Buffer.from(content).equals(bytes) && !content.includes('\0');
  if (!canonicalBase64 || !validText) throw new RemoteError('invalid_response');
  return { sha: result.sha, content, fetched_at: new Date().toISOString() };
}

/** Fetches a remote record; a missing file is reported as `sha: null` once the repository is rechecked. */
export function remote(target: Json, transport: Transport): Json {
  privateRef(target, transport);
  const endpoint = `repos/${target.repository}/contents/${target.path}?ref=${encodeURIComponent(target.branch)}`;
  try {
    return decodeRemote(transport('GET', endpoint));
  } catch (error) {
    if (!(error instanceof RemoteError) || error.kind !== 'not_found_or_inaccessible') throw error;
    privateRef(target, transport);
    return { sha: null, content: '', fetched_at: new Date().toISOString() };
  }
}

export const targetId = (target: Json): string => digest(JSON.stringify(target));
export const targetRoot = (home?: string): string => safePath(dataHome(home), 'targets');
export const targetDirectory = (target: Json, home?: string): string => safePath(targetRoot(home), targetId(target));

/** Operation metadata embedded in each remote commit message. */
export function metadata(projectKey: string, kind: string, recordKind = 'preferences'): Json {
  if (!OPERATION_KINDS.includes(kind)) throw new Error('Invalid record operation kind');
  return {
    schema_version: 1,
    project_key: projectKey,
    operation_id: crypto.randomUUID(),
    kind,
    record_kind: recordKind,
    recorded_at: new Date().toISOString(),
  };
}

export const commitMessage = (operation: Json): string => 'Harness record\n\n' + JSON.stringify(operation);

function validIndexEntry(id: string, entry: unknown): boolean {
  return isObject(entry)
    && isObject(entry.target)
    && targetId(entry.target) === id
    && Array.isArray(entry.sources)
    && entry.sources.every((source: unknown) => typeof source === 'string' && path.isAbsolute(source));
}

/** The index of every remote target this machine has written to, and the projects that use it. */
export function targetIndex(home?: string): Json {
  const file = safePath(targetRoot(home), 'index.json');
  rejectSymlink(file, 'Target index');
  if (!exists(file)) return { schema_version: 1, targets: {} };
  const value = readJson(file);
  if (!isObject(value) || value.schema_version !== 1 || !isObject(value.targets)) {
    throw new Error('Corrupt target index');
  }
  for (const [id, entry] of Object.entries(value.targets)) {
    if (!validIndexEntry(id, entry)) throw new Error('Corrupt target index');
  }
  return value;
}

export function registerTarget(args: Json, target: Json): void {
  const root = targetRoot(args.home);
  locked(root, () => {
    const index = targetIndex(args.home);
    const id = targetId(target);
    const entry = index.targets[id] || { target, sources: [] };
    const source = canonical(args.project);
    if (!entry.sources.includes(source)) entry.sources.push(source);
    index.targets[id] = entry;
    atomic(safePath(root, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  }, '.index.lock');
}
