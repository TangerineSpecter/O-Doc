"""Read a bounded party slice for the preliminary daily contribution preview."""
import json

from django.core import serializers
from django.db.models.fields.json import KeyTextTransform

from utils.sync_datetime import SyncJSONEncoder
from utils.sync_policy import SyncError
from ..farm_gate import guarded
from .models import CombatFact, Exploration
from .party_daily import project_party
from .party_models import AdventureEvent, AdventureMember, AdventureParty, AdventureWave


@guarded
def preview(owner, identity, *, max_source_rows=20000, include_settlement=False):
    """Inspect one session without writing summaries or deleting source facts."""
    party = AdventureParty.objects.filter(pk=identity, owner_id=owner)
    if not party.exists():
        raise ValueError('未找到该账号的共同冒险')
    members = AdventureMember.objects.filter(party_id=identity)
    waves = AdventureWave.objects.filter(party_id=identity)
    events = AdventureEvent.objects.filter(party_id=identity)
    runs = Exploration.objects.filter(pk__in=members.values('exploration_id'))
    # Split the two sources so each can use its own index. The second query
    # still catches unexpected receipts for this party, including foreign or
    # malformed members; excluding known runs avoids returning any row twice.
    run_ids = members.values('exploration_id')
    facts_by_run = CombatFact.objects.filter(exploration_id__in=run_ids)
    facts_by_event = CombatFact.objects.alias(shared_event_text=KeyTextTransform('shared_event_id', 'payload')).filter(
        payload__has_key='shared_event_id', shared_event_text__in=events.values('pk')).exclude(exploration_id__in=run_ids)
    queries = (party, members, waves, events, runs, facts_by_run, facts_by_event)
    count = sum(query.order_by().count() for query in queries)
    if max_source_rows is not None and count > max_source_rows:
        raise ValueError(f'来源共 {count} 行，超过本次预览上限 {max_source_rows}；未生成摘要')
    data = []
    for query in queries:
        data.extend(json.loads(serializers.serialize('json', query, cls=SyncJSONEncoder)))
    result = project_party(data, identity)
    result['source_rows'] = count
    if include_settlement:
        from .party_settlement_archive import _from_validated_projection
        try:
            result['_settlement'] = _from_validated_projection(data, identity, result)
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError) as exc:
            result['_settlement_error'] = str(exc) or '压缩结算字段不完整'
    return result
