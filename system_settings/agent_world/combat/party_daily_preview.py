"""Read a bounded party slice for the preliminary daily contribution preview."""
import json

from django.core import serializers
from django.db.models import Q
from django.db.models.fields.json import KeyTextTransform

from utils.sync_datetime import SyncJSONEncoder
from ..farm_gate import guarded
from .models import CombatFact, Exploration
from .party_daily import project_party
from .party_models import AdventureEvent, AdventureMember, AdventureParty, AdventureWave


@guarded
def preview(owner, identity, *, max_source_rows=20000):
    """Inspect one session without writing summaries or deleting source facts."""
    party = AdventureParty.objects.filter(pk=identity, owner_id=owner)
    if not party.exists():
        raise ValueError('未找到该账号的共同冒险')
    members = AdventureMember.objects.filter(party_id=identity)
    waves = AdventureWave.objects.filter(party_id=identity)
    events = AdventureEvent.objects.filter(party_id=identity)
    runs = Exploration.objects.filter(pk__in=members.values('exploration_id'))
    # Also include unexpected receipts referencing this party, so a malformed
    # actor or exploration cannot disappear merely because it is out of scope.
    facts = CombatFact.objects.alias(shared_event_text=KeyTextTransform('shared_event_id', 'payload')).filter(
        Q(exploration_id__in=members.values('exploration_id')) | Q(shared_event_text__in=events.values('pk')))
    queries = (party, members, waves, events, runs, facts)
    count = sum(query.order_by().count() for query in queries)
    if count > max_source_rows:
        raise ValueError(f'来源共 {count} 行，超过本次预览上限 {max_source_rows}；未生成摘要')
    data = []
    for query in queries:
        data.extend(json.loads(serializers.serialize('json', query, cls=SyncJSONEncoder)))
    result = project_party(data, identity)
    result['source_rows'] = count
    return result
