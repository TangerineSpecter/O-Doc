"""只读关系图谱：双方独立感受与用户单向关系。"""
from .social_models import SocialRelation
from .social_relations import relation_data, familiarity_label, BANDS


def _historical_nodes(rows, nodes):
    """仅按稳定 ID 恢复关系端点，不通过同名居民重新绑定身份。"""
    from .social_models import Moment, MomentComment, MomentLike

    current = {node['id'] for node in nodes}
    missing = {row.actor_id for row in rows} - current
    identities = {}
    for row in rows:
        if row.counterpart_id.startswith('agent-id:'):
            peer = row.counterpart_id[9:]
            if peer not in current:
                missing.add(peer)
                identities[peer] = row.counterpart_identity or {}
    # 单向关系的发起人也可能已经离开，朋友圈保留了其稳定身份快照。
    from system_settings.models import AgentActivity
    for metadata in AgentActivity.objects.filter(
        metadata__agentSnapshot__id__in=list(missing),
    ).order_by('occurred_at', 'id').values_list('metadata', flat=True):
        identity = metadata.get('agentSnapshot', {})
        if identity.get('name'):
            identities.setdefault(identity.get('id'), identity)
    keys = [f'agent-id:{key}' for key in missing]
    for model, scope in ((Moment, {'owner_id': rows[0].owner_id} if rows else {}),
                         (MomentComment, {'moment__owner_id': rows[0].owner_id} if rows else {}),
                         (MomentLike, {'moment__owner_id': rows[0].owner_id} if rows else {})):
        for actor, identity in model.objects.filter(actor_id__in=keys, **scope).values_list('actor_id', 'identity'):
            if identity.get('name'):
                identities.setdefault(actor[9:], identity)
    for key in sorted(missing):
        identity = identities.get(key, {})
        nodes.append({'id': key, 'name': identity.get('name') or '历史居民',
                      'avatar': identity.get('avatar') or '', 'kind': 'agent', 'departed': True,
                      'money': '0', 'creativity': 0, 'post_count': 0,
                      'rated_post_count': 0, 'active_days': 0, 'status': 'idle'})


def graph_edges(owner, nodes, include_departed=False):
    rows = list(SocialRelation.objects.filter(owner_id=owner).order_by('updated_at', 'id'))
    if include_departed:
        _historical_nodes(rows, nodes)
    names = {n['id']: n['name'] for n in nodes}
    grouped = {}
    for row in rows:
        peer = row.counterpart_id[9:] if row.counterpart_id.startswith('agent-id:') else row.counterpart_id
        if row.actor_id not in names: continue
        if peer.startswith('user:') and peer not in names:
            nodes.append({'id': peer, 'name': '我',
                          'avatar': row.counterpart_identity.get('avatar', ''), 'kind': 'user', 'money': '0',
                          'creativity': 0, 'post_count': 0, 'rated_post_count': 0, 'active_days': 0, 'status': 'idle'})
            names[peer] = nodes[-1]['name']
        if peer not in names: continue
        key = tuple(sorted((row.actor_id, peer)))
        grouped.setdefault(key, {})[row.actor_id] = row
    edges = []
    for (a, b), directions in grouped.items():
        left, right = directions.get(a), directions.get(b)
        sample = left or right
        one_way = a.startswith('user:') or b.startswith('user:')
        own, other = relation_data(left) if left else None, relation_data(right) if right else None
        score = sample.affinity if one_way else min(left.affinity if left else 0, right.affinity if right else 0)
        band = sample.band if one_way else min((r.band if r else '中性' for r in (left, right)), key=BANDS.index)
        if not one_way and (not left or not right) and score >= 45: band = '友好'
        familiar = min(left.familiarity, right.familiarity) if left and right else sample.familiarity
        upset = any(r and relation_data(r)['emotion']['kind'] in ('不满', '烦躁', '委屈') for r in (left, right))
        label = band
        if band == '中性' and upset: label = '有分歧'
        elif band == '中性': label = '中性'
        elif band in ('朋友', '知己') and upset:
            label += ' · 暂时不满'
        if left and right and left.band != right.band: label = '关系不对称'
        edges.append({'source_id': a, 'target_id': b, 'source_name': names[a], 'target_name': names[b],
                      'source_score': left.affinity if left else None, 'target_score': right.affinity if right else None,
                      'source_relation': own, 'target_relation': other, 'one_way': one_way,
                      'band': band, 'tier': f'{familiarity_label(familiar)} · {label}'})
    return edges
