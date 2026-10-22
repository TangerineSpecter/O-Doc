"""世界共用体力恢复规则；按生效时间分段，避免调速追溯改写余额。"""
from datetime import datetime
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from system_settings.models import SystemSetting
from .life_time import local_time

SETTING_KEY = 'system_world_stamina'
DEFAULT_RATE = 5


def validate_rate(value: object) -> int:
    if type(value) is not int or not 0 <= value <= 100:
        raise ValueError('每小时恢复量须为 0～100 的整数')
    return value


def validate_history(value: object) -> list[dict]:
    if not isinstance(value, list):
        raise ValueError('体力恢复设置格式无效')
    previous = None
    for row in value:
        if not isinstance(row, dict) or set(row) != {'effective_at', 'recovery_per_hour'}:
            raise ValueError('体力恢复设置记录无效')
        validate_rate(row['recovery_per_hour'])
        try:
            at = datetime.fromisoformat(row['effective_at'])
        except (ValueError, TypeError):
            raise ValueError('体力恢复设置生效时间无效') from None
        if timezone.is_naive(at) or (previous is not None and at <= previous):
            raise ValueError('体力恢复设置生效时间须按顺序排列并包含时区')
        previous = at
    return value


def history() -> list[dict]:
    value = SystemSetting.objects.filter(pk=SETTING_KEY).values_list('value', flat=True).first()
    return validate_history(value if value is not None else [])


def public_settings() -> dict:
    rows = history()
    now = local_time()
    rate = DEFAULT_RATE
    for row in rows:
        if datetime.fromisoformat(row['effective_at']) <= now:
            rate = row['recovery_per_hour']
    return {'recovery_per_hour': rate, 'max_stamina': 100}


@transaction.atomic
def save_rate(rate: object) -> dict:
    rate = validate_rate(rate)
    setting, _ = SystemSetting.objects.get_or_create(pk=SETTING_KEY, defaults={'value': []})
    setting = SystemSetting.objects.select_for_update().get(pk=setting.pk)
    rows = validate_history(setting.value)
    if (rows[-1]['recovery_per_hour'] if rows else DEFAULT_RATE) != rate:
        now = local_time()
        if rows and datetime.fromisoformat(rows[-1]['effective_at']) >= now:
            raise ValueError('已有未来生效的体力设置，请校准设备时间后重试')
        setting.value = [*rows, {'effective_at': now.isoformat(), 'recovery_per_hour': rate}]
        setting.save(update_fields=['value'])
    return public_settings()


def recovered_between(start: datetime, end: datetime, rows: list[dict]) -> Decimal:
    start, end = local_time(start), local_time(end)
    if end <= start:
        return Decimal('0')
    rate, total, cursor = DEFAULT_RATE, Decimal('0'), start
    for row in rows:
        at = datetime.fromisoformat(row['effective_at'])
        if at <= start:
            rate = row['recovery_per_hour']
        elif at < end:
            total += Decimal(str((at - cursor).total_seconds())) * rate / 3600
            cursor, rate = at, row['recovery_per_hour']
        else:
            break
    return total + Decimal(str((end - cursor).total_seconds())) * rate / 3600


def validate_snapshot(data: list[dict]) -> None:
    for row in data:
        if row.get('model') == 'system_settings.systemsetting' and row.get('pk') == SETTING_KEY:
            validate_history(row['fields'].get('value'))
