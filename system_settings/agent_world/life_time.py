"""现有项目 USE_TZ=False；内部上海 aware 时间，持久化遵循 Django 配置。"""
from zoneinfo import ZoneInfo
from django.conf import settings
from django.utils import timezone

SHANGHAI=ZoneInfo('Asia/Shanghai')


def local_time(value=None):
    value=value or timezone.now()
    return value.replace(tzinfo=SHANGHAI) if timezone.is_naive(value) else value.astimezone(SHANGHAI)


def storage_time(value):
    value=local_time(value)
    return value if settings.USE_TZ else timezone.make_naive(value,SHANGHAI)
