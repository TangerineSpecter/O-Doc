import logging
import threading

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from article.access import get_visible_anthology_queryset
from system_settings.feishu_im import (
    FeishuIMError,
    handle_feishu_message_event,
    normalize_feishu_event_payload,
    verify_feishu_token,
)
from system_settings.models import Agent, AgentActivity, AgentLongTermMemory, AgentRunRecord, AgentTask
from system_settings.serializers import (
    AgentActivitySerializer,
    AgentLongTermMemorySerializer,
    AgentRunRecordSerializer,
    AgentSerializer,
    AgentTaskSerializer,
)
from utils.response_utils import success_result, valid_result


logger = logging.getLogger(__name__)


class AgentRelationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from system_settings.agent_relation import relation_graph
        return success_result(relation_graph())


def _local_now():
    now = timezone.now()
    return now if timezone.is_naive(now) else timezone.localtime(now)


class AgentViewSet(viewsets.ModelViewSet):
    queryset = Agent.objects.select_related('model', 'model__provider').all()
    serializer_class = AgentSerializer

    @staticmethod
    def _sync_feishu_im_connection(agent_id):
        def sync_connection():
            from .feishu_im_ws import _feishu_im_ws_manager
            _feishu_im_ws_manager.sync_agent(agent_id)
        transaction.on_commit(sync_connection)

    def list(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        self._sync_feishu_im_connection(serializer.instance.id)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        self._sync_feishu_im_connection(instance.id)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        agent_id = instance.id
        self.perform_destroy(instance)
        self._sync_feishu_im_connection(agent_id)
        return success_result()

    @action(detail=True, methods=['get', 'post'], url_path='memories')
    def memories(self, request, pk=None):
        agent = self.get_object()
        if request.method.lower() == 'get':
            queryset = AgentLongTermMemory.objects.filter(agent=agent).order_by('-updated_at')
            return success_result(AgentLongTermMemorySerializer(queryset, many=True).data)
        serializer = AgentLongTermMemorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            agent=agent,
            scope=request.data.get('scope') or 'user',
            chat_id=request.data.get('chat_id') or request.data.get('chatId') or '',
            sender_id=request.data.get('sender_id') or request.data.get('senderId') or '',
            metadata={'source': 'manual'},
        )
        return success_result(serializer.data)

    @action(detail=True, methods=['put', 'delete'], url_path=r'memories/(?P<memory_id>[^/.]+)')
    def memory_detail(self, request, pk=None, memory_id=None):
        agent = self.get_object()
        memory = AgentLongTermMemory.objects.filter(agent=agent, id=memory_id).first()
        if not memory:
            response = valid_result('记忆不存在')
            response.status_code = 404
            return response
        if request.method.lower() == 'delete':
            memory.status = AgentLongTermMemory.STATUS_ARCHIVED
            memory.save(update_fields=['status', 'updated_at'])
            return success_result()
        serializer = AgentLongTermMemorySerializer(memory, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return success_result(serializer.data)

    @action(detail=True, methods=['post'], url_path='feishu/events', authentication_classes=[], permission_classes=[AllowAny])
    def feishu_events(self, request, pk=None):
        agent = self.get_object()
        if not agent.feishu_im_enabled:
            return valid_result('Agent 未启用飞书 IM 通道')
        try:
            normalized = normalize_feishu_event_payload(request.data, agent.feishu_encrypt_key)
            if normalized['kind'] == 'challenge':
                verify_feishu_token(agent, (normalized.get('payload') or {}).get('token', ''))
                return Response({'challenge': normalized.get('challenge', '')})
            if normalized['kind'] == 'ignored':
                return success_result({'detail': '事件已忽略', 'event_type': normalized.get('event_type')})
            verify_feishu_token(agent, normalized.get('token', ''))
            return success_result(handle_feishu_message_event(agent, normalized))
        except FeishuIMError as exc:
            return valid_result(str(exc))


class AgentTaskViewSet(viewsets.ModelViewSet):
    queryset = AgentTask.objects.select_related('agent', 'followup_agent').all()
    serializer_class = AgentTaskSerializer

    def list(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        self.perform_destroy(self.get_object())
        return success_result()

    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        task = self.get_object()
        logger.info('Manual agent task requested: id=%s, name=%s', task.id, task.name)

        def runner():
            from system_settings.agent_task_scheduler import _agent_task_scheduler
            _agent_task_scheduler.run_manual_task(task.id)

        threading.Thread(target=runner, name=f'agent-task-manual-{task.id}', daemon=True).start()
        return success_result({'detail': '任务已开始执行'})


class AgentRunRecordViewSet(viewsets.ModelViewSet):
    queryset = AgentRunRecord.objects.select_related('task', 'agent').all()
    serializer_class = AgentRunRecordSerializer

    def list(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.get_object()).data)


class AgentActivityViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AgentActivity.objects.select_related('agent', 'run_record').all()
    serializer_class = AgentActivitySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        visible_coll_ids = get_visible_anthology_queryset(self.request).values_list('coll_id', flat=True)
        return super().get_queryset().filter(
            Q(activity_type='work') | Q(artifact_coll_id__in=visible_coll_ids)
        )

    def list(self, request, *args, **kwargs):
        # The cursor uses the id as the stable tie-breaker, so keep the database
        # ordering aligned with the cursor predicate for equal timestamps.
        queryset = self.get_queryset().order_by('-occurred_at', '-id')
        agent_id = str(request.query_params.get('agent') or '').strip()
        activity_type = str(request.query_params.get('type') or '').strip()
        cursor = str(request.query_params.get('cursor') or '').strip()
        try:
            limit = min(max(int(request.query_params.get('limit') or 20), 1), 50)
        except (TypeError, ValueError):
            limit = 20

        if agent_id:
            queryset = queryset.filter(agent_id=agent_id)
        if activity_type in {'work', 'publication', 'interaction'}:
            queryset = queryset.filter(activity_type=activity_type)
        if cursor:
            cursor_time, separator, cursor_id = cursor.rpartition('|')
            before = parse_datetime(cursor_time if separator else cursor)
            if before:
                if separator and cursor_id:
                    queryset = queryset.filter(Q(occurred_at__lt=before) | Q(occurred_at=before, id__lt=cursor_id))
                else:
                    queryset = queryset.filter(occurred_at__lt=before)

        items = list(queryset[:limit + 1])
        has_more = len(items) > limit
        items = items[:limit]
        next_cursor = f'{items[-1].occurred_at.isoformat()}|{items[-1].id}' if has_more and items else None
        return success_result({
            'items': self.get_serializer(items, many=True).data,
            'nextCursor': next_cursor,
            'hasMore': has_more,
        })

    @action(detail=False, methods=['get'], url_path='today-summary')
    def today_summary(self, request):
        today = _local_now().date()
        today_activities = self.get_queryset().filter(occurred_at__date=today)
        ordered_activities = self.get_queryset().order_by('-occurred_at', '-id')
        latest = list(ordered_activities[:3])
        counts = {
            item['agent_id']: item['count']
            for item in today_activities.exclude(agent_id=None).values('agent_id').annotate(count=Count('id'))
        }
        agents_queryset = list(Agent.objects.all())
        agent_count = len(agents_queryset)
        latest_by_agent = {}
        for activity in ordered_activities.exclude(agent_id=None):
            if activity.agent_id not in latest_by_agent:
                latest_by_agent[activity.agent_id] = activity
            if len(latest_by_agent) >= agent_count:
                break
        running_by_agent = {}
        for activity in ordered_activities.filter(status='running').exclude(agent_id=None):
            running_by_agent.setdefault(activity.agent_id, activity)
        agents = []
        for agent in agents_queryset:
            activity = latest_by_agent.get(agent.id)
            running_activity = running_by_agent.get(agent.id)
            agents.append({
                'id': agent.id,
                'name': agent.name,
                'avatar': agent.avatar,
                'status': 'running' if running_activity else 'idle',
                'currentAction': running_activity.current_action if running_activity else '',
                'latestTitle': activity.title if activity else '',
                'todayCount': counts.get(agent.id, 0),
            })
        return success_result({
            'todayActivityCount': today_activities.count(),
            'todayWorkCount': today_activities.filter(activity_type='publication').count(),
            'activeAgentCount': ordered_activities.filter(status='running').exclude(agent_id=None).values('agent_id').distinct().count(),
            'latest': self.get_serializer(latest, many=True).data,
            'agents': agents,
        })
