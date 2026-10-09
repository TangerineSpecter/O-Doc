"""从真实回复投影历史跳转，不修改已同步的活动事实。"""
from collections import defaultdict
from datetime import timedelta
from django.db.models import Q

from article.models import ArticlePostComment
from .social_models import MomentComment


def reply_targets(activities, owner, visible_colls):
    """仅恢复时间、作者和正文唯一匹配的回复；歧义时不猜目标。"""
    rows = [row for row in activities if row.action == 'social_reply']
    if not rows:
        return {}
    start = min(row.occurred_at for row in rows) - timedelta(seconds=5)
    end = max(row.occurred_at for row in rows)
    actors = {row.agent_id for row in rows if row.agent_id}
    candidates = defaultdict(list)
    direct = {}
    moment_reply_ids = [row.artifact_id for row in rows if row.artifact_kind == 'momentComment']
    post_reply_ids = [row.artifact_id for row in rows if row.artifact_kind == 'articleComment']
    moments = MomentComment.objects.select_related('moment').filter(
        Q(pk__in=moment_reply_ids) | Q(actor_id__in=[f'agent-id:{actor}' for actor in actors],
                                     created_at__gte=start, created_at__lte=end),
        moment__owner_id=owner).exclude(parent_id='')
    posts = ArticlePostComment.objects.select_related('article').filter(
        Q(pk__in=post_reply_ids) | Q(actor_agent_id__in=actors, created_at__gte=start, created_at__lte=end),
        article__coll_id__in=visible_colls).exclude(parent_comment_id='')
    for comment in moments:
        candidates[(comment.actor_id[9:], comment.content)].append((comment, 'moment'))
        direct[('momentComment', comment.pk)] = (comment, 'moment')
    for comment in posts:
        candidates[(comment.actor_agent_id, comment.content)].append((comment, 'post'))
        direct[('articleComment', comment.pk)] = (comment, 'post')
    targets = {}
    for row in rows:
        if row.artifact_kind in ('momentComment', 'articleComment'):
            match = direct.get((row.artifact_kind, row.artifact_id))
            matches = [match] if match else []
        else:
            matches = [(comment, kind) for comment, kind in candidates[(row.agent_id, row.summary)]
                       if timedelta(0) <= row.occurred_at - comment.created_at <= timedelta(seconds=5)]
        if len(matches) != 1:
            targets[row.pk] = {}
            continue
        comment, kind = matches[0]
        if kind == 'moment':
            targets[row.pk] = ({'artifactKind': 'moment', 'artifactId': comment.moment_id}
                               if comment.is_valid and comment.moment.is_valid else {})
        else:
            targets[row.pk] = ({'artifactKind': 'articleComment', 'artifactId': comment.pk,
                                'articleId': comment.article_id, 'collId': comment.article.coll_id}
                               if comment.is_valid and comment.article.is_valid else {})
    return targets
