"""Agent 好感度与创作力。分数都由最近 30 天的记录重算。"""
import math
import random
from datetime import timedelta

from django.utils import timezone

from article.models import Article, ArticlePostComment, ArticlePostRating
from system_settings.models import Agent, AgentActivity, AgentAffinity, AgentCreativity

WINDOW_DAYS = 30
TIER_ORDER = ('初识', '熟悉', '朋友', '知己')
TIER_THRESHOLDS = {'熟悉': 20, '朋友': 45, '知己': 75}
TIER_MARGIN = 4
CREATIVITY_SATURATION = 8


def agent_creator_id(agent):
    return f'agent:{agent.name}'


def agent_from_creator_id(creator_id):
    creator_id = str(creator_id or '')
    if not creator_id.startswith('agent:'):
        return None
    return Agent.objects.filter(name=creator_id.split(':', 1)[1]).first()


def apply_affinity_event(score, action, basis):
    """按时间顺序重放一条互动后的分数，范围 0–100。"""
    score = float(score)
    action = action or ''
    basis = str(basis or '')
    if action == 'comment':
        if basis == 'approve':
            score += 12 * (1 - score / 100)
        elif basis == 'disapprove':
            score -= 16 * (0.55 + 0.45 * score / 100)
    elif action == 'rate':
        try:
            rating = int(basis)
        except (TypeError, ValueError):
            rating = 0
        if rating >= 7:
            gain = 8 + (rating - 7) * 2
            score += gain * (1 - score / 100)
        elif 1 <= rating <= 4:
            loss = 8 + (4 - rating) * 3
            score -= loss * (0.55 + 0.45 * score / 100)
    return max(0.0, min(100.0, score))


def stance_for_rating(rating):
    if rating >= 7:
        return 'approve'
    if rating <= 4:
        return 'disapprove'
    return 'neutral'


def replay_affinity(events):
    score = 0.0
    for action, basis in events:
        score = apply_affinity_event(score, action, basis)
    return int(round(score))


def directional_band(score, previous=''):
    """单方等级。已有等级时，进出各留 4 分，避免边界来回跳。"""
    if previous not in TIER_ORDER:
        return _raw_band(score)
    index = TIER_ORDER.index(previous)
    while index < len(TIER_ORDER) - 1:
        threshold = TIER_THRESHOLDS[TIER_ORDER[index + 1]] + TIER_MARGIN
        if score >= threshold:
            index += 1
        else:
            break
    while index > 0:
        floor = TIER_THRESHOLDS[TIER_ORDER[index]] - TIER_MARGIN
        if score < floor:
            index -= 1
        else:
            break
    return TIER_ORDER[index]


def display_tier(own_band, other_band):
    """朋友和知己需要双方都达到。只有一方有互动时，最高停在熟悉。"""
    own_index = TIER_ORDER.index(own_band if own_band in TIER_ORDER else '初识')
    if other_band not in TIER_ORDER:
        return TIER_ORDER[min(own_index, TIER_ORDER.index('熟悉'))]
    other_index = TIER_ORDER.index(other_band)
    return TIER_ORDER[min(own_index, other_index)]


def creativity_score(post_count, rating_values, rated_post_count, active_days):
    """最近窗口内的创作力。没有帖子时为 0。"""
    if post_count <= 0:
        return 0
    volume = min(1.0, math.log(1 + post_count) / math.log(1 + CREATIVITY_SATURATION))
    if rating_values and rated_post_count:
        mean_quality = (sum(rating_values) / len(rating_values)) / 10
        confidence = min(1.0, rated_post_count / post_count)
        quality = confidence * mean_quality + (1 - confidence) * 0.5
    else:
        quality = 0.5
    cadence = min(1.0, active_days / CREATIVITY_SATURATION)
    return int(round(100 * (0.30 * volume + 0.45 * quality + 0.25 * cadence)))


def creativity_behavior_line(score):
    if score >= 70:
        return f'你最近的创作力是 {score}/100。这次可以处理更完整的题目。'
    if score < 40:
        return f'你最近的创作力是 {score}/100。这次写作收短，把单篇写扎实。'
    return f'你最近的创作力是 {score}/100。保持现在的篇幅和完成度。'


def stance_behavior_line():
    return '评论或评分时按真实判断选择立场：不认可就使用 disapprove 或 1-4 分，认可才使用 approve 或 7-10 分，说不清就用 neutral 或 5-6 分。'


def selection_weight(actor_creator_id, author_creator_id):
    """抽帖权重。低好感仍保留被抽到的机会。"""
    weight = 1.0
    actor = agent_from_creator_id(actor_creator_id)
    author = agent_from_creator_id(author_creator_id)
    if not author:
        return weight
    creativity = AgentCreativity.objects.filter(agent=author).first()
    if creativity and creativity.score >= 70:
        weight *= 1.15
    if not actor or actor.id == author.id:
        return weight
    affinity = AgentAffinity.objects.filter(actor=actor, counterpart=author).first()
    if not affinity:
        return weight
    if affinity.tier in {'熟悉', '朋友', '知己'} and affinity.score >= 10:
        weight *= 1.4
    elif affinity.score < 10:
        weight *= 0.7
    return weight


def weighted_choice(items, weights):
    if not items:
        return None
    return random.choices(list(items), weights=list(weights), k=1)[0]


def window_start():
    return timezone.now() - timedelta(days=WINDOW_DAYS)


def refresh_creativity(agent):
    if not agent:
        return None
    start = window_start()
    posts = list(Article.objects.filter(
        is_valid=True,
        agent_post_creator_id=agent_creator_id(agent),
        created_at__gte=start,
    ))
    post_ids = [post.article_id for post in posts]
    ratings = ArticlePostRating.objects.filter(article_id__in=post_ids, is_valid=True).exclude(
        rater_id=agent_creator_id(agent),
    )
    rated_post_ids = set(ratings.values_list('article_id', flat=True))
    rating_values = list(ratings.values_list('rating', flat=True))
    active_days = len({_local_date(post.created_at) for post in posts})
    score = creativity_score(len(posts), rating_values, len(rated_post_ids), active_days)
    snapshot, _ = AgentCreativity.objects.update_or_create(
        agent=agent,
        defaults={
            'score': score,
            'post_count': len(posts),
            'rated_post_count': len(rated_post_ids),
            'active_days': active_days,
            'computed_at': timezone.now(),
        },
    )
    return snapshot


def refresh_pair(actor, counterpart):
    """重算一个方向，并让双方的展示等级对齐。"""
    if not actor or not counterpart or actor.id == counterpart.id:
        return None
    _write_direction(actor, counterpart)
    _write_direction(counterpart, actor)
    return AgentAffinity.objects.filter(actor=actor, counterpart=counterpart).first()


def recompute_all_relations():
    for agent in Agent.objects.all():
        refresh_creativity(agent)
    pairs = set()
    activities = AgentActivity.objects.filter(
        action__in=['comment', 'rate'],
        occurred_at__gte=window_start(),
        counterpart_type='agent',
    ).exclude(agent_id=None)
    for activity in activities:
        counterpart = agent_from_creator_id(activity.counterpart_id)
        if counterpart and activity.agent_id != counterpart.id:
            pairs.add((activity.agent_id, counterpart.id))
    seen = set()
    for actor_id, counterpart_id in pairs:
        key = tuple(sorted((actor_id, counterpart_id)))
        if key in seen:
            continue
        seen.add(key)
        actor = Agent.objects.filter(id=actor_id).first()
        counterpart = Agent.objects.filter(id=counterpart_id).first()
        refresh_pair(actor, counterpart)
    AgentAffinity.objects.exclude(
        id__in=_kept_affinity_ids(seen),
    ).delete()


def backfill_relation_events():
    """把已有评论和评分补成动态。旧评论没有立场，按中性记。"""
    comments = ArticlePostComment.objects.filter(is_valid=True).select_related('article')
    for comment in comments:
        actor = agent_from_creator_id(comment.creator_id)
        if not actor or not comment.article_id:
            continue
        _upsert_historical_activity(
            event_key=f'comment:{comment.comment_id}',
            actor=actor,
            article=comment.article,
            action='comment',
            stance='neutral',
            basis='neutral',
            title=f'{actor.name}评价了《{comment.article.title}》',
            summary=comment.content,
            artifact_kind='articleComment',
            artifact_id=comment.comment_id,
            occurred_at=comment.created_at,
        )
    ratings = ArticlePostRating.objects.filter(is_valid=True).select_related('article')
    for rating in ratings:
        actor = agent_from_creator_id(rating.rater_id)
        if not actor or not rating.article_id:
            continue
        stance = stance_for_rating(rating.rating)
        _upsert_historical_activity(
            event_key=f'rating:{rating.rating_id}',
            actor=actor,
            article=rating.article,
            action='rate',
            stance=stance,
            basis=str(rating.rating),
            title=f'{actor.name}给《{rating.article.title}》打了 {rating.rating} 分',
            summary='',
            artifact_kind='agentPost',
            artifact_id=rating.article.article_id,
            occurred_at=rating.updated_at or rating.created_at,
        )


def relation_graph():
    backfill_relation_events()
    recompute_all_relations()
    agents = list(Agent.objects.all())
    creativity = {item.agent_id: item for item in AgentCreativity.objects.all()}
    running_ids = set(AgentActivity.objects.filter(status='running').exclude(agent_id=None).values_list('agent_id', flat=True))
    nodes = []
    for agent in agents:
        snapshot = creativity.get(agent.id)
        nodes.append({
            'id': agent.id,
            'name': agent.name,
            'avatar': agent.avatar,
            'creativity': snapshot.score if snapshot else 0,
            'post_count': snapshot.post_count if snapshot else 0,
            'rated_post_count': snapshot.rated_post_count if snapshot else 0,
            'active_days': snapshot.active_days if snapshot else 0,
            'status': 'running' if agent.id in running_ids else 'idle',
        })
    affinities = list(AgentAffinity.objects.select_related('actor', 'counterpart'))
    grouped = {}
    for item in affinities:
        key = tuple(sorted((item.actor_id, item.counterpart_id)))
        grouped.setdefault(key, {})[item.actor_id] = item
    names = {agent.id: agent.name for agent in agents}
    edges = []
    for (left_id, right_id), directions in grouped.items():
        left = directions.get(left_id)
        right = directions.get(right_id)
        sample = left or right
        edges.append({
            'source_id': left_id,
            'target_id': right_id,
            'tier': sample.tier if sample else '初识',
            'source_score': left.score if left else 0,
            'target_score': right.score if right else 0,
            'source_name': names.get(left_id, ''),
            'target_name': names.get(right_id, ''),
        })
    return {'nodes': nodes, 'edges': edges}


def list_agent_activity_events(agent, *, days=7, action='', direction='outbound', limit=50):
    days = min(max(int(days or 7), 1), 30)
    limit = min(max(int(limit or 50), 1), 50)
    start = timezone.now() - timedelta(days=days)
    if direction == 'inbound':
        queryset = AgentActivity.objects.filter(
            counterpart_id=agent_creator_id(agent),
            action__in=['comment', 'rate'],
            occurred_at__gte=start,
        )
    else:
        queryset = AgentActivity.objects.filter(agent=agent, occurred_at__gte=start).exclude(action='')
    if action:
        queryset = queryset.filter(action=action)
    events = []
    for item in queryset.order_by('-occurred_at', '-id')[:limit]:
        events.append({
            'occurred_at': item.occurred_at.isoformat() if item.occurred_at else '',
            'action': item.action,
            'stance': item.stance,
            'title': item.title,
            'summary': item.summary,
            'counterpart_id': item.counterpart_id,
            'counterpart_name': item.counterpart_name,
            'article_id': item.artifact_article_id,
            'artifact_id': item.artifact_id,
        })
    return {'events': events, 'count': len(events)}


def _raw_band(score):
    if score >= TIER_THRESHOLDS['知己']:
        return '知己'
    if score >= TIER_THRESHOLDS['朋友']:
        return '朋友'
    if score >= TIER_THRESHOLDS['熟悉']:
        return '熟悉'
    return '初识'


def _local_date(value):
    if value is None:
        return None
    if timezone.is_aware(value):
        value = timezone.localtime(value)
    return value.date()


def _direction_events(actor, counterpart):
    rows = AgentActivity.objects.filter(
        agent=actor,
        counterpart_id=agent_creator_id(counterpart),
        action__in=['comment', 'rate'],
        occurred_at__gte=window_start(),
    ).order_by('occurred_at', 'id')
    return [(row.action, row.score_delta_basis or row.stance) for row in rows]


def _write_direction(actor, counterpart):
    events = _direction_events(actor, counterpart)
    existing = AgentAffinity.objects.filter(actor=actor, counterpart=counterpart).first()
    if not events:
        if existing:
            existing.delete()
        return None
    score = replay_affinity(events)
    band = directional_band(score, existing.band if existing else '')
    other = AgentAffinity.objects.filter(actor=counterpart, counterpart=actor).first()
    other_events = _direction_events(counterpart, actor)
    other_band = ''
    if other_events:
        other_score = replay_affinity(other_events)
        other_band = directional_band(other_score, other.band if other else '')
    tier = display_tier(band, other_band)
    snapshot, _ = AgentAffinity.objects.update_or_create(
        actor=actor,
        counterpart=counterpart,
        defaults={
            'score': score,
            'band': band,
            'tier': tier,
            'event_count': len(events),
            'computed_at': timezone.now(),
        },
    )
    if other and other.tier != tier and other_band:
        other.tier = display_tier(other_band, band)
        other.save(update_fields=['tier', 'updated_at'])
    return snapshot


def _kept_affinity_ids(pair_keys):
    ids = []
    for actor_id, counterpart_id in pair_keys:
        ids.extend(AgentAffinity.objects.filter(
            actor_id__in=[actor_id, counterpart_id],
            counterpart_id__in=[actor_id, counterpart_id],
        ).values_list('id', flat=True))
    return ids


def _upsert_historical_activity(*, event_key, actor, article, action, stance, basis, title, summary, artifact_kind, artifact_id, occurred_at):
    counterpart_type, counterpart_id, counterpart_name = _counterpart_for(actor, article)
    AgentActivity.objects.get_or_create(
        event_key=event_key,
        defaults={
            'activity_type': 'interaction',
            'status': 'success',
            'agent': actor,
            'action': action,
            'stance': stance,
            'counterpart_type': counterpart_type,
            'counterpart_id': counterpart_id,
            'counterpart_name': counterpart_name,
            'score_delta_basis': basis,
            'title': title[:180],
            'summary': (summary or '')[:1200],
            'current_action': '发表了评论' if action == 'comment' else '给出了评分',
            'artifact_kind': artifact_kind,
            'artifact_id': artifact_id,
            'artifact_article_id': article.article_id,
            'artifact_coll_id': article.coll_id,
            'artifact_title': article.title,
            'occurred_at': occurred_at or timezone.now(),
        },
    )


def _counterpart_for(actor, article):
    creator_id = str(article.agent_post_creator_id or '')
    if creator_id and creator_id != agent_creator_id(actor):
        return 'agent', creator_id, article.agent_post_creator_name or ''
    if creator_id:
        return '', '', ''
    author = str(article.author or '')
    if author:
        return 'user', author, author
    return '', '', ''
