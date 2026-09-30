"""为评论批量匹配作者在同一帖子上的当前有效评分。"""
from functools import lru_cache

from article.models import ArticlePostRating
from system_settings.agent_world.identity import actor_key


def comment_ratings(comments) -> dict[str, int]:
    comments = [c for c in comments if not getattr(c, 'parent_comment_id', '')]
    if not comments:
        return {}
    # 旧记录需要名称身份解析；仅在本次请求中缓存，避免每条评论重复查询。
    @lru_cache(maxsize=None)
    def identity(stable_id, legacy_id):
        key = actor_key(stable_id, legacy_id)
        # 无法唯一解析的历史名称不能用来推测居民身份。
        return '' if not stable_id and key.startswith('agent:') else key
    ratings = {}
    rows = ArticlePostRating.objects.filter(
        article_id__in={comment.article_id for comment in comments}, is_valid=True,
    ).order_by('-updated_at', '-rating_id')
    for row in rows:
        key = (row.article_id, identity(row.actor_agent_id, row.rater_id))
        ratings.setdefault(key, row.rating)
    return {
        comment.pk: ratings[key]
        for comment in comments
        if (key := (comment.article_id, identity(comment.actor_agent_id, comment.creator_id))) in ratings
        and key[1]
    }
