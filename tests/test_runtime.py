import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'plugins/codex-harness/skills/harness/runtime.py'
spec = importlib.util.spec_from_file_location('runtime', MODULE)
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / 'project with spaces'
        self.project.mkdir()
        self.home = self.root / 'user home'

    def run_cli(self, *args):
        with contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
            code = r.main([*args, '--project', str(self.project), '--home', str(self.home)])
        return code, json.loads(out.getvalue()) if out.getvalue() else None, err.getvalue()

    def config(self, obj):
        (self.project / '.harness.json').write_text(json.dumps(obj))

    def test_nested_layers_and_validation(self):
        personal = self.home / '.codex/harness/settings.json'
        personal.parent.mkdir(parents=True)
        personal.write_text(json.dumps({'max_agents': 4, 'models': {'standard': {'model': 'custom'}}}))
        self.config({'max_agents': 2})
        cfg = r.settings(self.project, self.home)
        self.assertEqual(cfg['max_agents'], 2)
        self.assertEqual(cfg['models']['standard'], {'model': 'custom', 'reasoning_effort': 'medium'})
        for bad in ({'review': 1}, {'unknown': True}, {'schema_version': 2}, {'max_agents': 0}, {'models': []}):
            self.config(bad)
            self.assertEqual(self.run_cli('status')[0], 2)

    def test_all_off_no_writes(self):
        self.config({key: False for key in r.FLAGS})
        before = list(self.root.rglob('*'))
        self.assertEqual(self.run_cli('task', 'create', '--id', 'x', '--goal', 'x')[0], 0)
        self.assertEqual(self.run_cli('measure', 'record', '--input', 'nonexistent')[0], 0)
        self.assertEqual(before, list(self.root.rglob('*')))

    def test_task_packet_dependencies_and_no_persistence(self):
        args = ('task', 'create', '--id', 'a', '--goal', 'goal', '--acceptance', 'works', '--scope', 'src')
        self.assertEqual(self.run_cli(*args)[0], 0)
        self.assertEqual(self.run_cli(*args)[0], 2)
        self.assertEqual(self.run_cli('task', 'validate')[1]['tasks'], ['a'])
        self.assertEqual(self.run_cli('task', 'show', '--id', '../a')[0], 2)
        self.config({'persistence': False})
        args = list(args)
        args[3] = 'b'
        self.assertEqual(self.run_cli(*args)[0], 0)
        self.assertFalse((self.project / 'docs/harness/tasks/b.json').exists())
        with self.assertRaises(ValueError):
            r.validate_graph({'a': {'dependencies': ['b']}})
        with self.assertRaises(ValueError):
            r.validate_graph({'a': {'dependencies': ['b']}, 'b': {'dependencies': ['a']}})
        with self.assertRaises(ValueError):
            r.validate_graph({'a': {}})
        with self.assertRaises(ValueError):
            r.validate_graph({'a': {'dependencies': [None]}})

    def test_symlink_escape(self):
        outside = self.root / 'outside'
        outside.mkdir()
        (self.project / 'docs').symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.run_cli('task', 'create', '--id', 'a', '--goal', 'a', '--acceptance', 'a', '--scope', 'src')[0], 2)
        self.assertEqual(list(outside.iterdir()), [])

    def test_measurement_unknown_reset_overlap(self):
        base = dict(task_id='a', run_id='a-1', condition='harness', start='2026-09-21T01:00:00Z', end='2026-09-21T01:02:00Z')
        self.assertIsNone(r.measurement(base)['account_usage_delta'])
        base.update(usage_before=10, usage_after=12, window_before='same', window_after='same', overlap=False)
        self.assertEqual(r.measurement(base)['account_usage_delta'], 2)
        self.assertEqual(r.measurement(base)['elapsed_seconds'], 120)
        self.assertFalse(r.measurement(dict(base, window_after='new'))['comparable'])
        self.assertFalse(r.measurement(dict(base, overlap=True))['comparable'])
        self.assertFalse(r.measurement(dict(base, usage_after=1))['comparable'])
        with self.assertRaises(ValueError):
            r.measurement(dict(base, task_id=123))
        source = self.root / 'measurement.json'
        source.write_text(json.dumps(base))
        self.assertEqual(self.run_cli('measure', 'record', '--input', str(source))[0], 0)
        self.assertEqual(self.run_cli('measure', 'record', '--input', str(source))[0], 2)

    def test_worktree_isolation_dirty_retained_and_collisions(self):
        def git(*args):
            return subprocess.run(['git', '-C', str(self.project), *args], check=True, capture_output=True, text=True)
        git('init')
        self.assertFalse(self.run_cli('doctor')[1]['parallel_worktrees'])
        git('config', 'user.name', 'Test')
        git('config', 'user.email', 'test@example.invalid')
        (self.project / 'file').write_text('original')
        git('add', 'file')
        git('commit', '-m', 'initial')
        self.assertEqual(self.run_cli('task', 'create', '--id', 'a', '--goal', 'goal',
                                     '--acceptance', 'works', '--scope', 'file')[0], 0)
        self.config({'max_agents': 2})
        code, result, _ = self.run_cli('worktree', 'create', '--id', 'a', '--base', 'HEAD')
        self.assertEqual(code, 0)
        worktree = Path(result['path'])
        self.assertTrue((self.project / 'docs/harness/tasks/a.json').exists())
        self.assertFalse((worktree / 'docs/harness/tasks/a.json').exists())
        self.assertFalse((worktree / '.harness.json').exists())
        (worktree / 'file').write_text('separate')
        self.assertEqual((self.project / 'file').read_text(), 'original')
        self.assertEqual(self.run_cli('worktree', 'create', '--id', 'a', '--base', 'HEAD')[0], 2)
        self.assertEqual(self.run_cli('worktree', 'create', '--id', 'b', '--base', 'missing')[0], 2)
        (self.project / 'file').write_text('user changes')
        self.assertEqual(self.run_cli('worktree', 'create', '--id', 'b', '--base', 'HEAD')[0], 2)
        self.assertEqual((self.project / 'file').read_text(), 'user changes')
        self.config({'delegation': False})
        self.assertEqual(self.run_cli('worktree', 'create', '--id', 'c', '--base', 'HEAD')[1], {'skipped': 'delegation disabled'})

    def test_worktree_rejects_packet_base_mismatch_but_allows_matching_or_no_packet(self):
        def git(*args):
            return subprocess.run(['git', '-C', str(self.project), *args], check=True, capture_output=True, text=True)
        git('init')
        git('config', 'user.name', 'Test')
        git('config', 'user.email', 'test@example.invalid')
        (self.project / 'file').write_text('initial')
        git('add', 'file')
        git('commit', '-m', 'initial')
        initial = git('rev-parse', 'HEAD').stdout.strip()
        self.assertEqual(self.run_cli('task', 'create', '--id', 'packet', '--goal', 'goal',
                                     '--acceptance', 'works', '--scope', 'file')[0], 0)
        (self.project / 'file').write_text('advanced')
        git('add', 'file')
        git('commit', '-m', 'advance head')

        code, _, error = self.run_cli('worktree', 'create', '--id', 'packet', '--base', 'HEAD')
        self.assertEqual(code, 2)
        self.assertIn('code_base_revision does not match requested base', error)
        self.assertFalse((r.local_root(self.project, self.home) / 'worktrees/packet').exists())
        self.assertEqual(git('branch', '--list', 'harness/packet').stdout.strip(), '')

        code, result, error = self.run_cli('worktree', 'create', '--id', 'packet', '--base', initial)
        self.assertEqual(code, 0, error)
        self.assertEqual(result['base_revision'], initial)
        self.assertTrue(Path(result['path']).exists())

        code, result, error = self.run_cli('worktree', 'create', '--id', 'integration', '--base', 'HEAD')
        self.assertEqual(code, 0, error)
        self.assertTrue(Path(result['path']).exists())

    def test_worktree_rejects_malformed_same_id_packet_without_mutation(self):
        def git(*args):
            return subprocess.run(['git', '-C', str(self.project), *args], check=True, capture_output=True, text=True)
        git('init')
        git('config', 'user.name', 'Test')
        git('config', 'user.email', 'test@example.invalid')
        (self.project / 'file').write_text('initial')
        git('add', 'file')
        git('commit', '-m', 'initial')
        packet = self.project / 'docs/harness/tasks/malformed.json'
        packet.parent.mkdir(parents=True)
        packet.write_text('[]')

        code, _, error = self.run_cli('worktree', 'create', '--id', 'malformed', '--base', 'HEAD')
        self.assertEqual(code, 2)
        self.assertIn('packet must be an object', error)
        self.assertFalse((r.local_root(self.project, self.home) / 'worktrees/malformed').exists())
        self.assertEqual(git('branch', '--list', 'harness/malformed').stdout.strip(), '')


if __name__ == '__main__':
    unittest.main()
