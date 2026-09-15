"""Explicitly isolated database/media and disabled background workers for tests."""
import os
import tempfile
from pathlib import Path

for name in ('BOOK_ANALYSIS', 'WEBDAV_SCHEDULER', 'ARTICLE_RAG_SCHEDULER', 'AGENT_TASK_SCHEDULER', 'AGENT_MEMORY_SCHEDULER', 'RUNTIME_TRACKER', 'FEISHU_IM_WS'):
    os.environ[f'ODOC_ENABLE_{name}'] = 'false'
    os.environ[f'ODOC_FORCE_{name}'] = 'false'
os.environ.pop('RUN_MAIN', None)
_runtime = tempfile.TemporaryDirectory(prefix='odoc-book-tests-')
os.environ['ODOC_CHROMA_PATH'] = str(Path(_runtime.name) / 'chroma')
os.environ['DJANGO_MEDIA_ROOT'] = str(Path(_runtime.name) / 'media')
os.environ['DJANGO_DB_PATH'] = ':memory:'

from o_doc.settings import *  # noqa: F403,E402

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
MEDIA_ROOT = Path(_runtime.name) / 'media'
CHROMA_DB_PATH = Path(_runtime.name) / 'chroma'
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
SILENCED_SYSTEM_CHECKS = ['fields.W163', 'models.W046']
