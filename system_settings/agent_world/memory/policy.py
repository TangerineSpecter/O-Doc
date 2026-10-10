"""Deterministic retention, human overrides, and bounded prompt accounting."""
import math
import re
from datetime import timedelta
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from system_settings.models import AgentLongTermMemory
from system_settings.sync_state import permanent_deletion

ACTIVE_LIMIT = ARCHIVE_LIMIT = 100
CHAR_LIMIT = 10000
CONTENT_LIMIT = 300
SOURCE_LIMIT = 8
UPSERT_LIMIT = 5
INPUT_TOKENS = 8000
OUTPUT_TOKENS = 2000
RECALL_LIMIT = 6
RECALL_TOKENS = 800


def estimate_tokens(text: str) -> int:
    cjk = len(re.findall(r'[\u4e00-\u9fff]', text))
    return cjk + math.ceil((len(text) - cjk) / 4) + 4


def meta(memory) -> dict:
    return (memory.metadata or {}).get('world_memory', {})


def managed(memory) -> bool:
    return bool(meta(memory)) and not memory.is_pinned and not meta(memory).get('human_override')


def protect(memory) -> None:
    if meta(memory):
        memory.metadata = {**memory.metadata, 'world_memory': {**meta(memory), 'human_override': True}}


def supported_at(memory):
    return parse_datetime(meta(memory).get('last_supported_at', '')) or memory.created_at


def priority(memory):
    return (-meta(memory).get('importance', 1), -supported_at(memory).timestamp(), memory.pk)


def retain(agent, now=None) -> None:
    now = now or timezone.now()
    rows = [m for m in AgentLongTermMemory.objects.filter(agent=agent) if managed(m)]
    active = []
    for memory in rows:
        if memory.status != 'active':
            continue
        if not meta(memory).get('milestone') and supported_at(memory) < now - timedelta(days=180):
            archive(memory, now)
        else:
            active.append(memory)
    chars = 0
    for index, memory in enumerate(sorted(active, key=priority)):
        size = len(memory.title) + len(memory.content)
        if index >= ACTIVE_LIMIT or chars + size > CHAR_LIMIT:
            archive(memory, now)
        else:
            chars += size
    archived = sorted((m for m in rows if m.status == 'archived'), key=priority)
    chars = 0
    for index, memory in enumerate(archived):
        size = len(memory.title) + len(memory.content)
        archived_at = parse_datetime(meta(memory).get('archived_at', '')) or memory.updated_at
        if index >= ARCHIVE_LIMIT or chars + size > CHAR_LIMIT or archived_at < now - timedelta(days=90):
            with permanent_deletion():
                memory.delete()
        else:
            chars += size


def archive(memory, now):
    memory.status = 'archived'
    memory.metadata = {**memory.metadata, 'world_memory': {**meta(memory), 'archived_at': now.isoformat()}}
    memory.save(update_fields=['status', 'metadata', 'updated_at'])


def statistics(agent) -> dict:
    rows = list(AgentLongTermMemory.objects.filter(agent=agent))
    groups = {status: [m for m in rows if managed(m) and m.status == status] for status in ('active', 'archived')}
    return {**{status: {'count': len(items), 'characters': sum(len(m.title) + len(m.content) for m in items),
                        'limit': ACTIVE_LIMIT if status == 'active' else ARCHIVE_LIMIT, 'character_limit': CHAR_LIMIT}
               for status, items in groups.items()}, 'protected_count': sum(not managed(m) for m in rows)}
