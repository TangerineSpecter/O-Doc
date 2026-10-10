from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import serializers
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from system_settings.sync_state import permanent_deletion
from learning.locking import domain_lock
from .models import Sprout, SproutJob
from .sprout_services import create_sprout, save_article


def present(row):
    job = SproutJob.objects.filter(pk=row.pk).first()
    return {'id': row.pk, 'sources': row.sources, 'direction': row.direction, 'model_id': row.model_id,
            'result': row.result, 'status': row.status, 'article_id': row.article_id,
            'stage': job.stage if job else ('已完成' if row.status == 'ready' else '本机没有执行任务'),
            'error': job.error if job else '', 'created_at': row.created_at}


class SproutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        response = super().handle_exception(exc)
        if isinstance(exc, serializers.ValidationError):
            response.status_code = 400
        if 'detail' in response.data:
            return valid_result(msg=str(response.data['detail']), status=response.status_code)
        return response


class SproutView(SproutAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, sprout_id=None):
        rows = Sprout.objects.filter(owner_id=get_current_user_identifier(request))
        if sprout_id:
            return success_result(data=present(get_object_or_404(rows, pk=sprout_id)))
        return success_result(data=[present(row) for row in rows.order_by('-created_at')[:100]])

    def post(self, request):
        return success_result(data=present(create_sprout(get_current_user_identifier(request), request.data)))

    def delete(self, request, sprout_id):
        with domain_lock(), transaction.atomic(), permanent_deletion():
            row = get_object_or_404(Sprout.objects.select_for_update(), pk=sprout_id, owner_id=get_current_user_identifier(request))
            row.delete()
        return success_result()


class SproutActionView(SproutAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, sprout_id, action):
        owner = get_current_user_identifier(request)
        row = get_object_or_404(Sprout, pk=sprout_id, owner_id=owner)
        if action == 'regenerate':
            data = {**request.data, 'memo_ids': [s['memo_id'] for s in row.sources],
                    'direction': request.data.get('direction', row.direction), 'model_id': request.data.get('model_id', row.model_id)}
            return success_result(data=present(create_sprout(owner, data, snapshots=row.sources)))
        if action == 'save':
            from article.serializers import ArticleSerializer
            return success_result(data=ArticleSerializer(save_article(sprout_id, owner, request.data, request), context={'request': request}).data)
        if action != 'cancel':
            raise serializers.ValidationError('未知操作')
        with domain_lock(), transaction.atomic():
            job = SproutJob.objects.select_for_update().filter(pk=row.pk).first()
            if job and job.state in ('pending', 'running'):
                job.cancelled, job.state, job.token = True, 'cancelled', ''
                job.stage = '已取消'
                job.save()
                row.status = 'cancelled'
                row.save(update_fields=['status', 'updated_at'])
        return success_result(data=present(row))


class SproutOptionsView(SproutAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from system_settings.models import AIModel, MCPServer
        from utils.mcp_client import get_builtin_system_mcp_scope
        tools = []
        for server in MCPServer.objects.filter(enabled=True, available_in_chat=True):
            if get_builtin_system_mcp_scope(server):
                continue
            for tool in server.tools or []:
                if tool.get('enabled', True):
                    tools.append({'server_id': server.pk, 'name': tool['name'], 'label': f"{server.name} / {tool['name']}", 'description': tool.get('description', '')})
        return success_result(data={'models': list(AIModel.objects.filter(type='chat').values('id', 'name')), 'tools': tools})
