"""Decision connection metadata syncs; credentials stay on the current device."""
import re
import uuid
from urllib.parse import urlsplit

from django.db import transaction

from system_settings.models import SystemSetting

CREDENTIAL_KEY = 'system_decision_credentials'
CONNECTIONS_KEY = 'system_decision_connections'
PROVIDER = 'jev'
PROTOCOLS = {'systemone', 'openai_chat_json'}
MAX_CONNECTIONS = 50

BUILTIN_JEV = {
    'id': PROVIDER,
    'name': 'JEV',
    'protocol': 'systemone',
    'base_url': 'https://api.typesafe.ai/v1',
    'model_id': 'jev-latest',
    'built_in': True,
}


def _setting_value(key: str) -> dict:
    row = SystemSetting.objects.filter(pk=key).first()
    return dict(row.value or {}) if row and isinstance(row.value, dict) else {}


def api_key(owner: str, connection_id: str = PROVIDER) -> str:
    owner_values = _setting_value(CREDENTIAL_KEY).get(owner, {})
    if not isinstance(owner_values, dict):
        return ''
    # Keep the original JEV entry readable so existing installations need no migration.
    if connection_id == PROVIDER:
        value = owner_values.get(PROVIDER, '')
    else:
        values = owner_values.get('connections', {})
        value = values.get(connection_id, '') if isinstance(values, dict) else ''
    return value if isinstance(value, str) else ''


def _profiles(owner: str) -> list[dict]:
    value = _setting_value(CONNECTIONS_KEY).get(owner, [])
    if not isinstance(value, list):
        return []
    profiles = []
    for item in value:
        if (not isinstance(item, dict) or item.get('id') == PROVIDER
                or not isinstance(item.get('id'), str)
                or not re.fullmatch(r'dc_[a-f0-9]{16}', item['id'])):
            continue
        try:
            normalized = _validate_profile({key: item.get(key) for key in ('name', 'protocol', 'base_url', 'model_id')})
        except ValueError:
            continue
        profiles.append({'id': item['id'], **normalized})
    return profiles


def connection(owner: str, connection_id: str = PROVIDER) -> dict:
    if connection_id == PROVIDER:
        return dict(BUILTIN_JEV)
    for item in _profiles(owner):
        if item.get('id') == connection_id:
            return dict(item)
    raise ValueError('决策模型连接不存在')


def public_config(owner: str) -> dict:
    rows = [BUILTIN_JEV, *_profiles(owner)]
    connections = []
    for item in rows:
        built_in = item.get('built_in') is True
        secret_present = bool(api_key(owner, item['id']))
        connections.append({
            'id': item['id'],
            'name': item['name'],
            'protocol': item['protocol'],
            'base_url': item['base_url'],
            'model_id': item['model_id'],
            'built_in': built_in,
            'configured': secret_present if built_in else bool(item.get('base_url') and item.get('model_id')),
            'api_key_configured': secret_present,
        })
    return {'providers': connections, 'connections': connections}


@transaction.atomic
def save_key(owner: str, secret: str | None, connection_id: str = PROVIDER) -> None:
    if connection_id != PROVIDER and secret:
        connection(owner, connection_id)
    row, _ = SystemSetting.objects.get_or_create(pk=CREDENTIAL_KEY, defaults={'value': {}})
    row = SystemSetting.objects.select_for_update().get(pk=row.pk)
    values = dict(row.value or {})
    owner_values = dict(values.get(owner) or {})
    if connection_id == PROVIDER:
        if secret:
            owner_values[PROVIDER] = secret
        else:
            owner_values.pop(PROVIDER, None)
    else:
        credentials = dict(owner_values.get('connections') or {})
        if secret:
            credentials[connection_id] = secret
        else:
            credentials.pop(connection_id, None)
        if credentials:
            owner_values['connections'] = credentials
        else:
            owner_values.pop('connections', None)
    if owner_values:
        values[owner] = owner_values
    else:
        values.pop(owner, None)
    row.value = values
    row.save(update_fields=['value'])


def _validate_profile(value: dict, existing: dict | None = None) -> dict:
    if not isinstance(value, dict):
        raise ValueError('决策连接配置须为对象')
    allowed = {'name', 'protocol', 'base_url', 'model_id'}
    if set(value) - allowed:
        raise ValueError('决策连接包含未知字段')
    merged = {**(existing or {}), **value}
    name = merged.get('name')
    protocol = merged.get('protocol')
    base_url = merged.get('base_url')
    model_id = merged.get('model_id')
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        raise ValueError('连接名称须为 1 到 80 个字符')
    if protocol not in PROTOCOLS:
        raise ValueError('请选择支持的决策协议')
    if not isinstance(base_url, str) or len(base_url.strip()) > 2048:
        raise ValueError('服务地址无效')
    base_url = base_url.strip().rstrip('/')
    parsed = urlsplit(base_url)
    if (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment):
        raise ValueError('服务地址须为不含账号、查询参数或片段的 HTTP(S) 地址')
    if not isinstance(model_id, str) or not model_id.strip() or len(model_id.strip()) > 160:
        raise ValueError('模型 ID 须为 1 到 160 个字符')
    return {
        'name': name.strip(),
        'protocol': protocol,
        'base_url': base_url,
        'model_id': model_id.strip(),
    }


@transaction.atomic
def save_connection(owner: str, value: dict, *, connection_id: str | None = None,
                    secret: str | None = None, update_secret: bool = False) -> dict:
    row, _ = SystemSetting.objects.get_or_create(pk=CONNECTIONS_KEY, defaults={'value': {}})
    row = SystemSetting.objects.select_for_update().get(pk=row.pk)
    values = dict(row.value or {})
    profiles = _profiles(owner)
    existing = next((item for item in profiles if item.get('id') == connection_id), None) if connection_id else None
    if connection_id and not existing:
        raise ValueError('决策模型连接不存在')
    profile = _validate_profile(value, existing)
    if existing:
        profile = {'id': connection_id, **profile}
        profiles = [profile if item.get('id') == connection_id else item for item in profiles]
    else:
        if len(profiles) >= MAX_CONNECTIONS:
            raise ValueError('决策模型连接数量已达上限')
        identity = 'dc_' + uuid.uuid4().hex[:16]
        profile = {'id': identity, **profile}
        profiles.append(profile)
    values[owner] = profiles
    row.value = values
    row.save(update_fields=['value'])
    if update_secret:
        if secret is not None and (not isinstance(secret, str) or len(secret) > 255):
            raise ValueError('API Key 无效')
        save_key(owner, secret.strip() if secret else None, profile['id'])
    return public_config(owner)


@transaction.atomic
def delete_connection(owner: str, connection_id: str) -> dict:
    if connection_id == PROVIDER:
        raise ValueError('JEV 内置连接不能删除')
    row = SystemSetting.objects.select_for_update().filter(pk=CONNECTIONS_KEY).first()
    if not row:
        raise ValueError('决策模型连接不存在')
    profiles = _profiles(owner)
    if not any(item.get('id') == connection_id for item in profiles):
        raise ValueError('决策模型连接不存在')
    # Remove the credential while the profile still exists; adding a key to an
    # unknown connection remains rejected by save_key above.
    save_key(owner, None, connection_id)
    values = dict(row.value or {})
    remaining = [item for item in profiles if item.get('id') != connection_id]
    if remaining:
        values[owner] = remaining
    else:
        values.pop(owner, None)
    row.value = values
    row.save(update_fields=['value'])
    from system_settings.agent_world.life_models import LifeConfig
    life = LifeConfig.objects.filter(pk=owner).first()
    if life and (life.settings or {}).get('decision_connection_id') == connection_id:
        life.settings = {**(life.settings or {}), 'decision_connection_id': PROVIDER}
        life.save(update_fields=['settings'])
    return public_config(owner)


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


def selected_connection_id(owner: str | None) -> str:
    if not owner:
        return PROVIDER
    from system_settings.agent_world.life_models import LifeConfig
    settings = LifeConfig.objects.filter(pk=owner).values_list('settings', flat=True).first() or {}
    value = settings.get('decision_connection_id', PROVIDER)
    return value if isinstance(value, str) and value else PROVIDER
