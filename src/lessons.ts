// Technical lessons: validated JSON records stored beside the preferences record, using the
// same GitHub engine (preferences()) for read, write, forget, sync and a bounded search.
import { Json, digest, isObject, localRoot, safePath, taskId } from './lib';
import { preferences, preferenceTarget } from './preferences';
import { Transport, github, privateRef, RemoteError, textInput } from './records';
import { resolveIdentity, identityStatus, projectIdentity } from './identity';

const MAX_TEXT_LENGTH = 16384;
const MAX_LIST_ITEMS = 32;
const LESSON_FIELDS = [
  'schema_version', 'id', 'cause', 'remedy', 'verification', 'scope', 'sources', 'recorded_at', 'evaluation',
  'evaluation_sources',
];
const LESSON_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.json$/;
/** Search stops after reading this many lesson files, whatever the limit. */
const MAX_SEARCH_READS = 20;
/** Remote failures during identity resolution that still allow a locally known project key. */
const RECOVERABLE_IDENTITY_ERRORS = [
  'unavailable', 'authentication', 'forbidden', 'not_found_or_inaccessible', 'identity_requires_remote_check',
];

const isText = (item: unknown): boolean =>
  typeof item === 'string' && item.trim().length > 0 && item.length <= MAX_TEXT_LENGTH && !item.includes('\0');

const isTextList = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0 && value.length <= MAX_LIST_ITEMS && value.every(isText);

/** Rejects timestamps whose calendar date Date.parse would silently normalize (e.g. February 30). */
function validCalendarDate(timestamp: string): boolean {
  const calendar = /^(\d{4})-(\d\d)-(\d\d)T/.exec(timestamp)!;
  const year = Number(calendar[1]);
  const month = Number(calendar[2]) - 1;
  const day = Number(calendar[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day;
}

function hasEvaluationSources(lesson: Json): boolean {
  const sources = lesson.evaluation_sources;
  return Array.isArray(sources) && sources.length > 0 && sources.every(isText);
}

export function validateLesson(value: unknown): Json {
  if (!isObject(value) || value.schema_version !== 1) throw new Error('Lesson requires schema_version 1');
  taskId(value.id);
  for (const field of ['cause', 'remedy']) {
    if (!isText(value[field])) throw new Error('Lesson requires ' + field);
  }
  for (const field of ['verification', 'scope', 'sources']) {
    if (!isTextList(value[field])) throw new Error('Lesson requires nonempty ' + field + ' array');
  }
  const timestamped = typeof value.recorded_at === 'string'
    && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value.recorded_at)
    && Number.isFinite(Date.parse(value.recorded_at));
  if (!timestamped) throw new Error('Lesson requires recorded_at timestamp with timezone');
  if (!validCalendarDate(value.recorded_at)) throw new Error('Lesson recorded_at has invalid date');
  if (!['unknown', 'accepted', 'rejected'].includes(value.evaluation)) {
    throw new Error('Lesson requires explicit evaluation, including unknown');
  }
  if (value.evaluation !== 'unknown' && !hasEvaluationSources(value)) {
    throw new Error('Evaluated lesson requires evaluation_sources');
  }
  if (Object.keys(value).some(key => !LESSON_FIELDS.includes(key))) throw new Error('Unknown lesson field');
  return value;
}

/** Lists the lessons directory and returns up to `limit` fresh lessons matching `args.query`. */
function searchLessons(args: Json, config: Json, target: Json, transport: Transport): Json {
  if (args.offline === 'true') return { ok: false, freshness: 'stale', error: 'fresh_required', lessons: [] };
  const limit = Number(args.limit || 3);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Lesson limit must be 1–10');
  const directory = target.path.replace(/preferences\.md$/, 'lessons');
  try {
    privateRef(target, transport);
    const endpoint = `repos/${target.repository}/contents/${directory}?ref=${encodeURIComponent(target.branch)}`;
    let files: unknown;
    try {
      files = transport('GET', endpoint);
    } catch (error) {
      if (!(error instanceof RemoteError) || error.kind !== 'not_found_or_inaccessible') throw error;
      privateRef(target, transport);
      return { ok: true, freshness: 'fresh', lessons: [] };
    }
    if (!Array.isArray(files) || files.length > 1000) throw new RemoteError('invalid_response');
    const found: Json[] = [];
    let checked = 0;
    for (const file of files.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      const listedLesson = file
        && file.type === 'file'
        && LESSON_FILE_NAME.test(file.name)
        && file.path === directory + '/' + file.name;
      if (!listedLesson) throw new RemoteError('invalid_response');
      if (checked++ >= MAX_SEARCH_READS || found.length >= limit) break;
      const request = { ...args, action: 'read', id: file.name.slice(0, -5), automatic: args.automatic };
      const result = lessons(request, config, transport);
      if (!result.ok || result.freshness !== 'fresh') {
        return { ok: false, freshness: 'stale', error: 'fresh_required', lessons: [] };
      }
      if (!result.lesson) continue;
      const matches = !args.query || JSON.stringify(result.lesson).toLowerCase().includes(args.query.toLowerCase());
      if (matches) found.push(result.lesson);
    }
    return { ok: true, freshness: 'fresh', lessons: found };
  } catch (error) {
    const kind = error instanceof RemoteError ? error.kind : 'invalid_lesson';
    return { ok: false, freshness: 'stale', error: kind, lessons: [] };
  }
}

/** Records need the harness, persistence and preferences; automatic use also needs improvement_loop and autosave. */
function recordPolicyDisabled(args: Json, config: Json): boolean {
  if (!config.enabled || !config.persistence || config.preferences.enabled === false) return true;
  return Boolean(args.automatic && (!config.improvement_loop || config.preferences.autosave === false));
}

export function lessons(args: Json, config: Json, transport: Transport = github): Json {
  if (recordPolicyDisabled(args, config)) return { skipped: 'record policy disabled' };
  let record: Json | null = null;
  if (args.action === 'write') {
    try {
      record = validateLesson(JSON.parse(textInput(args.input)));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('Lesson input must be JSON');
      throw error;
    }
    if (args.id && args.id !== record.id) throw new Error('Lesson ID does not match input');
    args = { ...args, id: record.id };
  }
  if (config.preferences.repository && config.preferences.autosave) {
    try {
      const identity = resolveIdentity(args, config, transport, false);
      if (!identity.project_key) return { ok: false, error: 'identity_unresolved', freshness: 'stale' };
      config = { ...config, preferences: { ...config.preferences, project_key: identity.project_key } };
    } catch (error) {
      const recoverable = error instanceof RemoteError && RECOVERABLE_IDENTITY_ERRORS.includes(error.kind);
      if (!recoverable) {
        const kind = error instanceof RemoteError ? error.kind : 'identity_resolution_failed';
        return { ok: false, error: kind, freshness: 'stale' };
      }
      const cached = identityStatus(args, config);
      const origin = config.preferences.project_key ? null : projectIdentity(args.project);
      const originKey = origin ? 'git-' + digest(origin).slice(0, 24) : null;
      const key = config.preferences.project_key || cached.project_key || originKey;
      if (!key) return { ok: false, error: error.kind, freshness: 'stale' };
      config = { ...config, preferences: { ...config.preferences, project_key: key } };
    }
  }
  const target = preferenceTarget(config);
  if (args.action === 'search') {
    if (!target) throw new Error('Lesson search requires GitHub preferences configuration');
    return searchLessons(args, config, target, transport);
  }

  const id = taskId(args.id);
  const recordTarget = target
    ? { ...target, path: target.path.replace(/preferences\.md$/, `lessons/${id}.json`) }
    : null;
  const request: Json = {
    ...args,
    _target: recordTarget,
    _record: 'lesson',
    _local_file: safePath(localRoot(args.project, args.home), 'lessons', id + '.json'),
  };
  if (args.action === 'forget') {
    request.action = 'write';
    request._delete = true;
    request._content = '';
    request.kind = 'forget';
  }
  if (record) request._content = JSON.stringify(record, null, 2) + '\n';
  const result = preferences(request, config, transport);
  if (result.skipped) return result;
  const { content, remote_content, ...output } = result;
  if (!content || request._delete) return { ...output, lesson: null };
  try {
    const lesson = validateLesson(JSON.parse(content));
    if (lesson.id !== id) throw new Error('Lesson ID mismatch');
    // Pending/stale records are available for explicit management, never automatic application.
    if (args.automatic && result.freshness !== 'fresh') {
      return { ...output, ok: false, error: 'fresh_required', lesson: null };
    }
    return { ...output, lesson };
  } catch {
    return { ...output, ok: false, error: 'invalid_lesson', lesson: null };
  }
}
