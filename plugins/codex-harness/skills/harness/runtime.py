"""Portable, standard-library helpers for the instruction-based Codex harness."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

FLAGS = ('delegation', 'review', 'persistence', 'measurement')
DEFAULTS = json.loads((Path(__file__).parent / 'assets/defaults.json').read_text(encoding='utf-8'))


def codex_home(home=None):
    return (Path(home).expanduser() / '.codex' if home else
            Path(os.environ.get('CODEX_HOME', '~/.codex')).expanduser()).resolve()


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (ValueError, OSError) as exc:
        raise ValueError('Cannot read JSON %s: %s' % (path, exc)) from exc


def merge_settings(base, override):
    if not isinstance(override, dict):
        raise ValueError('Configuration must be an object')
    for key, value in override.items():
        if key not in base:
            raise ValueError('Unknown configuration key: ' + key)
        if isinstance(base[key], dict):
            merge_settings(base[key], value)
        elif type(value) is not type(base[key]):
            raise ValueError('Wrong configuration type: ' + key)
        else:
            base[key] = value
    return base


def settings(project, home=None):
    result = copy.deepcopy(DEFAULTS)
    for path in (codex_home(home) / 'harness/settings.json', Path(project) / '.harness.json'):
        if path.exists():
            merge_settings(result, read_json(path))
    if result['schema_version'] != 1 or result['max_agents'] < 1:
        raise ValueError('Unsupported schema_version or invalid max_agents')
    for role in result['models'].values():
        if not role['model'].strip() or role['reasoning_effort'] not in (
                'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'):
            raise ValueError('Invalid model mapping')
    return result


def active(config):
    return config['enabled'] and any(config[key] for key in FLAGS)


def task_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', value):
        raise ValueError('Task ID must be 1–64 letters, digits, underscores or hyphens')
    return value


def safe_path(root, *parts):
    root = Path(root).resolve()
    path = root.joinpath(*parts)
    if root not in path.resolve().parents:
        raise ValueError('Path escapes its storage root: ' + str(path))
    return path


def local_root(project, home=None):
    digest = hashlib.sha256(str(Path(project).resolve()).encode()).hexdigest()[:20]
    return safe_path(codex_home(home), 'harness', 'projects', digest)


def save_new(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def git(project, *args):
    result = subprocess.run(['git', '-C', str(project), *args], capture_output=True, text=True)
    if result.returncode:
        raise ValueError(result.stderr.strip() or 'Git operation failed')
    return result.stdout.strip()


def packets(project):
    directory = safe_path(project, 'docs', 'harness', 'tasks')
    return {p.stem: read_json(safe_path(project, 'docs', 'harness', 'tasks', p.name))
            for p in directory.glob('*.json')}


def validate_graph(items):
    for key, packet in items.items():
        task_id(key)
        if not isinstance(packet, dict) or not isinstance(packet.get('dependencies'), list):
            raise ValueError('Task %s must contain a dependencies list' % key)
    visiting, done = set(), set()
    def visit(key):
        if key in visiting:
            raise ValueError('Dependency cycle involving ' + key)
        if key not in items:
            raise ValueError('Missing dependency: ' + key)
        if key in done:
            return
        visiting.add(key)
        for dep in items[key]['dependencies']:
            task_id(dep)
            visit(dep)
        visiting.remove(key)
        done.add(key)
    for key in items:
        visit(key)


def create_task(args, config):
    key = task_id(args.id)
    if not args.acceptance or not args.scope:
        raise ValueError('At least one --acceptance and --scope are required')
    for owned in args.scope:
        if Path(owned).is_absolute() or '..' in Path(owned).parts:
            raise ValueError('Owned paths must be project-relative')
    try:
        revision = git(args.project, 'rev-parse', '--verify', args.base + '^{commit}')
    except (ValueError, FileNotFoundError):
        revision = None
        if args.base != 'HEAD':
            raise ValueError('Explicit base cannot be resolved')
    packet = dict(id=key, goal=args.goal, non_goals=args.non_goal,
                  acceptance_criteria=[{'id': i + 1, 'text': text} for i, text in enumerate(args.acceptance)],
                  owned_paths=args.scope, dependencies=args.depends_on,
                  spec_revision=args.spec_revision, code_base_revision=revision,
                  constraints=args.constraint, source_references=args.reference,
                  open_questions=[], state='planned', completion=None)
    if config['persistence']:
        existing = packets(args.project)
        if key in existing:
            raise ValueError('Task already exists: ' + key)
        validate_graph(dict(existing, **{key: packet}))
        save_new(safe_path(args.project, 'docs/harness/tasks', key + '.json'), packet)
    return packet


def create_worktree(args, config):
    key = task_id(args.id)
    if not config['delegation']:
        return {'skipped': 'delegation disabled'}
    revision = git(args.project, 'rev-parse', '--verify', args.base + '^{commit}')
    if config['persistence']:
        packet_path = safe_path(args.project, 'docs', 'harness', 'tasks', key + '.json')
        if packet_path.exists():
            packet = read_json(packet_path)
            if not isinstance(packet, dict):
                raise ValueError('Task %s packet must be an object' % key)
            recorded_revision = packet.get('code_base_revision')
            if not recorded_revision:
                raise ValueError('Task %s has no recorded code_base_revision' % key)
            if recorded_revision != revision:
                raise ValueError('Task %s code_base_revision does not match requested base' % key)
    # Coordinator packets/settings are passed separately; workers use committed code.
    if git(args.project, 'status', '--porcelain', '--', '.',
           ':(top,exclude)docs/harness/**', ':(top,exclude).harness.json'):
        raise ValueError('Checkout has uncommitted changes; checkpoint or use serial work first')
    path = safe_path(local_root(args.project, args.home), 'worktrees', key)
    branch = 'harness/' + key
    refs = git(args.project, 'for-each-ref', '--format=%(refname)', 'refs/heads/' + branch)
    if refs or path.exists() or path.is_symlink():
        raise ValueError('Worktree path or branch already exists')
    path.parent.mkdir(parents=True, exist_ok=True)
    git(args.project, 'worktree', 'add', '-b', branch, str(path), revision)
    return {'path': str(path), 'branch': branch, 'base_revision': revision}


def measurement(data):
    if not isinstance(data, dict):
        raise ValueError('Measurement must be an object')
    for key in ('task_id', 'run_id'):
        task_id(data.get(key, ''))
    if data.get('condition') not in ('baseline', 'harness'):
        raise ValueError('condition must be baseline or harness')
    try:
        start, end = [datetime.fromisoformat(data[k].replace('Z', '+00:00')) for k in ('start', 'end')]
        if start.tzinfo is None or end.tzinfo is None or end < start:
            raise ValueError('Invalid time ordering or missing timezone')
    except (KeyError, TypeError, AttributeError, ValueError) as exc:
        raise ValueError('start/end must be ordered ISO timestamps with timezone') from exc
    result = dict(data, elapsed_seconds=(end - start).total_seconds())
    for key in ('model_roles', 'corrections', 'completion', 'defects', 'usage_before', 'usage_after',
                'window_before', 'window_after', 'overlap'):
        result.setdefault(key, None)
    before, after = result['usage_before'], result['usage_after']
    for value in (before, after):
        if value is not None and (type(value) not in (float, int) or not 0 <= value <= 100):
            raise ValueError('usage must be percent consumed between 0 and 100')
    reasons = []
    if before is None or after is None:
        reasons.append('missing usage')
    if not result['window_before'] or result['window_before'] != result['window_after']:
        reasons.append('missing or changed reset window')
    if result['overlap'] is not False:
        reasons.append('overlap present or unknown')
    if before is not None and after is not None and after < before:
        reasons.append('usage decreased')
    result.update(comparable=not reasons, exclusion_reasons=reasons,
                  account_usage_delta=after - before if not reasons else None)
    return result


def parser():
    result = argparse.ArgumentParser(description=__doc__, epilog='Installation commands: install --help; uninstall --help')
    sub = result.add_subparsers(dest='command', required=True)
    def common(p):
        p.add_argument('--project', default='.')
        p.add_argument('--home', help='Isolated user home; overrides CODEX_HOME')
    for name in ('status', 'doctor'):
        common(sub.add_parser(name))
    task = sub.add_parser('task').add_subparsers(dest='action', required=True)
    for name in ('create', 'show', 'validate'):
        p = task.add_parser(name)
        common(p)
        if name != 'validate':
            p.add_argument('--id', required=True)
        if name == 'create':
            p.add_argument('--goal', required=True)
            for option in ('acceptance', 'scope', 'depends-on', 'non-goal', 'constraint', 'reference'):
                p.add_argument('--' + option, action='append', default=[])
            p.add_argument('--spec-revision', default='1')
            p.add_argument('--base', default='HEAD')
    p = sub.add_parser('worktree').add_subparsers(dest='action', required=True).add_parser('create')
    common(p)
    p.add_argument('--id', required=True)
    p.add_argument('--base', required=True)
    p = sub.add_parser('measure').add_subparsers(dest='action', required=True).add_parser('record')
    common(p)
    p.add_argument('--input', required=True)
    return result


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] in ('install', 'uninstall'):
        import runtime_install
        return runtime_install.main(argv)
    args = parser().parse_args(argv)
    try:
        args.project = str(Path(args.project).expanduser().resolve())
        if not Path(args.project).is_dir():
            raise ValueError('Project directory does not exist')
        config = settings(args.project, args.home)
        if args.command == 'status':
            output = dict(config=config, active=active(config), project=args.project,
                          local_root=str(local_root(args.project, args.home)))
        elif not active(config):
            output = {'active': False, 'skipped': 'harness disabled'}
        elif args.command == 'doctor':
            try:
                root = git(args.project, 'rev-parse', '--show-toplevel')
            except (ValueError, FileNotFoundError):
                root = None
            try:
                committed = git(args.project, 'rev-parse', '--verify', 'HEAD^{commit}') if root else None
            except ValueError:
                committed = None
            output = dict(python=sys.version.split()[0], git_repository=root,
                          git_executable=shutil.which('git'), codex_executable=shutil.which('codex'),
                          parallel_worktrees=bool(committed),
                          host_capabilities='Model availability and no-history spawning require live host validation')
        elif args.command == 'task':
            if args.action == 'create':
                output = create_task(args, config)
            elif not config['persistence']:
                output = {'skipped': 'persistence disabled; use inline packet'}
            elif args.action == 'show':
                output = read_json(safe_path(args.project, 'docs/harness/tasks', task_id(args.id) + '.json'))
            else:
                items = packets(args.project)
                validate_graph(items)
                output = {'valid': True, 'tasks': sorted(items)}
        elif args.command == 'worktree':
            output = create_worktree(args, config)
        elif not config['measurement']:
            output = {'skipped': 'measurement disabled'}
        else:
            output = measurement(read_json(args.input))
            save_new(safe_path(local_root(args.project, args.home), 'measurements', output['run_id'] + '.json'), output)
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError) as exc:
        print('harness: ' + str(exc), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
