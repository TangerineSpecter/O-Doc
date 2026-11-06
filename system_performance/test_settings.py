"""No schedulers, no SQLite fallback. Database URL is explicitly supplied by the runner."""
import os
from pathlib import Path
from urllib.parse import urlparse, unquote

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = 'performance-isolated-test-only'
USE_TZ = True
TIME_ZONE = 'Asia/Shanghai'
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'rest_framework', 'system_performance.apps.PerformanceConfig']
ROOT_URLCONF = 'system_performance.urls'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [],
    'DEFAULT_RENDERER_CLASSES': ['djangorestframework_camel_case.render.CamelCaseJSONRenderer'],
    'DEFAULT_PARSER_CLASSES': ['djangorestframework_camel_case.parser.CamelCaseJSONParser'],
}
url = urlparse(os.getenv('DATABASE_URL', 'postgresql://unused@127.0.0.1:1/unused'))
assert url.scheme in {'postgres', 'postgresql'}
DATABASES = {'default': dict(ENGINE='django.db.backends.postgresql', NAME=unquote(url.path.lstrip('/')),
                             USER=unquote(url.username or ''), PASSWORD=unquote(url.password or ''),
                             HOST=url.hostname, PORT=url.port or 5432)}
