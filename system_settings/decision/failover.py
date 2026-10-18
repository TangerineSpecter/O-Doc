"""Ordered decision-connection failover and this device's sticky preference.

A later connection that succeeds is preferred on this machine until the
configured TTL. The preference is local because a local model such as
startlux-decision can be down on one device while another device's primary
is healthy. It is not a world setting and does not sync.
"""
import logging
import re
import time
from datetime import datetime, timezone as datetime_timezone

from django.db import transaction
from django.utils import timezone

from system_settings.models import SystemSetting

logger = logging.getLogger(__name__)

STICKY_KEY = 'system_decision_sticky'
CONNECTION_ID = re.compile(r'^(?:jev|dc_[a-f0-9]{16})$')
MAX_FAILOVER = 8
DEFAULT_STICKY_TTL_SECONDS = 2 * 60 * 60
ALLOWED_STICKY_TTLS = (60 * 60, 2 * 60 * 60, 4 * 60 * 60)
STICKY_DESCRIPTION = '本机决策模型暂时沿用状态，不参与同步'


def _valid_id(value) -> bool:
    return isinstance(value, str) and CONNECTION_ID.fullmatch(value) is not None


def align_settings(settings: dict) -> dict:
    """Keep the selected connection first in the failover order."""
    primary = settings.get('decision_connection_id') or 'jev'
    if not _valid_id(primary):
        primary = 'jev'
    raw = settings.get('decision_connection_ids') or []
    rest = []
    if isinstance(raw, list):
        for item in raw:
            if item != primary and item not in rest and _valid_id(item):
                rest.append(item)
    ordered = [primary, *rest][:MAX_FAILOVER]
    settings['decision_connection_id'] = ordered[0]
    settings['decision_connection_ids'] = ordered
    return settings


def _settings(owner: str) -> dict:
    from system_settings.agent_world.life_models import LifeConfig
    settings = LifeConfig.objects.filter(pk=owner).values_list('settings', flat=True).first() or {}
    return settings if isinstance(settings, dict) else {}


def ttl_for(owner: str) -> int:
    value = _settings(owner).get('decision_sticky_ttl_seconds', DEFAULT_STICKY_TTL_SECONDS)
    if type(value) is int and value in ALLOWED_STICKY_TTLS:
        return value
    return DEFAULT_STICKY_TTL_SECONDS


def configured_order(owner: str) -> list[str]:
    from .config import connection
    settings = _settings(owner)
    primary = settings.get('decision_connection_id') or 'jev'
    raw = settings.get('decision_connection_ids')
    if not isinstance(raw, list):
        raw = []
    ordered = []
    for item in ([primary] if _valid_id(primary) else ['jev']) + list(raw):
        if _valid_id(item) and item not in ordered:
            ordered.append(item)
    if _valid_id(primary) and primary in ordered:
        ordered = [primary, *[item for item in ordered if item != primary]]
    existing = []
    for item in ordered[:MAX_FAILOVER]:
        try:
            connection(owner, item)
        except ValueError:
            continue
        existing.append(item)
    return existing or ['jev']


def _stored_values() -> dict:
    row = SystemSetting.objects.filter(pk=STICKY_KEY).first()
    return dict(row.value) if row and isinstance(row.value, dict) else {}


def _sticky_row_for_update():
    row, _ = SystemSetting.objects.get_or_create(
        pk=STICKY_KEY, defaults={'value': {}, 'description': STICKY_DESCRIPTION})
    row = SystemSetting.objects.select_for_update().get(pk=row.pk)
    value = row.value if isinstance(row.value, dict) else {}
    return row, dict(value)


def read_sticky(owner: str, now: float | None = None) -> dict | None:
    now = time.time() if now is None else now
    item = _stored_values().get(owner)
    if not isinstance(item, dict):
        return None
    connection_id, until = item.get('connection_id'), item.get('until')
    if not _valid_id(connection_id) or isinstance(until, bool) or not isinstance(until, (int, float)):
        return None
    if float(until) <= now:
        return None
    return {'connection_id': connection_id, 'until': float(until)}


def attempt_plan(owner: str, now: float | None = None) -> tuple[list[str], str | None]:
    """Sticky connection first, then the configured order without repeating it."""
    order = configured_order(owner)
    sticky = read_sticky(owner, now)
    sticky_id = sticky['connection_id'] if sticky and sticky['connection_id'] in order[1:] else None
    ids = [sticky_id] if sticky_id else []
    ids.extend(item for item in order if item not in ids)
    return ids, sticky_id


@transaction.atomic
def _write_owner(owner: str, item: dict | None) -> None:
    row, values = _sticky_row_for_update()
    if item:
        values[owner] = item
    else:
        values.pop(owner, None)
    row.value = values
    row.description = STICKY_DESCRIPTION
    row.save(update_fields=['value', 'description'])


def clear_sticky(owner: str) -> None:
    if isinstance(_stored_values().get(owner), dict):
        _write_owner(owner, None)


def remember_success(owner: str, connection_id: str, now: float | None = None) -> None:
    """Stick to a non-primary success until the original expiry; do not extend it."""
    now = time.time() if now is None else now
    order = configured_order(owner)
    if not order or connection_id not in order:
        return
    if connection_id == order[0]:
        clear_sticky(owner)
        return
    current = read_sticky(owner, now)
    if current and current['connection_id'] == connection_id:
        return
    until = now + ttl_for(owner)
    _write_owner(owner, {'connection_id': connection_id, 'until': until})
    logger.info('Decision sticky owner=%s connection=%s until=%s', owner, connection_id, int(until))


def forget_connection(owner: str, connection_id: str) -> None:
    from system_settings.agent_world.life_models import LifeConfig
    life = LifeConfig.objects.filter(pk=owner).first()
    if life:
        settings = dict(life.settings or {})
        primary = settings.get('decision_connection_id') or 'jev'
        raw = settings.get('decision_connection_ids')
        listed = connection_id == primary or (isinstance(raw, list) and connection_id in raw)
        if listed:
            source = [primary] if _valid_id(primary) else []
            if isinstance(raw, list):
                source.extend(item for item in raw if _valid_id(item) and item not in source)
            remaining = [item for item in source if item != connection_id] or ['jev']
            settings['decision_connection_ids'] = remaining
            settings['decision_connection_id'] = remaining[0]
            life.settings = settings
            life.save(update_fields=['settings'])
    entry = _stored_values().get(owner)
    if isinstance(entry, dict) and entry.get('connection_id') == connection_id:
        clear_sticky(owner)


def _iso(timestamp: float) -> str:
    moment = datetime.fromtimestamp(timestamp, datetime_timezone.utc)
    return timezone.localtime(moment).isoformat()


def public_status(owner: str, now: float | None = None) -> dict:
    order = configured_order(owner)
    sticky = read_sticky(owner, now)
    sticky_id = sticky['connection_id'] if sticky and sticky['connection_id'] in order[1:] else None
    return {
        'order': order,
        'sticky_connection_id': sticky_id,
        'sticky_until': _iso(sticky['until']) if sticky_id else None,
        'ttl_seconds': ttl_for(owner),
    }
