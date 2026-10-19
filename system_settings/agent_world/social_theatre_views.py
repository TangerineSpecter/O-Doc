"""Owner-isolated read APIs for news discussion history."""
from django.db.models import Q
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from urllib.parse import urlparse
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .social_models import SocialEvent, SocialTheatreEvent
from .social_config import config_for
from .social_theatre_runner import queue_manual_event
from .farm_gate import guarded
from .social_relation_replay import rebuild_pairs


def event_list_item(row, *, detail=False):
    raw_url = str(row.source.get('url') or '')
    parsed = urlparse(raw_url)
    safe_url = raw_url if parsed.scheme in ('http', 'https') and parsed.netloc else ''
    data = {'id': row.pk, 'business_date': row.business_date, 'scheduled_at': row.scheduled_at,
            'status': row.status, 'error': row.error, 'manual': bool((row.snapshot or {}).get('manual')),
            'message_count': len(row.transcript),
            'source': {'title': str(row.source.get('title') or '')[:200],
                       'summary': str(row.source.get('summary') or ''),
                       'url': safe_url, 'published_at': row.source.get('published_at') or ''},
            'topic': {key: (row.snapshot or {}).get('topic', {}).get(key, '')
                      for key in ('title', 'event', 'question', 'tradeoff')}
                     if (row.snapshot or {}).get('topic') else None,
            'participants': [{'id': person.get('id', ''), 'name': person.get('name', ''),
                              'avatar': person.get('avatar', '')} for person in row.participants]}
    if detail:
        profiles = {str(person.get('id')): person for person in row.participants}
        snapshot = row.snapshot or {}
        data.update({'progress': {
            'stage': snapshot.get('stage', ''),
            'speaker_name': snapshot.get('active_speaker_name', ''),
            'started_at': snapshot.get('scene_started_at', ''),
            'stage_started_at': snapshot.get('stage_started_at', ''),
            'message_count': len(row.transcript),
            'reviewed_count': len(snapshot.get('relation_reviews', [])),
            'participant_count': len(row.participants),
            'candidate_index': snapshot.get('candidate_index', 0),
            'candidate_count': snapshot.get('candidate_count', 0),
        }, 'rounds': row.rounds, 'transcript': [
            {'id': turn.get('id', ''), 'reply_to': turn.get('reply_to', ''),
             'round': turn.get('round', 0), 'speaker_id': turn.get('speaker_id', ''),
             'name': turn.get('name') or profiles.get(str(turn.get('speaker_id')), {}).get('name', ''),
             'avatar': turn.get('avatar') or profiles.get(str(turn.get('speaker_id')), {}).get('avatar', ''),
             'content': str(turn.get('content') or ''), 'created_at': turn.get('created_at', '')}
            for turn in row.transcript
        ], 'relation_changes': _relation_changes(row)})
    return data


def _relation_changes(row):
    owner = getattr(row, 'owner_id', None)
    if not owner:
        return []
    changes = SocialEvent.objects.filter(owner_id=owner, source_key=f'theatre:{row.pk}').order_by('pk')
    result = []
    for event in changes:
        result.append({'actor_id': event.actor_id, 'counterpart_id': event.counterpart_id,
                       'actor_name': event.after.get('actor_identity', {}).get('name', event.actor_id),
                       'counterpart_name': event.after.get('counterpart_identity', {}).get('name', event.counterpart_id),
                       'affinity_delta': event.after.get('affinity', 0) - event.before.get('affinity', 0),
                       'familiarity_delta': event.after.get('familiarity', 0) - event.before.get('familiarity', 0),
                       'category': event.category, 'reason': event.reason})
    return result


class SocialTheatreListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        owner = get_current_user_identifier(request)
        all_rows = SocialTheatreEvent.objects.filter(owner_id=owner)
        rows = all_rows.exclude(status='deleted').exclude(
            status__in=('skipped', 'failed', 'expired', 'completed'), transcript=[]
        ).order_by('-business_date', '-scheduled_at', '-pk')
        cursor = request.query_params.get('before')
        if cursor:
            marker = all_rows.filter(pk=cursor).first()
            if marker:
                rows = rows.filter(Q(business_date__lt=marker.business_date) |
                                   Q(business_date=marker.business_date, scheduled_at__lt=marker.scheduled_at) |
                                   Q(business_date=marker.business_date, scheduled_at=marker.scheduled_at, pk__lt=marker.pk))
        values = list(rows[:31])
        return success_result({'items': [event_list_item(row) for row in values[:30]],
                               'next_cursor': values[29].pk if len(values) > 30 else None})


class SocialTheatreDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, identity):
        owner = get_current_user_identifier(request)
        row = SocialTheatreEvent.objects.filter(owner_id=owner, pk=identity).exclude(status='deleted').first()
        if not row:
            return valid_result('小剧场记录不存在', status=404)
        return success_result(event_list_item(row, detail=True))

    @guarded
    def delete(self, request, identity):
        owner = get_current_user_identifier(request)
        with transaction.atomic():
            row = SocialTheatreEvent.objects.select_for_update().filter(
                owner_id=owner, pk=identity).first()
            if not row:
                return valid_result('小剧场记录不存在', status=404)
            if row.status in ('scheduled', 'searching', 'running'):
                return valid_result('讨论进行中，暂时不能删除', status=409)
            if row.status != 'deleted':
                row.status = 'deleted'
                row.save(update_fields=['status', 'updated_at'])
            # 同一个事务内撤销影响；重复删除也能修复旧版本只隐藏的记录。
            pairs = SocialEvent.objects.filter(owner_id=owner, source_key=f'theatre:{row.pk}').values_list(
                'actor_id', 'counterpart_id')
            rebuild_pairs(owner, pairs)
        return success_result({'deleted': True})


class SocialTheatreTriggerView(APIView):
    permission_classes = [IsAuthenticated]

    @guarded
    def post(self, request):
        owner = get_current_user_identifier(request)
        try:
            row = queue_manual_event(config_for(owner))
        except ValueError as exc:
            return valid_result(str(exc), status=409)
        from .social_theatre_worker import start_manual_theatre_worker
        transaction.on_commit(lambda: start_manual_theatre_worker(owner))
        return success_result({'event': event_list_item(row, detail=True)})


class SocialTheatreResumeView(APIView):
    permission_classes = [IsAuthenticated]

    @guarded
    def post(self, request, identity):
        from system_settings.models import WorldActionRuntime
        from .life_time import local_time, storage_time
        from .social_config import settings_for
        from .social_theatre_runner import _window_for
        from .social_theatre_worker import start_manual_theatre_worker

        owner = get_current_user_identifier(request)
        now = local_time()
        with transaction.atomic():
            row = SocialTheatreEvent.objects.select_for_update().filter(owner_id=owner, pk=identity).first()
            if not row or row.status == 'deleted':
                return valid_result('小剧场记录不存在', status=404)
            if row.status != 'failed':
                return valid_result('仅中断的讨论可以继续', status=409)
            if SocialEvent.objects.filter(owner_id=owner, source_key=f'theatre:{row.pk}').exists():
                return valid_result('本场已结算关系，不能重复执行', status=409)
            if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists() or not settings_for(config_for(owner))['enabled']:
                return valid_result('请先开启世界运行和自动社交', status=409)
            bounds = _window_for(row, now)
            if row.business_date != now.date() or not bounds or not bounds[0] <= now < bounds[1]:
                return valid_result('仅可在当天活跃时间内继续讨论', status=409)
            row.status = 'scheduled'
            row.scheduled_at = storage_time(now)
            row.error = ''
            row.snapshot = {**row.snapshot, 'resume': True}
            row.save(update_fields=['status', 'scheduled_at', 'error', 'snapshot', 'updated_at'])
            transaction.on_commit(lambda: start_manual_theatre_worker(owner))
        return success_result({'event': event_list_item(row, detail=True)})
