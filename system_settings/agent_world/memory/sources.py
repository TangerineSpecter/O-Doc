"""Stream native facts, never plans or arbitrary execution transcripts."""
import hashlib
import json
from collections import Counter
from datetime import datetime, time, timedelta
from django.core.serializers.json import DjangoJSONEncoder
from django.utils.dateparse import parse_datetime
from .policy import CONTENT_LIMIT
from ..life_time import SHANGHAI, storage_time, local_time


def collect(owner: str, agent, day, enabled_at) -> dict:
    from system_settings.models import AgentActivity
    from ..farm_models import FarmOperation
    from ..cooking_models import CookingOperation
    from ..market_models import MarketTransaction
    from ..investment_models import InvestmentTrade
    from ..travel_models import TravelJourney
    from ..social_models import SocialEvent, SocialOpportunity
    start = max(enabled_at, storage_time(datetime.combine(day, time.min, SHANGHAI)))
    end = storage_time(datetime.combine(day + timedelta(days=1), time.min, SHANGHAI))
    from anthology.models import Anthology
    from django.db.models import Q
    visible_colls = Anthology.objects.filter(is_valid=True).filter(Q(permission='public') | Q(user_id=owner)).values_list('coll_id', flat=True)
    queries = [
        ('farm', FarmOperation.objects.filter(farm_id=agent.pk, farm__owner_id=owner), 'created_at'),
        ('cooking', CookingOperation.objects.filter(actor_id=agent.pk, owner_id=owner), 'created_at'),
        ('market', MarketTransaction.objects.filter(actor_id=agent.pk, owner_id=owner), 'created_at'),
        ('investment', InvestmentTrade.objects.filter(actor_id=agent.pk, owner_id=owner), 'created_at'),
        ('travel', TravelJourney.objects.filter(agent_id=agent.pk, owner_id=owner, status='completed', snapshot__memory_completed_at__isnull=False), 'snapshot__memory_completed_at'),
        ('relation', SocialEvent.objects.filter(actor_id=agent.pk, owner_id=owner), 'created_at'),
        ('social', SocialOpportunity.objects.filter(actor_id=agent.pk, owner_id=owner, status='completed'), 'updated_at'),
        ('publication', AgentActivity.objects.filter(agent=agent, activity_type__in=['publication', 'interaction'], status='success', artifact_coll_id__in=visible_colls).exclude(action__startswith='social_'), 'occurred_at'),
    ]
    groups, counts, digest = {}, Counter(), hashlib.sha256()
    for kind, query, field in queries:
        bounds = (start.isoformat(), end.isoformat()) if kind == 'travel' else (start, end)
        for row in query.filter(**{field + '__gte': bounds[0], field + '__lt': bounds[1]}).order_by(field, 'pk').iterator(chunk_size=200):
            facts = project(kind, row)
            if facts is None:
                continue
            encoded = json.dumps(facts, cls=DjangoJSONEncoder, sort_keys=True, ensure_ascii=False)
            at = parse_datetime(row.snapshot['memory_completed_at']) if kind == 'travel' else getattr(row, field)
            source = {'id': kind + ':' + str(row.pk), 'kind': kind, 'at': at.isoformat(),
                      'day': local_time(at).date().isoformat(), 'facts': facts}
            digest.update(json.dumps(source, sort_keys=True, ensure_ascii=False).encode())
            counts[kind] += 1
            # A representative per activity/target, rather than one memory per routine action.
            topic = (kind, facts.get('action', ''), facts.get('target', ''))
            current = groups.setdefault(topic, {'count': 0, 'source': source})
            current['count'] += 1
            current['source'] = source
    ranked = sorted(groups.values(), key=lambda g: (-int(g['source']['facts']['significant']), -g['count'], g['source']['id']))
    return {'counts': dict(counts), 'groups': ranked[:40], 'fingerprint': digest.hexdigest()}


def project(kind, row):
    if kind == 'relation':
        return {'action': row.category, 'target': row.counterpart_id, 'reason': row.reason[:CONTENT_LIMIT],
                'before': {k: row.before.get(k) for k in ('affinity', 'band')},
                'after': {k: row.after.get(k) for k in ('affinity', 'band')},
                'significant': row.category not in ('like', 'neutral', 'agreement', 'disagreement') or row.before.get('band') != row.after.get('band')}
    if kind == 'travel':
        state = row.snapshot
        return {'action': 'completed', 'target': row.pk, 'destination': state.get('selected', {}),
                'reflection': str(state.get('draft', {}).get('reflection', ''))[:CONTENT_LIMIT],
                'significant': True}
    if kind == 'publication':
        return {'action': row.action, 'target': row.artifact_id, 'title': row.title[:120],
                'summary': row.summary[:CONTENT_LIMIT], 'counterpart_id': row.counterpart_id,
                'significant': row.activity_type == 'publication'}
    if kind == 'social':
        result = row.result
        action = result.get('action')
        if action not in ('publish', 'read', 'reply'):
            return None
        return {'action': action, 'target': str(result.get('moment_id') or result.get('inbox_id') or ''),
                'own_expression': str(result.get('content') or '')[:CONTENT_LIMIT], 'significant': False}
    operation = row.operation if kind != 'cooking' else {'recipe': row.recipe_id}
    action = str(operation.get('type') or operation.get('action') or operation.get('kind') or kind)
    target = str(operation.get('sku') or operation.get('recipe') or operation.get('code') or '')
    result = {k: v for k, v in row.result.items() if k not in ('plan', 'context', 'messages', 'prompt', 'snapshot')}
    # Bound each field, preserve actual result keys; generated plans are explicitly excluded.
    result = {k: str(v)[:180] if not isinstance(v, (int, float, bool, type(None))) else v for k, v in sorted(result.items())[:12]}
    return {'action': action, 'target': target, 'result': result,
            'reason': str(getattr(row, 'reason', ''))[:180],
            'significant': kind in ('cooking', 'investment') or action in ('expand', 'build', 'upgrade', 'buy_listing')}
