"""Run only performance tests in rollback-only schemas of the existing local PostgreSQL.

Confirm the existing container is healthy first. This script never creates a database,
falls back to SQLite, reads business tables, or initializes production schedulers.
"""
import os
import sys
import unittest
from pathlib import Path
from urllib.parse import quote

root = Path(__file__).resolve().parent.parent
config = {}
env_file = Path(os.getenv('ODOC_DEV_ENV_FILE', str(root / 'deploy/.env')))
for line in env_file.read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        key, value = line.split('=', 1)
        config[key.strip()] = value.strip().strip('"\'')
if not all(config.get(key) for key in ('POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB')):
    raise SystemExit('缺少既有 PostgreSQL 连接配置；请提供 ODOC_DEV_ENV_FILE，不会回退 SQLite。')
port = config.get('POSTGRES_HOST_PORT', '15432')
os.environ['DATABASE_URL'] = (
    'postgresql://' + quote(config['POSTGRES_USER'], safe='') + ':'
    + quote(config['POSTGRES_PASSWORD'], safe='') + '@127.0.0.1:' + port + '/'
    + quote(config['POSTGRES_DB'], safe='')
)
os.environ['DJANGO_SETTINGS_MODULE'] = 'system_performance.test_settings'
sys.path.insert(0, str(root))
import psycopg
with psycopg.connect(os.environ['DATABASE_URL'], connect_timeout=3) as conn:
    with conn.cursor() as cursor:
        cursor.execute('SELECT 1')
        assert cursor.fetchone() == (1,)
import django
django.setup()
suite = unittest.defaultTestLoader.loadTestsFromName('system_performance.integration_tests')
result = unittest.TextTestRunner(verbosity=2).run(suite)
raise SystemExit(not result.wasSuccessful())
