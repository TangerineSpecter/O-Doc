"""居民活动时间线只读接口。"""
from datetime import date, datetime, time

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .daily_feed import CATEGORIES, day_events, latest_event_day
from .life_time import SHANGHAI, local_time, storage_time


class DailyFeedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        raw_day = request.query_params.get('date')
        selected_day = None
        if raw_day is not None:
            try:
                selected_day = date.fromisoformat(raw_day)
                if selected_day.isoformat() != raw_day:
                    raise ValueError()
            except (TypeError, ValueError):
                return valid_result('日期无效', status=400)
        category = request.query_params.get('category', 'all')
        if category not in CATEGORIES | {'all'}:
            return valid_result('活动分类无效', status=400)
        actor = str(request.query_params.get('actor_id') or '')[:40]
        cursor = str(request.query_params.get('cursor') or '')
        cursor_at = None
        if cursor:
            moment, separator, identity = cursor.rpartition('|')
            try:
                if not separator or not identity or len(cursor) > 300:
                    raise ValueError()
                cursor_at = local_time(datetime.fromisoformat(moment))
                moment = cursor_at.isoformat()
            except ValueError:
                return valid_result('活动游标无效', status=400)
        owner = get_current_user_identifier(request)
        size = 30
        today = local_time().date()
        if selected_day is not None:
            all_events, events, counts, global_total, actor_counts = day_events(request, owner, selected_day, actor)
            filtered = all_events if category == 'all' else [row for row in events if category in row.get('categories', [row['category']])]
            total = len(filtered)
            if cursor:
                filtered = [row for row in filtered if (row['occurredAt'], row['id']) < (moment, identity)]
            shown = filtered[:size]
            has_more = len(filtered) > size
        else:
            # 今日数字只读取今日事实；历史页按最近有记录的日期逐日取，避免每次轮询扫描全部历史。
            today_all, today_events, counts, global_total, actor_counts = day_events(request, owner, today, actor)
            filtered = []
            current_day = cursor_at.date() if cursor_at else today
            while current_day is not None and len(filtered) <= size:
                if current_day == today:
                    all_events, events = today_all, today_events
                else:
                    all_events, events, _, _, _ = day_events(request, owner, current_day, actor)
                rows = all_events if category == 'all' else [row for row in events if category in row.get('categories', [row['category']])]
                if cursor:
                    rows = [row for row in rows if (row['occurredAt'], row['id']) < (moment, identity)]
                filtered.extend(rows[:size + 1 - len(filtered)])
                if len(filtered) > size:
                    break
                before = storage_time(datetime.combine(current_day, time.min, SHANGHAI))
                current_day = latest_event_day(request, owner, before, category)
            total = len(filtered[:size])
            shown = filtered[:size]
            has_more = len(filtered) > size
        return success_result({
            'date': selected_day.isoformat() if selected_day else today.isoformat(), 'items': shown,
            'nextCursor': f"{shown[-1]['occurredAt']}|{shown[-1]['id']}" if has_more and shown else None,
            'hasMore': has_more,
            'total': total, 'allTotal': global_total,
            'counts': counts,
            'actorCounts': actor_counts,
        })
