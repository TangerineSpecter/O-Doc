from datetime import date, datetime, time, timedelta
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from ..life_time import SHANGHAI, storage_time
from ..ledger_details import ledger_details
from ..models import WorldLedger
from ..serializers import LedgerSerializer
from .queries import load_facts, visible_resident_ids
from .service import aggregate
from .combat_statistics import load_combat_statistics


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
        residents = {key: value for key, value in facts.residents.items() if not actor or key == actor}
        return success_result({'startDate': first.isoformat(), 'endDate': last.isoformat(), 'actorId': actor,
                               **aggregate(facts, first, last, actor),
                               'combatComparison': load_combat_statistics(get_current_user_identifier(request), start, end, residents)})


class AnalyticsLedgerParams(serializers.Serializer):
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    actor_id = serializers.CharField(max_length=40)
    page = serializers.IntegerField(min_value=1, max_value=1000000, default=1)
    page_size = serializers.IntegerField(min_value=1, max_value=50, default=30)

    def validate(self, attrs):
        first, last = attrs['start_date'], attrs['end_date']
        if first > last or (last-first).days >= 366 or last == date.max:
            raise serializers.ValidationError('请选择起止顺序正确、最多 366 天的日期范围。')
        return attrs


class AnalyticsLedgerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = AnalyticsLedgerParams(data=request.query_params)
        if not params.is_valid():
            return valid_result('收支明细筛选无效', params.errors, status=400)
        values = params.validated_data
        owner = get_current_user_identifier(request)
        if values['actor_id'] not in visible_resident_ids(owner):
            raise PermissionDenied('无法查看该居民的数据。')

        start = storage_time(datetime.combine(values['start_date'], time.min, SHANGHAI))
        end = storage_time(datetime.combine(values['end_date']+timedelta(days=1), time.min, SHANGHAI))
        page, page_size = values['page'], values['page_size']
        offset = (page-1)*page_size
        entries = list(WorldLedger.objects.filter(
            agent_id=values['actor_id'], created_at__gte=start, created_at__lt=end,
        ).exclude(kind='opening').exclude(amount=0).order_by('-created_at', '-id')[offset:offset+page_size+1])
        has_more = len(entries) > page_size
        entries = entries[:page_size]
        details = ledger_details(entries, owner)
        serialized = LedgerSerializer(entries, many=True).data
        items = [
            {**row, 'detail': details.get(entry.pk, '')}
            for entry, row in zip(entries, serialized)
        ]
        return success_result({'items': items, 'page': page, 'pageSize': page_size,
                               'hasMore': has_more, 'nextPage': page+1 if has_more else None})
