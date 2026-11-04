import logging
import re
from datetime import date, datetime, time, timedelta
from django.db.models import Q
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from system_logs.capture import capture
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from ..life_time import SHANGHAI, storage_time
from ..ledger_details import ledger_details
from ..models import WorldLedger
from ..serializers import LedgerSerializer
from .queries import load_facts, visible_resident_ids
from .service import aggregate
from .combat_statistics import load_combat_statistics
from .combat_daily import pending_daily_parties
from .fishing_statistics import InvalidFishingStatisticsSource, load_fishing_statistics
from .lottery_statistics import load_lottery_statistics
from .consistency import analytics_snapshot
from .timing import AnalyticsTiming
from .archived_combat import InvalidCombatStatisticsSource

logger = logging.getLogger(__name__)
SLOW_ANALYTICS_MS = 3000


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

    def handle_exception(self, exc):
        if isinstance(exc, InvalidCombatStatisticsSource):
            logger.warning('已归档战斗统计来源无效：%s', exc)
            return valid_result('战斗统计来源存在异常，无法计算完整结果，请查看系统日志。',
                                {'reason': 'invalid_combat_statistics_source'}, status=409)
        return super().handle_exception(exc)

    def get(self, request):
        timing = AnalyticsTiming()
        params = AnalyticsParams(data=request.query_params)
        if not params.is_valid():
            return valid_result('统计筛选无效', params.errors, status=400)
        values = params.validated_data
        first, last, actor = values['start_date'], values['end_date'], values['actor_id']
        start = storage_time(datetime.combine(first, time.min, SHANGHAI))
        end = storage_time(datetime.combine(last+timedelta(days=1), time.min, SHANGHAI))
        owner = get_current_user_identifier(request)
        with analytics_snapshot() as include_daily:
            timing.mark('setup')
            facts = load_facts(request, owner, start, end, actor=actor, include_daily=include_daily, timing=timing)
            if actor and actor not in facts.residents:
                raise PermissionDenied('无法查看该居民的数据。')
            residents = {key: value for key, value in facts.residents.items() if not actor or key == actor}
            try:
                fishing = load_fishing_statistics(owner, start, end, residents, include_daily=include_daily)
            except InvalidFishingStatisticsSource as exc:
                logger.warning('钓鱼统计来源无效 owner=%s：%s', owner, exc)
                capture('钓鱼统计来源无效', module='agent_world', error_type='invalid_fishing_statistics_source',
                        user_id=owner, resource_id=exc.trip_id, fishing_trip_id=exc.trip_id,
                        fishing_event_id=exc.event_id, reason=f'{exc.reason}；事件 ID：{exc.event_id}')
                timing.mark('fishing')
                response = valid_result('钓鱼记录存在异常，无法计算完整统计，请查看系统日志。',
                                        {'reason': 'invalid_fishing_statistics_source'}, status=409)
            else:
                timing.mark('fishing')
                summary = aggregate(facts, first, last, actor)
                if include_daily:
                    total, pending = pending_daily_parties(owner)
                    if pending:
                        summary['notes'].append(
                            f'战斗历史统计已生成 {total-pending}/{total} 场；其余已结束场次仍会计入，加载可能较慢。')
                timing.mark('aggregate')
                lottery = load_lottery_statistics(owner, start, end, residents)
                timing.mark('lottery')
                combat = load_combat_statistics(owner, start, end, residents, include_daily=include_daily,
                                                departure_ids=facts.departure_ids,
                                                finished_departure_ids=facts.finished_departure_ids)
                timing.mark('combat_comparison')
                response = success_result({'startDate': first.isoformat(), 'endDate': last.isoformat(), 'actorId': actor,
                                           **summary, 'lotteryStatistics': lottery, 'fishingComparison': fishing,
                                           'combatComparison': combat})
        timing.mark('finish')
        durations = timing.header()
        response['Server-Timing'] = durations
        if timing.elapsed_ms() >= SLOW_ANALYTICS_MS:
            request_id = request.headers.get('X-Request-ID', '')
            if not re.fullmatch(r'[0-9a-f]{32}', request_id):
                request_id = 'unknown'
            logger.warning('resident analytics slow request_id=%s stages=%s', request_id, durations)
        return response


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
        ledger_query = WorldLedger.objects.filter(
            agent_id=values['actor_id'], created_at__gte=start, created_at__lt=end,
        ).exclude(kind='opening').exclude(amount=0).exclude(kind='investment', snapshot__side='buy')
        visible_count, entries, cursor = 0, [], None
        scan_size = 100
        from ..market_finance import classify_market_ledger_entries
        from ..investment_finance import settle_investment_entries
        while len(entries) <= page_size:
            batch_query = ledger_query
            if cursor is not None:
                batch_query = batch_query.filter(
                    Q(created_at__lt=cursor[0]) | Q(created_at=cursor[0], pk__lt=cursor[1]))
            batch = list(batch_query.order_by('-created_at', '-id')[:scan_size])
            if not batch:
                break
            cursor = (batch[-1].created_at, batch[-1].pk)
            classify_market_ledger_entries(batch, owner)
            settled = settle_investment_entries(batch, owner)
            for entry in settled:
                if visible_count >= offset:
                    entries.append(entry)
                    if len(entries) > page_size:
                        break
                visible_count += 1
            if len(batch) < scan_size or len(entries) > page_size:
                break
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
