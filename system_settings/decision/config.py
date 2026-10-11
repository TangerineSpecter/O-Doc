"""Credentials are account-scoped and device-local; never return the secret."""
from django.db import transaction
from system_settings.models import SystemSetting

CREDENTIAL_KEY = 'system_decision_credentials'
PROVIDER = 'jev'


def api_key(owner: str) -> str:
    row = SystemSetting.objects.filter(pk=CREDENTIAL_KEY).first()
    return (row.value or {}).get(owner, {}).get(PROVIDER, '') if row else ''


def public_config(owner: str) -> dict:
    return {'providers': [{'id': PROVIDER, 'name': 'JEV', 'configured': bool(api_key(owner))}]}


@transaction.atomic
def save_key(owner: str, secret: str | None) -> None:
    row, _ = SystemSetting.objects.get_or_create(pk=CREDENTIAL_KEY, defaults={'value': {}})
    row = SystemSetting.objects.select_for_update().get(pk=row.pk)
    values = dict(row.value or {})
    if secret:
        values[owner] = {PROVIDER: secret}
    else:
        values.pop(owner, None)
    row.value = values
    row.save(update_fields=['value'])


def market_config(value: dict, previous: dict | None = None) -> dict:
    """Missing PATCH fields retain settings; owner is always supplied by the caller."""
    if not isinstance(value, dict):
        raise ValueError('市场配置须为对象')
    if set(value) - {'owner_id', 'decision_enabled', 'decision_provider'}:
        raise ValueError('市场配置包含未知字段')
    result = {**(previous or {}), **value}
    enabled = result.get('decision_enabled', False)
    provider = result.get('decision_provider', PROVIDER)
    if type(enabled) is not bool or provider != PROVIDER:
        raise ValueError('市场决策配置无效，目前仅支持 JEV')
    return {'decision_enabled': enabled, 'decision_provider': provider}
