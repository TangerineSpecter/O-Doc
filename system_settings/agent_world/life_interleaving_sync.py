"""Semantic validation runs on both sources, merged import and backup restore."""
from datetime import datetime
from .life_activities import INTERLEAVED_ACTIVITIES


def validate(rows, profiles, items, records):
    for actor, fields in rows.items():
        if profiles.get(actor) != fields['owner_id'] or fields['phase'] not in ('idle', 'selecting', 'preparing', 'running', 'backoff'):
            raise ValueError('穿插调度居民归属或阶段无效')
        marker = fields.get('checkpoint', {})
        if not isinstance(marker, dict) or (marker.get('selected') is not None and marker['selected'] not in (*INTERLEAVED_ACTIVITIES, 'wait')):
            raise ValueError('穿插调度选择无效')
        for key in ('selected_at', 'expires_at'):
            if marker.get(key):
                datetime.fromisoformat(marker[key])
        item_id = fields.get('item') or fields.get('item_id')
        if item_id:
            item = items.get(item_id)
            if not item or item['owner_id'] != fields['owner_id'] or item['actor_id'] != actor or 'interleaving' not in item['context']:
                raise ValueError('穿插调度关联日程无效')
    open_actors = set()
    for identity, item in items.items():
        context = item.get('context', {})
        if 'interleaving' not in context:
            continue
        checkpoint = context['interleaving']
        if (not isinstance(checkpoint, dict) or checkpoint.get('version') != 1 or checkpoint.get('opportunity_id') != identity
                or item['activity'] not in INTERLEAVED_ACTIVITIES or not isinstance(checkpoint.get('choices', []), list)):
            raise ValueError('穿插日程检查点无效')
        datetime.fromisoformat(checkpoint['expires_at'])
        if profiles.get(item['actor_id']) != item['owner_id']:
            raise ValueError('穿插日程居民归属无效')
        questions = set()
        for choice in checkpoint.get('choices', []):
            if (not isinstance(choice, dict) or not all(isinstance(choice.get(k), str) and choice[k] for k in ('question', 'scene', 'choice'))
                    or choice['question'] in questions):
                raise ValueError('穿插有限选择检查点无效')
            questions.add(choice['question'])
        record_id = checkpoint.get('selection_record_id')
        if record_id:
            record = records.get(record_id)
            if (not record or record.get('agent') != item['actor_id']
                    or record.get('random_context', {}).get('owner_id') != item['owner_id']
                    or record.get('random_context', {}).get('interleaving_opportunity_id') != identity):
                raise ValueError('穿插决策记录关联无效')
        if item.get('cycle') or item.get('cycle_id'):
            raise ValueError('穿插不能占用周期分配')
        if item['status'] in ('pending', 'deferred', 'running', 'paused'):
            if item['actor_id'] in open_actors:
                raise ValueError('居民不能有多个未结束穿插')
            open_actors.add(item['actor_id'])


def validate_snapshot(data):
    from utils.sync_manager import SyncError
    def values(label):
        return {row['pk']: row['fields'] for row in data if row['model'] == 'system_settings.' + label}
    try:
        validate(values('lifeinterleavingstate'), {pk: row['owner_id'] for pk, row in values('lifeprofile').items()}, values('lifeitem'), values('agentrunrecord'))
    except (ValueError, KeyError, TypeError) as exc:
        raise SyncError('空档穿插来源或检查点不一致') from exc


def validate_database():
    from django.core import serializers
    import json
    from .life_models import LifeProfile, LifeItem, LifeInterleavingState
    from system_settings.models import AgentRunRecord
    items = list(LifeItem.objects.all())
    record_ids = [item.context.get('interleaving', {}).get('selection_record_id') for item in items]
    validate_snapshot(json.loads(serializers.serialize('json', [*LifeProfile.objects.all(), *items,
        *LifeInterleavingState.objects.all(), *AgentRunRecord.objects.filter(pk__in=[pk for pk in record_ids if pk])])))
