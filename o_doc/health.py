import json
import os
import re
from pathlib import Path

from django.conf import settings
from django.db import DatabaseError, connection
from django.http import JsonResponse


_BUILD_COMMIT_PATTERN = re.compile(r'^[0-9a-f]{40}$', re.IGNORECASE)


def get_current_app_version():
    package_file = Path(settings.BASE_DIR) / 'frontend_react' / 'package.json'
    try:
        with package_file.open('r', encoding='utf-8') as file_obj:
            package = json.load(file_obj)
    except (OSError, ValueError):
        return 'unknown'

    version = package.get('version') if isinstance(package, dict) else None
    return str(version).strip() if version else 'unknown'


def get_current_build_commit():
    value = str(os.getenv('ODOC_BUILD_COMMIT', '')).strip().lower()
    return value if _BUILD_COMMIT_PATTERN.fullmatch(value) else ''


def health_check(_request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        healthy = True
    except DatabaseError:
        healthy = False

    return JsonResponse({
        'ok': healthy,
        'version': get_current_app_version(),
        'commit': get_current_build_commit(),
    }, status=200 if healthy else 503)
