"""撤销小剧场影响时，按历史事实重建关系，不重新调用模型。"""
from django.db import transaction

from .life_schedule import stable_id
from .social_models import SocialEvent, SocialRelation, SocialTheatreEvent


def deleted_sources(owner: str) -> set[str]:
    return {f'theatre:{identity}' for identity in SocialTheatreEvent.objects.filter(
        owner_id=owner, status='deleted').values_list('pk', flat=True)}


def _effect(event) -> tuple[int, int]:
    effect = event.after.get('rule_effect')
    if effect:
        return effect['affinity'], effect['familiarity']
    # 旧事实没有规则快照：通常直接沿用当时的实际变化；触及上限时
    # 使用冻结的一期幅度，避免上限吞掉的后续互动在撤销后永久丢失。
    legacy = {'like': (1, 1), 'neutral': (0, 2), 'agreement': (3, 2),
              'disagreement': (-1, 2), 'misunderstanding': (-2, 2),
              'insult': (-8, 3), 'boundary_violation': (-8, 3),
              'explanation': (2, 2), 'apology': (5, 2), 'help': (8, 3)}
    delta = event.after['affinity'] - event.before.get('affinity', 0)
    familiar = event.after['familiarity'] - event.before.get('familiarity', 0)
    if event.rule_version == 1 and event.category in legacy:
        expected_delta, expected_familiar = legacy[event.category]
        if ((event.after['affinity'] == 100 and expected_delta > 0)
                or (event.after['affinity'] == -100 and expected_delta < 0)):
            delta = expected_delta
        if event.after['familiarity'] == 100:
            familiar = expected_familiar
    return delta, familiar


def project_pair(events, excluded: set[str]) -> dict:
    from .social_relations import affinity_band

    # 最早的 before 保留没有迁移事件的历史基线。
    initial = events[0].before
    state = {'affinity': initial.get('affinity', 0),
             'familiarity': initial.get('familiarity', 0),
             'band': initial.get('band', '中性'),
             'emotion': initial.get('emotion', {}), 'reason': initial.get('reason', ''),
             'counterpart_identity': initial.get('counterpart_identity',
                                                  events[0].after.get('counterpart_identity', {}))}
    if 'at' not in state['emotion']:
        state['emotion'] = {}
    for event in events:
        if event.source_key in excluded:
            continue
        if event.category == 'migration':
            state.update({key: event.after.get(key, state[key]) for key in state})
            continue
        delta, familiar = _effect(event)
        state['affinity'] = max(-100, min(100, state['affinity'] + delta))
        state['familiarity'] = max(0, min(100, state['familiarity'] + familiar))
        state['band'] = affinity_band(state['affinity'], state['band'])
        for key in ('emotion', 'counterpart_identity'):
            state[key] = event.after.get(key, state[key])
        state['reason'] = event.after.get('reason', event.reason)
    return state


@transaction.atomic
def rebuild_pairs(owner: str, pairs=None) -> int:
    """只更新关系投影，保留原始事件的结算快照作为审计事实。"""
    from system_settings.models import Agent

    facts = SocialEvent.objects.filter(owner_id=owner).order_by('created_at', 'pk')
    if pairs is None:
        pairs = set(facts.values_list('actor_id', 'counterpart_id'))
    else:
        pairs = set(pairs)
    # 与正常 apply_event 共用 actor 锁，防止覆盖同时发生的其他社交。
    list(Agent.objects.select_for_update().filter(pk__in={pair[0] for pair in pairs}).order_by('pk'))
    excluded = deleted_sources(owner)
    changed = 0
    for actor, peer in sorted(pairs):
        events = list(facts.filter(actor_id=actor, counterpart_id=peer))
        if not events:
            continue
        state = project_pair(events, excluded)
        row, created = SocialRelation.objects.get_or_create(
            pk=stable_id(owner, actor, peer), defaults={
                'owner_id': owner, 'actor_id': actor, 'counterpart_id': peer, **state})
        if not created and any(getattr(row, key) != value for key, value in state.items()):
            for key, value in state.items():
                setattr(row, key, value)
            row.save()
            changed += 1
        elif created:
            changed += 1
    return changed


def rebuild_deleted_relations(owner: str) -> int:
    sources = deleted_sources(owner)
    pairs = SocialEvent.objects.filter(owner_id=owner, source_key__in=sources).values_list(
        'actor_id', 'counterpart_id')
    return rebuild_pairs(owner, pairs)
