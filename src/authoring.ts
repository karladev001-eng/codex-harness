// Authoring skills: installs or removes the independent Markdown authoring skills in a
// project's skills directory, tracked by an ownership manifest and applied all-or-nothing.
import fs from 'node:fs';
import path from 'node:path';
import {
  canonical, copySkill, equalFiles, exists, inventory, isObject, Json, readJson, rejectSymlink, safePath, sourceRoot,
  within,
} from './lib';

export const DEFAULT_SKILLS = [
  'create-rulebooks', 'create-subagent', 'create-harness', 'inspect-harness', 'codex-html-plan',
];
export const OPTIONAL_SKILLS = ['codex-slide-plan'];
export const SKILLS = [...DEFAULT_SKILLS, ...OPTIONAL_SKILLS];

/** Files each skill source must contain before it may be installed. */
const REQUIRED: Record<string, string[]> = {
  'create-rulebooks': ['SKILL.md', 'assets/rulebook.md'],
  'create-subagent': ['SKILL.md', 'assets/subagent.md'],
  'create-harness': ['SKILL.md', 'assets/harness-index.md', 'assets/workflow.md'],
  'inspect-harness': ['SKILL.md'],
  'codex-html-plan': [
    'SKILL.md', 'read-sections.cjs', 'references/section-index.json', 'UPSTREAM.md', 'LICENSE', 'agents/openai.yaml',
    'runtime/htmlplan.js', 'runtime/htmlplan.css', 'runtime/pack.mjs',
    'references/blocks.md', 'references/workflow.md', 'references/color-design.md',
    'examples/task-board.src.html', 'examples/task-board.plan.html',
    'examples/records/ADR-07.md', 'examples/records/TASK-42.md', 'examples/records/EXP-03.md',
    'examples/records/index.md',
  ],
  'codex-slide-plan': [
    'SKILL.md', 'agents/openai.yaml', 'references/schema.md', 'references/workflow.md',
    'references/quality-review.md', 'references/masters.md',
    'scripts/legacy-v1.json', 'scripts/pack.mjs', 'scripts/review.js', 'scripts/style.css', 'scripts/inspect-master.py',
    'scripts/make-fixtures.py', 'examples/deck.json', 'examples/deck-revised.json',
    'examples/visual-first/generate-example.mjs', 'examples/visual-first/references/r2-deck.json',
    'examples/visual-first/references/revision-notes.md', 'examples/visual-first/references/semantic-review.json',
    'examples/visual-first/scripts/aggregate.mjs', 'examples/visual-first/data/brief.md',
    'examples/visual-first/data/measurements.csv', 'examples/visual-first/data/summary.json',
    'examples/visual-first/assets/comparison.svg',
  ],
};

/** One skill to change. `files: null` means remove it; otherwise install these files from `source`. */
interface PlannedSkill {
  name: string;
  target: string;
  source: string;
  files: Record<string, string> | null;
}

function releaseAuthoringSource(): string | null {
  const release = path.resolve(sourceRoot, '../..');
  const manifest = path.join(release, 'package.json');
  // Do not use a similarly named sibling directory near a permanent installation.
  if (!exists(manifest) || sourceRoot !== path.join(release, 'dist', 'skill')) return null;
  const metadata = readJson(manifest) as Json;
  const isReleasePackage = metadata.name === '@karladev001-eng/codex-harness'
    && metadata.bin?.['codex-harness'] === 'dist/skill/runtime.js';
  return isReleasePackage ? path.join(release, 'authoring-skills') : null;
}

function isAuthoringManifest(state: unknown, root: string): state is Json {
  return isObject(state)
    && state.schema_version === 1
    && state.root === root
    && isObject(state.skills)
    && Object.keys(state.skills).every(key => SKILLS.includes(key));
}

export function authoring(args: Json, source?: string): Json {
  const defaultSource = path.join(sourceRoot, 'authoring-skills');
  const project = canonical(args.project || '.');
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    throw new Error('Project directory does not exist');
  }
  const root = args.skills_dir ? canonical(args.skills_dir) : safePath(project, '.agents', 'skills');
  rejectSymlink(root, 'Skills directory');
  const manifest = path.join(root, '.codex-harness-authoring.json');
  rejectSymlink(manifest, 'Ownership manifest');
  const oldBytes = exists(manifest) ? fs.readFileSync(manifest) : null;
  const state = oldBytes ? readJson(manifest) : { schema_version: 1, root, skills: {} };
  if (!isAuthoringManifest(state, root)) throw new Error('Invalid authoring ownership manifest');
  const selected: string[] = args.skill.length ? [...new Set<string>(args.skill)] : DEFAULT_SKILLS;
  if (selected.some(name => !SKILLS.includes(name))) {
    throw new Error('Unknown authoring skill; choose: ' + SKILLS.join(', '));
  }

  // Validate every selected skill before touching the filesystem.
  const planned: PlannedSkill[] = [];
  for (const name of selected) {
    const target = safePath(root, name);
    const owned = state.skills[name];
    if (owned) {
      if (!equalFiles(inventory(target), owned)) throw new Error('Installed authoring skill has user changes: ' + name);
    } else if (exists(target)) {
      throw new Error('Unowned authoring skill target already exists: ' + name);
    }
    if (args.action === 'uninstall') {
      if (owned) planned.push({ name, target, source: '', files: null });
      continue;
    }
    const selectedSource = source ?? (OPTIONAL_SKILLS.includes(name) ? releaseAuthoringSource() : defaultSource);
    const skillSource = selectedSource ? path.join(selectedSource, name) : '';
    if (!skillSource || !exists(skillSource)) {
      throw new Error('Authoring source unavailable: ' + name
        + '; run authoring install from a supporting release npm package or tarball');
    }
    const files = inventory(skillSource);
    const missing = REQUIRED[name].filter(file => !Object.hasOwn(files, file));
    if (missing.length) throw new Error('Source authoring skill is incomplete: ' + name + ': ' + missing.join(', '));
    const resolvedSource = canonical(skillSource);
    const resolvedTarget = canonical(target);
    const overlaps = resolvedSource === resolvedTarget
      || within(resolvedSource, resolvedTarget)
      || within(resolvedTarget, resolvedSource);
    if (overlaps) throw new Error('Authoring source and target must not overlap');
    if (!equalFiles(owned, files)) planned.push({ name, target, source: skillSource, files });
  }
  if (!planned.length) {
    return { status: args.action === 'uninstall' ? 'not_installed' : 'unchanged', root, skills: selected };
  }

  fs.mkdirSync(root, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(root, '.harness-authoring-'));
  const staged = (item: PlannedSkill) => path.join(temporary, item.name + '-new');
  const displaced = (item: PlannedSkill) => path.join(temporary, item.name + '-old');
  const moved: PlannedSkill[] = [];
  const installed: PlannedSkill[] = [];
  const next = structuredClone(state);
  try {
    for (const item of planned) {
      if (item.files) copySkill(item.source, staged(item));
    }
    for (const item of planned) {
      if (exists(item.target)) {
        fs.renameSync(item.target, displaced(item));
        moved.push(item);
      }
      if (item.files) {
        fs.renameSync(staged(item), item.target);
        installed.push(item);
        next.skills[item.name] = item.files;
      } else {
        delete next.skills[item.name];
      }
    }
    if (Object.keys(next.skills).length) fs.writeFileSync(manifest, JSON.stringify(next, null, 2) + '\n');
    else fs.unlinkSync(manifest);
  } catch (error) {
    // Undo in reverse order, attempting every step even if an earlier one fails.
    const errors: unknown[] = [];
    const restore = (operation: () => void) => {
      try {
        operation();
      } catch (failure) {
        errors.push(failure);
      }
    };
    const restoreManifest = () => {
      if (oldBytes) {
        if (!exists(manifest) || !fs.readFileSync(manifest).equals(oldBytes)) fs.writeFileSync(manifest, oldBytes);
      } else if (exists(manifest)) {
        fs.unlinkSync(manifest);
      }
    };
    for (const item of installed.reverse()) restore(() => fs.rmSync(item.target, { recursive: true }));
    for (const item of moved.reverse()) restore(() => fs.renameSync(displaced(item), item.target));
    restore(restoreManifest);
    if (errors.length) {
      throw new Error(`${error}; rollback incomplete; recovery files kept at ${temporary}: ${errors.join('; ')}`);
    }
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(temporary, { recursive: true, force: true });
  return {
    status: args.action === 'uninstall' ? 'uninstalled' : 'installed',
    root,
    skills: planned.map(item => item.name),
  };
}
