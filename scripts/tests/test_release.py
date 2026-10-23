"""Release recovery checks using isolated local repositories; no GitHub access."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'release.sh'


class ReleaseRecoveryTest(unittest.TestCase):
    def test_push_failure_and_same_version_retry(self):
        for rejected_ref in ('refs/heads/master', 'refs/tags/v1.5.2'):
            with self.subTest(rejected_ref=rejected_ref), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                repo = root / 'repo'
                remote = root / 'remote.git'
                repo.mkdir()
                env = dict(os.environ, GIT_CONFIG_NOSYSTEM='1',
                           GIT_CONFIG_GLOBAL=os.devnull, GIT_TERMINAL_PROMPT='0')

                def run(*args, cwd=repo, check=True, input=None):
                    return subprocess.run(args, cwd=cwd, env=env, input=input,
                                          text=True, capture_output=True, check=check)

                def git(*args, cwd=repo):
                    return run('git', *args, cwd=cwd).stdout.strip()

                git('init', '--initial-branch=master')
                git('config', 'user.name', 'Release Test')
                git('config', 'user.email', 'release@example.invalid')
                git('config', 'commit.gpgsign', 'false')
                git('config', 'tag.gpgsign', 'false')
                git('init', '--bare', str(remote))
                git('remote', 'add', 'origin', str(remote))
                (repo / 'scripts').mkdir()
                shutil.copy2(SCRIPT, repo / 'scripts/release.sh')
                frontend = repo / 'frontend_react'
                frontend.mkdir()
                (frontend / 'package.json').write_text(json.dumps({'version': '1.5.1'}) + '\n')
                (frontend / 'package-lock.json').write_text(json.dumps({
                    'version': '1.5.1', 'packages': {'': {'version': '1.5.1'}}}) + '\n')
                (repo / 'README.md').write_text('https://img.shields.io/badge/version-1.5.1-blue.svg\n')
                git('add', '.')
                git('commit', '-m', 'initial')
                git('push', 'origin', 'master')
                initial = git('rev-parse', 'HEAD')
                hook = remote / 'hooks/update'
                hook.write_text('#!/bin/sh\n[ "$1" != "' + rejected_ref + '" ]\n')
                hook.chmod(0o755)
                failed = run('bash', 'scripts/release.sh', '1.5.2', check=False)
                self.assertNotEqual(failed.returncode, 0, failed.stdout)
                target = git('rev-parse', 'HEAD')
                tag = git('rev-parse', 'v1.5.2')
                self.assertNotEqual(target, initial)
                self.assertEqual(git('tag', cwd=remote), '')
                self.assertEqual(git('rev-parse', 'master', cwd=remote),
                                 initial if rejected_ref.startswith('refs/heads') else target)
                hook.unlink()
                retried = run('bash', 'scripts/release.sh', '1.5.2', input='y\n')
                self.assertIn('发布完成', retried.stdout)
                self.assertEqual(git('rev-parse', 'master', cwd=remote), target)
                self.assertEqual(git('rev-parse', 'v1.5.2^{commit}', cwd=remote), target)
                self.assertEqual(git('rev-parse', 'v1.5.2'), tag)
                run('bash', 'scripts/release.sh', '1.5.2', input='y\n')
                self.assertEqual(git('rev-parse', 'HEAD'), target)
                self.assertEqual(git('rev-parse', 'v1.5.2', cwd=remote), tag)


if __name__ == '__main__':
    unittest.main()
