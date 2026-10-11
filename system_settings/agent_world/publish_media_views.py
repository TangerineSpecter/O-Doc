"""帖子配图管理只允许文集管理者操作，不暴露生图请求或参考资源。"""
import hashlib
from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from article.access import get_visible_article_queryset
from article.access import can_manage_anthology, can_access_anthology
from system_settings.models import Agent, WorldAction
from utils.response_utils import success_result, valid_result
from .publish_media import public_photo, operate_photo, recover_photo


class PostPhotoView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def article_for(self, request, post_id, *, write=False):
        article = get_object_or_404(get_visible_article_queryset(request), pk=post_id, is_valid=True)
        if not article.agent_post_author_id or article.content_format != 'markdown':
            raise Http404
        permitted = can_manage_anthology(request, article.coll_id) if write else can_access_anthology(request, article.coll_id)
        if not permitted:
            raise PermissionDenied('无权管理此帖子配图')
        return article

    @staticmethod
    def action_for(article):
        actions = WorldAction.objects.filter(status='success', snapshot__post_id=article.pk).select_related('agent', 'task')
        return (actions.filter(snapshot__photo__isnull=False).order_by('-updated_at', '-pk').first()
                or actions.order_by('-updated_at', '-pk').first())

    @staticmethod
    @transaction.atomic
    def create_manual_action(article):
        agent = Agent.objects.filter(pk=article.agent_post_author_id).first()
        if not agent:
            raise ValueError('帖子所属居民已不存在')
        action_id = 'post-manual-photo:' + hashlib.sha256(str(article.pk).encode()).hexdigest()[:40]
        action, _ = WorldAction.objects.get_or_create(pk=action_id, defaults={
            'agent': agent,
            'actor_id': agent.pk,
            'status': 'success',
            'snapshot': {
                'post_id': str(article.pk),
                'config': {'owner_id': article.author, 'rules': []},
                'selection': {'category_id': str(article.agent_post_category_ref_id or '')},
            },
        })
        return action

    def get(self, request, post_id):
        article = self.article_for(request, post_id)
        action = self.action_for(article)
        value = public_photo(action, article)
        value['can_manage'] = can_manage_anthology(request, article.coll_id)
        return success_result(value)

    def post(self, request, post_id):
        article = self.article_for(request, post_id, write=True)
        operation = request.data.get('action')
        if operation in ('generate', 'retry') and request.data.get('confirm_charge') is not True:
            return valid_result('重新生成可能产生费用，请确认', status=400)
        action = self.action_for(article)
        if action is None and operation == 'generate':
            try:
                action = self.create_manual_action(article)
            except ValueError as exc:
                return valid_result(str(exc), status=400)
        if action is None:
            return valid_result('没有可管理的帖子配图记录', status=404)
        try:
            action = operate_photo(action, operation)
            if operation == 'query':
                # 在事务提交后恢复原任务，响应包含本次查询/下载结果。
                recover_photo(action, query_only=True)
                action.refresh_from_db()
        except ValueError as exc:
            return valid_result(str(exc), status=400)
        return success_result({**public_photo(action), 'can_manage': True})
