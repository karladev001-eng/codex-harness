"""Portable, ownership-checked standalone skill installation (stdlib only)."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

START = '<!-- codex-harness:begin -->'
END = '<!-- codex-harness:end -->'

# Every file needed by the standalone skill.  Keep this explicit so a partial
# release checkout is rejected before an existing installation is backed up or
# otherwise changed.
REQUIRED_SOURCE_FILES = frozenset((
    'SKILL.md',
    'runtime.py',
    'runtime_install.py',
    'assets/adr.md',
    'assets/completion.md',
    'assets/defaults.json',
    'assets/project-map.md',
    'assets/task.md',
    'references/commands.md',
    'references/measurement.md',
    'references/parallel.md',
    'references/reviewer.md',
    'references/roles.md',
))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def locations(home=None):
    user = Path(home).expanduser().resolve() if home else Path.home()
    codex = user / '.codex' if home else Path(os.environ.get('CODEX_HOME', str(user / '.codex'))).expanduser().resolve()
    return user, codex


def inventory(root):
    result = {}
    if root.is_symlink():
        raise ValueError('Skill directory must not be a symlink')
    if not root.is_dir():
        raise ValueError('Skill directory missing: ' + str(root))
    for path in root.rglob('*'):
        if path.is_symlink():
            raise ValueError('Symlink in skill: ' + str(path))
        if '__pycache__' in path.relative_to(root).parts:
            continue
        if path.is_file():
            result[path.relative_to(root).as_posix()] = digest(path.read_bytes())
    return result


def bootstrap(target):
    return (START + '\n'
            'A delegated worker performs only its bounded assignment and never starts this coordinator.\n'
            'For coding requests, invoke Python 3.9+ on `' + str(target / 'runtime.py') + '`\n'
            'with arguments `status --project .`, quoting its path for the active shell.\n'
            'If inactive, continue normally without additional harness actions. If active, read\n'
            '`' + str(target / 'SKILL.md') + '` and follow its orchestration instructions.\n'
            'Honor higher-priority environment and project instructions. If the skill is absent, continue normally.\n'
            'If status fails, report the configuration or compatibility error; do not activate features silently.\n'
            + END)


def read_agents(path):
    if path.is_symlink():
        raise ValueError('AGENTS.md must not be a symlink')
    return path.read_bytes().decode('utf-8') if path.exists() else ''


def block_range(content):
    if content.count(START) != 1 or content.count(END) != 1:
        raise ValueError('Managed AGENTS.md markers missing, duplicated, or modified')
    start, end = content.index(START), content.index(END) + len(END)
    if end < start:
        raise ValueError('Invalid managed AGENTS.md marker order')
    return start, end


def load_owned(manifest, agents, content):
    if manifest.is_symlink():
        raise ValueError('Ownership manifest must not be a symlink')
    if not manifest.exists():
        return None
    state = json.loads(manifest.read_text(encoding='utf-8'))
    if state.get('schema_version') != 1 or state.get('agents') != str(agents):
        raise ValueError('Invalid installation ownership manifest')
    target = Path(state['target'])
    if inventory(target) != state['files']:
        raise ValueError('Installed skill has user changes; preserve or restore them before update/uninstall')
    start, end = block_range(content)
    if content[start:end] != state['block']:
        raise ValueError('Managed AGENTS.md instructions were edited; restore them before update/uninstall')
    return state


def backup(codex, state, agents):
    root = codex / 'harness' / 'backups'
    root.mkdir(parents=True, exist_ok=True)
    destination = Path(tempfile.mkdtemp(prefix='install-', dir=str(root)))
    if agents.exists():
        shutil.copy2(agents, destination / 'AGENTS.md')
    if state:
        shutil.copytree(state['target'], destination / 'skill', ignore=shutil.ignore_patterns('__pycache__'))
        (destination / 'install.json').write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')
    return str(destination)


def install(args):
    user, codex = locations(args.home)
    manifest = codex / 'harness' / 'install.json'
    agents = codex / 'AGENTS.md'
    if (codex / 'AGENTS.override.md').exists():
        raise ValueError('AGENTS.override.md would shadow the bootstrap; resolve this existing override before installation')
    content = read_agents(agents)
    state = load_owned(manifest, agents, content)
    target = Path(args.skills_dir).expanduser().absolute() / 'codex-harness' if args.skills_dir else user / '.agents' / 'skills' / 'codex-harness'
    if state and not args.skills_dir:
        target = Path(state['target'])
    if target.is_symlink():
        raise ValueError('Skill target must not be a symlink')
    target = target.resolve()
    if state and str(target) != state['target']:
        raise ValueError('Uninstall before changing the skill target')
    if not state and (target.exists() or START in content or END in content):
        raise ValueError('Unowned skill target or AGENTS.md markers already exist')
    source = Path(__file__).resolve().parent
    if source in target.parents or target in source.parents:
        raise ValueError('Skill source and installation target must not overlap')
    files = inventory(source)
    missing = sorted(REQUIRED_SOURCE_FILES.difference(files))
    if missing:
        raise ValueError('Source skill is incomplete; missing: ' + ', '.join(missing))
    block = bootstrap(target)
    if state and state['files'] == files and state['block'] == block:
        return {'status': 'unchanged', 'target': str(target)}
    if source == target:
        raise ValueError('Cannot replace the source skill itself; run install from a separate release checkout')
    if state:
        start, end = block_range(content)
        updated = content[:start] + block + content[end:]
        separator = state.get('separator', '')
        suffix = state.get('suffix', '\n')
        original_exists = state.get('agents_existed', True)
    else:
        separator = '\n\n' if content and not content.endswith('\n') else ('\n' if content else '')
        suffix = '\n'
        original_exists = agents.exists()
        updated = content + separator + block + suffix
    saved = backup(codex, state, agents)
    target.parent.mkdir(parents=True, exist_ok=True)
    old_manifest = manifest.read_bytes() if manifest.exists() else None
    agents_existed_now = agents.exists()
    with tempfile.TemporaryDirectory(prefix='.harness-stage-', dir=str(target.parent)) as temporary:
        staged = Path(temporary) / 'skill'
        previous = Path(temporary) / 'previous'
        shutil.copytree(source, staged, ignore=shutil.ignore_patterns('__pycache__'))
        try:
            if target.exists():
                target.rename(previous)
            staged.rename(target)
            agents.write_bytes(updated.encode('utf-8'))
            manifest.write_text(json.dumps({'schema_version': 1, 'target': str(target), 'agents': str(agents),
                                           'files': files, 'block': block, 'separator': separator,
                                           'suffix': suffix, 'agents_existed': original_exists}, indent=2) + '\n', encoding='utf-8')
        except OSError:
            # Restore the prior skill before attempting restoration of instruction files.
            if target.exists() and not staged.exists():
                shutil.rmtree(target)
            if previous.exists():
                previous.rename(target)
            if agents_existed_now:
                if agents.read_bytes() != content.encode('utf-8'):
                    agents.write_bytes(content.encode('utf-8'))
            elif agents.exists():
                agents.unlink()
            if old_manifest is not None:
                manifest.write_bytes(old_manifest)
            elif manifest.exists():
                manifest.unlink()
            raise
    return {'status': 'installed', 'target': str(target), 'backup': saved}


def uninstall(args):
    _, codex = locations(args.home)
    manifest = codex / 'harness' / 'install.json'
    agents = codex / 'AGENTS.md'
    content = read_agents(agents)
    state = load_owned(manifest, agents, content)
    if not state:
        return {'status': 'not_installed'}
    start, end = block_range(content)
    # Remove only the separators we inserted if they still immediately surround the block.
    separator, suffix = state.get('separator', ''), state.get('suffix', '')
    if separator and content[:start].endswith(separator):
        start -= len(separator)
    if suffix and content[end:].startswith(suffix):
        end += len(suffix)
    updated = content[:start] + content[end:]
    saved = backup(codex, state, agents)
    target = Path(state['target'])
    old_manifest = manifest.read_bytes()
    with tempfile.TemporaryDirectory(prefix='.harness-remove-', dir=str(target.parent)) as temporary:
        previous = Path(temporary) / 'skill'
        target.rename(previous)
        try:
            if not updated and not state.get('agents_existed', True):
                agents.unlink()
            else:
                agents.write_bytes(updated.encode('utf-8'))
            manifest.unlink()
        except OSError:
            previous.rename(target)
            if not agents.exists() or agents.read_bytes() != content.encode('utf-8'):
                agents.write_bytes(content.encode('utf-8'))
            if not manifest.exists():
                manifest.write_bytes(old_manifest)
            raise
    return {'status': 'uninstalled', 'backup': saved}


def add_install_commands(subparsers):
    for name, handler in [('install', install), ('uninstall', uninstall)]:
        parser = subparsers.add_parser(name)
        parser.add_argument('--home', help='Isolated user home; overrides CODEX_HOME')
        if name == 'install':
            parser.add_argument('--skills-dir', help='Explicit parent directory for the standalone skill')
        parser.set_defaults(handler=handler)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    add_install_commands(parser.add_subparsers(dest='command', required=True))
    args = parser.parse_args(argv)
    try:
        print(json.dumps(args.handler(args), ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, KeyError, TypeError) as error:
        print('harness: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
