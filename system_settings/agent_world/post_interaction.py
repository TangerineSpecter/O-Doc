"""系统帖子互动的范围与候选查询；与调度、模型调用分别维护。"""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from anthology.models import Anthology
from article.models import Article, ArticlePostComment
from .identity import actor_key
from .models import WorldCategory


def merged_scope(task_ids: list[str], agent_ids: list[str]) -> list[str] | None:
    """None 表示任务未配置的全部范围；个人空值仅表示不补充。"""
    if not task_ids:
        return None
    return list(dict.fromkeys([*task_ids, *agent_ids]))


def interaction_window_days(task, agent) -> int:
    """帖子互动沿用社交配置的互动时间范围；0 表示不限制。

    只读取既有配置：每日事实等只读判定路径不初始化领域状态（不调用 get_or_create）。
    """
    owner = (task.world_state or {}).get('owner_id', '')
    if not owner:
        return 0
    from .social_config import DEFAULTS, settings_for
    from .social_models import SocialConfig
    config = SocialConfig.objects.filter(pk=owner).first()
    return settings_for(config, agent.pk).get('interaction_window_days', 0) if config else DEFAULTS['interaction_window_days']


def candidate_posts(agent, collection_ids: list[str] | None, category_ids: list[str] | None, window_days: int = 0):
    collections = Anthology.objects.filter(type='agent', is_valid=True)
    if collection_ids is not None:
        collections = collections.filter(coll_id__in=collection_ids)
    posts = Article.objects.filter(is_valid=True, coll_id__in=collections.values('coll_id'))
    if window_days:
        posts = posts.filter(created_at__gte=timezone.now() - timedelta(days=window_days))
    if category_ids is not None:
        enabled = WorldCategory.objects.filter(pk__in=category_ids, enabled=True).values('pk')
        posts = posts.filter(agent_post_category_ref_id__in=enabled)
    # 稳定 ID 优先；保留显式 ID 身份兼容，不能将同名居民相互排除。
    posts = posts.exclude(Q(agent_post_author_id=agent.pk) | Q(
        agent_post_author_id='', agent_post_creator_id__in=[f'agent:{agent.pk}', f'agent-id:{agent.pk}'],
    ))
    # 最终评论服务会检查软删历史，因此候选查询也不按 is_valid 筛评论。
    target = actor_key(agent.pk, '')
    commented = {
        row.article_id for row in ArticlePostComment.objects.filter(article__in=posts, parent_comment_id="")
        .only('article_id', 'actor_agent_id', 'creator_id')
        if actor_key(row.actor_agent_id, row.creator_id) == target
    }
    return posts.exclude(article_id__in=commented).exclude(content='')
