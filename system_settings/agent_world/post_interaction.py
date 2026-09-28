"""系统帖子互动的范围与候选查询；与调度、模型调用分别维护。"""
from django.db.models import Q

from anthology.models import Anthology
from article.models import Article, ArticlePostComment
from .identity import actor_key
from .models import WorldCategory


def merged_scope(task_ids: list[str], agent_ids: list[str]) -> list[str] | None:
    """None 表示任务未配置的全部范围；个人空值仅表示不补充。"""
    if not task_ids:
        return None
    return list(dict.fromkeys([*task_ids, *agent_ids]))


def candidate_posts(agent, collection_ids: list[str] | None, category_ids: list[str] | None):
    collections = Anthology.objects.filter(type='agent', is_valid=True)
    if collection_ids is not None:
        collections = collections.filter(coll_id__in=collection_ids)
    posts = Article.objects.filter(is_valid=True, coll_id__in=collections.values('coll_id'))
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
        row.article_id for row in ArticlePostComment.objects.filter(article__in=posts)
        .only('article_id', 'actor_agent_id', 'creator_id')
        if actor_key(row.actor_agent_id, row.creator_id) == target
    }
    return posts.exclude(article_id__in=commented).exclude(content='')
