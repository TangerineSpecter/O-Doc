"""Decision connection metadata and credentials participate in account sync."""
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

PROFILE_ID = re.compile(r'^(?:jev|dc_[a-f0-9]{16})$')
# Historical installs stored only a JEV key. The endpoint and model are the
# values that connection used before it became an ordinary saved profile.
LEGACY_JEV_PROFILE = {
    'id': PROVIDER,
    'name': 'JEV',
    'protocol': 'systemone',
    'base_url': 'https://api.typesafe.ai/v1',
    'model_id': 'jev-latest',
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
        if not isinstance(item, dict) or not isinstance(item.get('id'), str) or PROFILE_ID.fullmatch(item['id']) is None:
            continue
        try:
            normalized = _validate_profile({key: item.get(key) for key in ('name', 'protocol', 'base_url', 'model_id')})
        except ValueError:
            continue
        profiles.append({'id': item['id'], **normalized})
    return profiles


@transaction.atomic
def materialize_legacy_jev(owner: str) -> None:
    """Turn a saved historical JEV key into a normal connection profile.

    Accounts that never stored a key get nothing. Repeating this does not
    overwrite a profile the user has already edited or deleted.
    """
    if not api_key(owner, PROVIDER):
        return
    row, _ = SystemSetting.objects.get_or_create(pk=CONNECTIONS_KEY, defaults={'value': {}})
    row = SystemSetting.objects.select_for_update().get(pk=row.pk)
    values = dict(row.value or {})
    profiles = values.get(owner)
    if not isinstance(profiles, list):
        profiles = []
    if any(isinstance(item, dict) and item.get('id') == PROVIDER for item in profiles):
        return
    values[owner] = [*profiles, dict(LEGACY_JEV_PROFILE)]
    row.value = values
    row.save(update_fields=['value'])


def connection(owner: str, connection_id: str = PROVIDER) -> dict:
    if connection_id == PROVIDER:
        materialize_legacy_jev(owner)
    for item in _profiles(owner):
        if item.get('id') == connection_id:
            return dict(item)
    raise ValueError('决策模型连接不存在')


def public_config(owner: str) -> dict:
    materialize_legacy_jev(owner)
    connections = []
    for item in _profiles(owner):
        secret_present = bool(api_key(owner, item['id']))
        connections.append({
            'id': item['id'],
            'name': item['name'],
            'protocol': item['protocol'],
            'base_url': item['base_url'],
            'model_id': item['model_id'],
            'built_in': False,
            'configured': bool(item.get('base_url') and item.get('model_id')),
            'api_key_configured': secret_present,
        })
    from .failover import public_status
    return {'providers': connections, 'connections': connections, 'failover': public_status(owner)}


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
    if connection_id == PROVIDER and secret:
        materialize_legacy_jev(owner)


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
    from .failover import forget_connection
    forget_connection(owner, connection_id)
    return public_config(owner)


def market_config(value: dict, previous: dict | None = None) -> dict:
    """Retain omitted decision fields; return the automation switch only when submitted."""
    if not isinstance(value, dict):
        raise ValueError('市场配置须为对象')
    # camelCase 解析会把末尾的 V2 拆成 v_2，这里统一回写实际配置键。
    value = {'market_automation_v2' if key == 'market_automation_v_2' else key: item
             for key, item in value.items()}
    if set(value) - {'owner_id', 'decision_enabled', 'decision_provider', 'market_automation_v2'}:
        raise ValueError('市场配置包含未知字段')
    result = {**(previous or {}), **value}
    enabled = result.get('decision_enabled', False)
    provider = result.get('decision_provider', PROVIDER)
    # 自动化开关只处理本次请求明确提交的值，不能把任务镜像旧值回写到 LifeConfig。
    automation_submitted = 'market_automation_v2' in value
    automation = value.get('market_automation_v2')
    if type(enabled) is not bool or provider != PROVIDER:
        raise ValueError('市场决策配置无效，目前仅支持 JEV')
    if automation_submitted and type(automation) is not bool:
        raise ValueError('市场自动化开关无效')
    data = {'decision_enabled': enabled, 'decision_provider': provider}
    if automation_submitted:
        data['market_automation_v2'] = automation
    return data


def selected_connection_id(owner: str | None) -> str:
    if not owner:
        return ''
    from system_settings.agent_world.life_models import LifeConfig
    settings = LifeConfig.objects.filter(pk=owner).values_list('settings', flat=True).first()
    if not isinstance(settings, dict) or 'decision_connection_id' not in settings:
        return PROVIDER if api_key(owner, PROVIDER) else ''
    value = settings.get('decision_connection_id') or ''
    return value if isinstance(value, str) else ''
