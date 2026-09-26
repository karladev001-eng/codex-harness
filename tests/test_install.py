import argparse
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[1] / 'plugins/codex-harness/skills/harness/runtime_install.py'
spec = importlib.util.spec_from_file_location('runtime_install', MODULE)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='harness home ')
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.args = argparse.Namespace(home=str(self.home), skills_dir=None)
        self.codex = self.home / '.codex'
        self.agents = self.codex / 'AGENTS.md'

    def prepare_agents(self, text):
        self.codex.mkdir(parents=True, exist_ok=True)
        self.agents.write_bytes(text.encode('utf-8'))

    def complete_source(self):
        source = self.home / 'release/skill'
        shutil.copytree(MODULE.parent, source, ignore=shutil.ignore_patterns('__pycache__'))
        return source

    def test_install_idempotent_uninstall_preserves_content_settings(self):
        original = '# User instructions\r\nKeep these bytes.'
        self.prepare_agents(original)
        settings = self.codex / 'harness/settings.json'
        settings.parent.mkdir()
        settings.write_text('{"enabled": false}')
        result = installer.install(self.args)
        target = Path(result['target'])
        self.assertTrue((target / 'runtime.py').is_file())
        self.assertTrue((target / 'assets/defaults.json').is_file())
        before = self.agents.stat().st_mtime_ns
        self.assertEqual(installer.install(self.args)['status'], 'unchanged')
        self.assertEqual(before, self.agents.stat().st_mtime_ns)
        self.agents.write_bytes(self.agents.read_bytes() + b'Additional user instruction.\n')
        installer.uninstall(self.args)
        self.assertEqual(self.agents.read_bytes().decode(), original + 'Additional user instruction.\n')
        self.assertEqual(settings.read_text(), '{"enabled": false}')
        self.assertFalse(target.exists())
        self.assertEqual(installer.uninstall(self.args)['status'], 'not_installed')

    def test_new_agents_removed(self):
        installer.install(self.args)
        installer.uninstall(self.args)
        self.assertFalse(self.agents.exists())

    def test_user_edits_block_update_and_uninstall(self):
        result = installer.install(self.args)
        skill = Path(result['target']) / 'SKILL.md'
        skill.write_text(skill.read_text() + '\nUser edit\n')
        for operation in (installer.install, installer.uninstall):
            with self.assertRaisesRegex(ValueError, 'user changes'):
                operation(self.args)
        self.assertIn('User edit', skill.read_text())

    def test_managed_agents_edits_block(self):
        installer.install(self.args)
        self.agents.write_text(self.agents.read_text().replace('For coding requests', 'Edited'))
        with self.assertRaisesRegex(ValueError, 'edited'):
            installer.uninstall(self.args)

    def test_unowned_collision(self):
        target = self.home / '.agents/skills/codex-harness'
        target.mkdir(parents=True)
        (target / 'user.txt').write_text('mine')
        with self.assertRaisesRegex(ValueError, 'Unowned'):
            installer.install(self.args)
        self.assertFalse(self.codex.exists())

    def test_custom_codex_home_and_default_skill_home(self):
        custom = self.home / 'custom codex'
        args = argparse.Namespace(home=None, skills_dir=None)
        with patch.dict(os.environ, {'CODEX_HOME': str(custom)}), patch.object(Path, 'home', return_value=self.home):
            result = installer.install(args)
            self.assertEqual(Path(result['target']), self.home / '.agents/skills/codex-harness')
            self.assertTrue((custom / 'AGENTS.md').exists())
            installer.uninstall(args)

    def test_home_overrides_environment_and_explicit_skills_dir(self):
        self.args.skills_dir = str(self.home / 'my skills')
        with patch.dict(os.environ, {'CODEX_HOME': str(self.home / 'wrong')}):
            result = installer.install(self.args)
        self.assertEqual(Path(result['target']), self.home / 'my skills/codex-harness')
        self.assertFalse((self.home / 'wrong').exists())
        self.args.skills_dir = None
        self.assertEqual(installer.install(self.args)['status'], 'unchanged')
        installer.uninstall(self.args)

    def test_update_backs_up_previous_version(self):
        installer.install(self.args)
        manifest = self.codex / 'harness/install.json'
        state = json.loads(manifest.read_text())
        target = Path(state['target'])
        # Simulate a previously installed, valid older release.
        (target / 'old-release.txt').write_text('old')
        state['files'] = installer.inventory(target)
        manifest.write_text(json.dumps(state))
        result = installer.install(self.args)
        self.assertEqual(result['status'], 'installed')
        self.assertTrue((Path(result['backup']) / 'skill/old-release.txt').exists())
        self.assertFalse((target / 'old-release.txt').exists())

    def test_added_user_file_is_preserved_by_refusal(self):
        result = installer.install(self.args)
        user_file = Path(result['target']) / 'notes.txt'
        user_file.write_text('notes')
        with self.assertRaises(ValueError):
            installer.uninstall(self.args)
        self.assertEqual(user_file.read_text(), 'notes')

    def test_override_refused_without_mutation(self):
        self.codex.mkdir()
        (self.codex / 'AGENTS.override.md').write_text('User override')
        with self.assertRaisesRegex(ValueError, 'shadow'):
            installer.install(self.args)
        self.assertFalse(self.agents.exists())
        self.assertFalse((self.home / '.agents').exists())

    def test_copied_runtime_works_outside_repository(self):
        result = installer.install(self.args)
        completed = subprocess.run([sys.executable, str(Path(result['target']) / 'runtime.py'),
                                    'status', '--project', str(self.home), '--home', str(self.home)],
                                   cwd=str(self.home), capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertTrue(json.loads(completed.stdout)['active'])
        # Python's generated bytecode must not make uninstall look user-modified.
        installer.uninstall(self.args)

    def test_failed_manifest_write_rolls_back_first_install(self):
        original = 'Original instructions'
        self.prepare_agents(original)
        original_write = Path.write_text
        def fail_manifest(path, *args, **kwargs):
            if path == self.codex / 'harness/install.json':
                raise OSError('simulated manifest failure')
            return original_write(path, *args, **kwargs)
        with patch.object(Path, 'write_text', fail_manifest):
            with self.assertRaisesRegex(OSError, 'simulated'):
                installer.install(self.args)
        self.assertEqual(self.agents.read_text(), original)
        self.assertFalse((self.home / '.agents/skills/codex-harness').exists())

    def test_source_target_overlap_refused_before_mutation(self):
        source = self.complete_source()
        module_path = source / 'runtime_install.py'
        self.args.skills_dir = str(source / 'nested')
        before = sorted(str(p) for p in self.home.rglob('*'))
        with patch.object(installer, '__file__', str(module_path)):
            with self.assertRaisesRegex(ValueError, 'overlap'):
                installer.install(self.args)
        self.assertEqual(before, sorted(str(p) for p in self.home.rglob('*')))

    def test_incomplete_source_is_refused_before_backup_or_mutation(self):
        for required in installer.REQUIRED_SOURCE_FILES:
            with self.subTest(required=required):
                source = self.complete_source()
                (source / required).unlink()
                self.prepare_agents('Original instructions')
                self.args.skills_dir = str(self.home / 'installed skills')
                before = sorted(str(path.relative_to(self.home)) for path in self.home.rglob('*'))
                with patch.object(installer, '__file__', str(source / 'runtime_install.py')):
                    with self.assertRaisesRegex(ValueError, 'Source skill is incomplete'):
                        installer.install(self.args)
                self.assertEqual(before, sorted(str(path.relative_to(self.home)) for path in self.home.rglob('*')))
                self.assertEqual(self.agents.read_text(), 'Original instructions')
                shutil.rmtree(source)


if __name__ == '__main__':
    unittest.main()
