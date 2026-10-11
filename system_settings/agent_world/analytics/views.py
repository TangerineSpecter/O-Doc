from datetime import date, datetime, time, timedelta
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from ..life_time import SHANGHAI, storage_time
from .queries import load_facts
from .service import aggregate


class AnalyticsParams(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    actor_id = serializers.CharField(required=False, allow_blank=True, max_length=40, default='')

    def validate(self, attrs):
        first, last = attrs['start_date'], attrs['end_date']
        if first > last or (last-first).days >= 366 or last == date.max:
            raise serializers.ValidationError('请选择起止顺序正确、最多 366 天的日期范围。')
        return attrs


class AnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = AnalyticsParams(data=request.query_params)
        if not params.is_valid():
            return valid_result('统计筛选无效', params.errors, status=400)
        values = params.validated_data
        first, last, actor = values['start_date'], values['end_date'], values['actor_id']
        start = storage_time(datetime.combine(first, time.min, SHANGHAI))
        end = storage_time(datetime.combine(last+timedelta(days=1), time.min, SHANGHAI))
        facts = load_facts(request, get_current_user_identifier(request), start, end)
        if actor and actor not in facts.residents:
            raise PermissionDenied('无法查看该居民的数据。')
        return success_result({'startDate': first.isoformat(), 'endDate': last.isoformat(), 'actorId': actor,
                               **aggregate(facts, first, last, actor)})
