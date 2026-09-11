from django.db import DatabaseError, connection
from django.http import JsonResponse

from system_settings.update_service import get_current_app_version, get_current_build_commit


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
