from datetime import datetime
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.response_utils import success_result, valid_result
from . import details as request_details
from .queries import breakdown, filtered_usage, summary, visible_usage
from .report import export_report
from system_settings.agent_world.life_time import local_time, storage_time

REQUEST_FIELDS = ('id', 'agent_key', 'agent_name', 'task_key', 'task_name', 'record_key',
                  'purpose', 'phase', 'model_name', 'provider_name', 'attempt', 'status',
                  'input_tokens', 'output_tokens', 'total_tokens', 'cached_tokens', 'reasoning_tokens',
                  'usage_complete', 'started_at', 'ended_at')


class TokenUsageView(APIView):
    permission_classes = [IsAuthenticated]
    kind = 'summary'

    def get(self, request, request_id=None):
        try:
            request_details.maintain()
            if self.kind == 'content':
                row = visible_usage(request).filter(pk=request_id).only('id', 'started_at', 'status', 'ended_at').first()
                if row is None:
                    raise NotFound()
                detail = request_details.read(row.pk, row.started_at)
                if detail is not None and row.status != 'running' and detail.get('status') != row.status:
                    # 写入失败可能只留下请求中的旧快照，不能将其展示成完整结果。
                    detail = None
                data = ({'available': False, 'message': '请求内容未记录或已超过 30 天保留期'} if detail is None else {
                    'available': True,
                    'request': detail.get('request'),
                    'response': detail.get('response'),
                    'status': row.status,
                    'error_type': detail.get('error_type'),
                    'started_at': detail.get('started_at'),
                    'ended_at': local_time(row.ended_at).isoformat() if row.ended_at else None,
                })
                result = success_result(data)
                result['Cache-Control'] = 'no-store'
                return result
            rows = filtered_usage(request)
            if self.kind == 'export':
                return export_report(rows, request)
            if self.kind == 'summary':
                return success_result(summary(rows, request))
            if self.kind == 'breakdown':
                page = int(request.query_params.get('page', '1'))
                if page < 1:
                    raise ValueError('页码无效')
                return success_result(breakdown(rows, request.query_params.get('group', 'agent'), page))
            cursor = request.query_params.get('cursor')
            if cursor:
                moment, separator, key = cursor.rpartition('|')
                moment = datetime.fromisoformat(moment)
                if not separator or not key or not timezone.is_aware(moment) or len(cursor) > 200:
                    raise ValueError('游标无效')
                moment = storage_time(moment)
                rows = rows.filter(Q(started_at__lt=moment) | Q(started_at=moment, id__lt=key))
            items = list(rows.order_by('-started_at', '-id').values(*REQUEST_FIELDS)[:51])
            for item in items:
                item['started_at'] = local_time(item['started_at']).isoformat()
                item['ended_at'] = local_time(item['ended_at']).isoformat() if item['ended_at'] else None
            more = len(items) > 50
            items = items[:50]
            return success_result({'items': items, 'has_more': more,
                'next_cursor': f"{items[-1]['started_at']}|{items[-1]['id']}" if more else None})
        except (ValueError, TypeError, OverflowError):
            return valid_result('日期、筛选条件或分页参数无效', status=400)
