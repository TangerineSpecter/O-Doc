"""真实用户阅读标记与 Agent 发帖前检查。"""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from article.access import can_access_anthology, get_visible_article_queryset
from article.models import Article
from article.annotation_service import get_agent_identity
from anthology.models import Anthology
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result


class AgentPostReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, article_id):
        post = get_visible_article_queryset(request).filter(article_id=article_id).first()
        if post is None or not can_access_anthology(request, post.coll_id, 'agent'):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND, status=404)
        # save 触发已有业务记录修订机制；重复打开不制造新修订。
        if not post.agent_post_has_been_read:
            post.agent_post_has_been_read = True
            post.save(update_fields=['agent_post_has_been_read', 'updated_at'])
        return success_result(data={'article_id': post.article_id, 'agent_post_has_been_read': True})


def check_agent_post_publish(arguments: dict, agent) -> dict:
    agent_id = str(getattr(agent, 'id', '') or '').strip()
    if not agent_id:
        raise ValueError('需要由已绑定的 Agent 检查发帖条件')
    count = arguments.get('count')
    if type(count) is not int or count < 1:
        raise ValueError('count 必须是正整数，表示检查最近多少篇帖子')
    collections = Anthology.objects.filter(type='agent', is_valid=True)
    coll_id = arguments.get('coll_id')
    if coll_id is not None:
        if not isinstance(coll_id, str) or not coll_id.strip():
            raise ValueError('coll_id 必须是非空字符串')
        collections = collections.filter(coll_id=coll_id.strip())
        if not collections.exists():
            raise ValueError('指定的 Agent 帖子文集不存在或已删除')
    posts = list(Article.objects.filter(
        is_valid=True, coll_id__in=collections.values('coll_id'),
        agent_post_creator_id=get_agent_identity(agent)['creator_id'],
    ).order_by('-created_at', '-article_id').values(
        'article_id', 'title', 'agent_post_has_been_read',
    )[:count])
    read_count = sum(post['agent_post_has_been_read'] for post in posts)
    can_publish = len(posts) < count or read_count > 0
    reason = ('帖子数量不足检查篇数，可以发表' if len(posts) < count else
              '最近帖子已有用户阅读，可以发表' if read_count else
              '最近指定篇数的帖子全部无人阅读，请跳过本次发帖')
    return {'can_publish': can_publish, 'reason': reason, 'requested_count': count,
            'checked_count': len(posts), 'read_count': read_count, 'posts': posts}
