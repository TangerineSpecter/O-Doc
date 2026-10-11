"""帖子配图管理只允许文集管理者操作，不暴露生图请求或参考资源。"""
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from article.models import Article
from article.access import get_visible_article_queryset
from article.access import can_manage_anthology, can_access_anthology
from system_settings.models import WorldAction
from utils.response_utils import success_result, valid_result
from .publish_media import public_photo, operate_photo


class PostPhotoView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == 'GET' else [IsAuthenticated()]

    def action_for(self, request, post_id, *, write=False):
        article = get_object_or_404(get_visible_article_queryset(request), pk=post_id, is_valid=True)
        permitted = can_manage_anthology(request, article.coll_id) if write else can_access_anthology(request, article.coll_id)
        if not permitted:
            raise PermissionDenied('无权管理此帖子配图')
        return WorldAction.objects.filter(status='success', snapshot__post_id=post_id,
            snapshot__photo__isnull=False).select_related('agent', 'task').first()

    def get(self, request, post_id):
        action = self.action_for(request, post_id)
        value = public_photo(action)
        article = Article.objects.get(pk=post_id)
        value['can_manage'] = can_manage_anthology(request, article.coll_id)
        return success_result(value)

    def post(self, request, post_id):
        action = self.action_for(request, post_id, write=True)
        if not action:
            return valid_result('没有配图任务', status=404)
        operation = request.data.get('action')
        if operation == 'retry' and request.data.get('confirm_charge') is not True:
            return valid_result('重新生成可能产生费用，请确认', status=400)
        try:
            action = operate_photo(action, operation)
        except (ValueError, Article.DoesNotExist) as exc:
            return valid_result(str(exc), status=400)
        return success_result({**public_photo(action), 'can_manage': True})
