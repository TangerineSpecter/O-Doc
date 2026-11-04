"""The installer must retain the configuration needed for protected backfill."""
import os
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase


class CombatDailyDeployTests(SimpleTestCase):
    def test_generated_compose_keeps_backfill_flags_and_observability_mounts(self):
        with tempfile.TemporaryDirectory(prefix='odoc-compose-test-') as temp:
            env = {**os.environ, 'ODOC_DEPLOY_DIR': temp}
            source = (Path(settings.BASE_DIR) / 'manager.sh').read_text()
            prefix, separator, _ = source.partition('\ncase "${1:-menu}" in\n')
            self.assertTrue(separator, '部署脚本入口结构已变化，需要更新测试')
            functions = Path(temp) / 'manager-functions.sh'
            functions.write_text(prefix)
            script = '''source "$1"
ensure_directories
write_compose_file'''
            subprocess.run(['bash', '-c', script, 'odoc-test', str(functions)],
                           env=env, check=True, capture_output=True, text=True)
            compose = (Path(temp) / 'compose.prod.yml').read_text()
            for name in ('ODOC_COMBAT_BACKFILL_PROTECT', 'ODOC_COMBAT_DAILY_BACKFILL',
                         'ODOC_COMBAT_DAILY_AUTO', 'ODOC_FISHING_DAILY_BACKFILL'):
                self.assertIn(f'{name}: ${{{name}:-', compose)
            self.assertIn('ODOC_COMBAT_DAILY_AUTO: ${ODOC_COMBAT_DAILY_AUTO:-1}', compose)
            for name in ('system_logs', 'token_usage_details'):
                self.assertIn(f'./runtime/{name}:/app/runtime/{name}', compose)
                self.assertTrue((Path(temp) / 'runtime' / name).is_dir())
