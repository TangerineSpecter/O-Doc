"""模型提供事件理解，确定性规则决定关系幅度；读取不改变状态。"""
import math
from datetime import datetime
from django.db import transaction
from django.utils import timezone
from .life_schedule import stable_id
from .life_time import local_time
from .social_models import SocialRelation, SocialEvent

BANDS = ('敌对', '反感', '不合', '中性', '友好', '朋友', '知己')
FLOORS = (-100, -74, -44, -19, 20, 45, 75)
RULES = {'like': (1, 1, '开心'), 'neutral': (0, 2, '平静'), 'agreement': (3, 2, '开心'),
         'disagreement': (0, 2, '不满'), 'misunderstanding': (-2, 2, '委屈'),
         'insult': (-8, 3, '烦躁'), 'boundary_violation': (-8, 3, '不满'),
         'explanation': (2, 2, '平静'), 'apology': (5, 2, '释然'), 'help': (8, 3, '感激')}


def affinity_band(score, previous=''):
    index = max(i for i, floor in enumerate(FLOORS) if score >= floor)
    if previous in BANDS:
        old = BANDS.index(previous)
        if index > old and score < FLOORS[index] + 4: return previous
        if index < old and score >= FLOORS[old] - 4: return previous
    return BANDS[index]


def familiarity_label(value):
    return '熟知' if value >= 60 else '熟悉' if value >= 20 else '初识'


def emotion_now(emotion, now=None):
    if not emotion: return {'kind': '平静', 'intensity': 0}
    elapsed = max(0, (local_time(now) - local_time(datetime.fromisoformat(emotion['at']))).total_seconds())
    strength = round(emotion['intensity'] * math.pow(0.5, elapsed / 86400), 1)
    return {**emotion, 'kind': emotion['kind'] if strength >= 5 else '平静', 'intensity': strength if strength >= 5 else 0}


def relation_data(row):
    return {'actor_id': row.actor_id, 'counterpart_id': row.counterpart_id,
            'familiarity': row.familiarity, 'familiarity_label': familiarity_label(row.familiarity),
            'affinity': row.affinity, 'band': row.band, 'emotion': emotion_now(row.emotion), 'reason': row.reason}


def context_for(owner, actor, peer=None):
    rows = SocialRelation.objects.filter(owner_id=owner, actor_id=actor)
    if peer: rows = rows.filter(counterpart_id=peer)
    return [relation_data(r) for r in rows[:30]]


@transaction.atomic
def apply_event(owner, actor, peer, source, appraisal=None, identity=None):
    if not actor or peer == f'agent-id:{actor}': return None
    appraisal = appraisal or {}
    category = appraisal.get('category', 'neutral')
    if category not in RULES: raise ValueError('事件理解类别无效')
    reason = appraisal.get('reason', '实际交流')
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000: raise ValueError('事件理解须说明原因')
    key = stable_id(owner, actor, peer, source)
    if SocialEvent.objects.filter(pk=key).exists(): return SocialEvent.objects.get(pk=key)
    # Actor row serializes first creation and opposite asynchronous callbacks.
    from system_settings.models import Agent
    actor_row = Agent.objects.select_for_update().get(pk=actor)
    if SocialEvent.objects.filter(pk=key).exists(): return SocialEvent.objects.get(pk=key)
    row, _ = SocialRelation.objects.get_or_create(pk=stable_id(owner, actor, peer), defaults={
        'owner_id': owner, 'actor_id': actor, 'counterpart_id': peer})
    before = relation_data(row)
    delta, familiarity, emotion = RULES[category]
    row.affinity = max(-100, min(100, row.affinity + delta))
    row.familiarity = min(100, row.familiarity + familiarity)
    row.band = affinity_band(row.affinity, row.band)
    row.counterpart_identity = identity or row.counterpart_identity
    row.reason = reason
    row.emotion = {'kind': emotion, 'intensity': 0 if emotion == '平静' else 35 if abs(delta) <= 3 else 65,
                   'at': local_time().isoformat(), 'reason': reason, 'source': source}
    row.save()
    return SocialEvent.objects.create(id=key, owner_id=owner, actor_id=actor, counterpart_id=peer,
        source_key=source, category=category, reason=reason, before=before, after={**relation_data(row),
            'actor_identity': {'name': actor_row.name, 'avatar': actor_row.avatar},
            'counterpart_identity': row.counterpart_identity})


@transaction.atomic
def rebuild_relations(owner):
    """按已持久化的事件结果重建，避免再次调用模型解释历史。"""
    for event in SocialEvent.objects.filter(owner_id=owner).order_by('created_at', 'pk'):
        result = event.after
        SocialRelation.objects.update_or_create(pk=stable_id(owner, event.actor_id, event.counterpart_id), defaults={
            'owner_id': owner, 'actor_id': event.actor_id, 'counterpart_id': event.counterpart_id,
            'affinity': result['affinity'], 'familiarity': result['familiarity'], 'band': result['band'],
            'emotion': result.get('emotion', {}), 'reason': result.get('reason', event.reason),
            'counterpart_identity': result.get('counterpart_identity', {})})
