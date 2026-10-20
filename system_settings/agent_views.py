from .agent_world.farm_gate import guarded
import logging
import threading

from django.db import transaction, IntegrityError
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
        from utils.drf_utils import get_current_user_identifier
        return success_result(relation_graph(
            owner_id=get_current_user_identifier(request),
            include_departed=request.query_params.get('include_departed', request.query_params.get('includeDeparted', '')).lower() == 'true',
        ))


def _local_now():
    now = timezone.now()
    return now if timezone.is_naive(now) else timezone.localtime(now)


from .loadout_portrait_views import LoadoutPortraitActions


class AgentViewSet(LoadoutPortraitActions, viewsets.ModelViewSet):
    queryset = Agent.objects.select_related('model', 'model__provider', 'profession').all()
    serializer_class = AgentSerializer

    def get_object(self):
        agent = super().get_object()
        if agent.archived and self.request.method not in ('GET', 'HEAD', 'OPTIONS') and self.action not in ('archive', 'restore', 'destroy'):
            from .agent_archive import AgentArchivedError
            raise AgentArchivedError('居民已归档，请先恢复再编辑或执行')
        return agent

    def get_queryset(self):
        rows = super().get_queryset()
        if self.action == 'list':
            status = self.request.query_params.get('status', 'active')
            if status == 'active':
                return rows.filter(archived_at__isnull=True)
            if status == 'archived':
                return rows.filter(archived_at__isnull=False)
            if status != 'all':
                from rest_framework.exceptions import ValidationError
                raise ValidationError('居民状态必须为 active、archived 或 all')
        return rows

    def handle_exception(self, exc):
        from .agent_archive import AgentNameConflict, AgentArchivedError
        if isinstance(exc, AgentArchivedError):
            return valid_result(str(exc), status=409)
        if isinstance(exc, AgentNameConflict):
            return valid_result(str(exc), data={'agentId': exc.agent.pk, 'archived': exc.agent.archived}, status=409)
        return super().handle_exception(exc)

    def _save_agent(self, serializer):
        from .agent_archive import check_name
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError:
            check_name(serializer.validated_data.get('name', ''), serializer.instance.pk if serializer.instance else None)
            raise

    @action(detail=False, methods=['post'], url_path='describe-avatar', permission_classes=[IsAuthenticated])
    def describe_avatar(self, request):
        from .agent_prompt_generation import DescribeAgentAvatarSerializer, describe_avatar
        serializer = DescribeAgentAvatarSerializer(data=request.data)
        if not serializer.is_valid():
            return valid_result(msg='请提供有效的头像资源', data=serializer.errors, status=400)
        return success_result(describe_avatar(request, serializer.validated_data['avatar']))

    @action(detail=False, methods=['post'], url_path='organize-role', permission_classes=[IsAuthenticated])
    def organize_role(self, request):
        from .agent_role_organizer import OrganizeRoleSerializer, organize_role
        serializer = OrganizeRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            return success_result(organize_role(serializer.validated_data))
        except Exception:
            logger.exception('Role organization failed')
            return valid_result(msg='整理失败，请检查模型配置或重试；原设定未修改', status=502)

    @action(detail=False, methods=['post'], url_path='generate-prompt', permission_classes=[IsAuthenticated])
    def generate_prompt(self, request):
        from .agent_prompt_generation import AgentPromptOutputError, GenerateAgentPromptSerializer, describe_avatar, generate_agent_prompt
        serializer = GenerateAgentPromptSerializer(data=request.data)
        if not serializer.is_valid():
            message = next(iter(serializer.errors.values()))[0]
            return valid_result(msg=str(message), data=serializer.errors, status=400)
        data = dict(serializer.validated_data)
        avatar_used, warning = bool(data['avatar_description']), ''
        if data['reference_avatar']:
            vision = describe_avatar(request, data['avatar'])
            data['avatar_description'] = vision['description']
            avatar_used, warning = vision['avatar_used'], vision['warning']
        try:
            result = generate_agent_prompt(data)
        except AgentPromptOutputError as exc:
            return valid_result(msg=str(exc), status=502)
        except ValueError as exc:
            if str(exc) == 'No default model configured':
                return valid_result(msg='请先选择对话模型或配置系统默认对话模型', status=400)
            return valid_result(msg='角色设定生成不完整，请检查模型配置或重试', status=502)
        except Exception:
            logger.exception('Agent prompt generation failed')
            return valid_result(msg='生成失败，请检查模型配置或稍后重试', status=502)
        research_warning = result.pop('research_warning', '')
        warnings = ' '.join(item for item in (warning, research_warning) if item)
        return success_result({
            **result,
            'avatar_used': avatar_used,
            'warning': warnings,
        })

    @action(detail=True, methods=['get', 'put', 'delete'], url_path='battle-appearance', permission_classes=[IsAuthenticated])
    def battle_appearance(self, request, pk=None):
        from utils.drf_utils import get_current_user_identifier
        from .battle_appearance import appearance_view, validate_and_save_appearance
        agent = self.get_object()
        owner_id = get_current_user_identifier(request)
        from assets.models import Asset
        current_appearance = agent.battle_appearance
        current_ids = ([current_appearance.get(key) for key in ('source_asset_id', 'cutout_asset_id',
                        'character_asset_id' if current_appearance.get('version') == 3 else 'head_asset_id')
                       if current_appearance.get(key)] if isinstance(current_appearance, dict) else [])
        if request.method == 'GET':
            appearance = current_appearance
            resource_ids = set(current_ids)
            if not current_ids or Asset.objects.filter(pk__in=resource_ids, uploader=owner_id, is_valid=True, file_type='image').count() != len(resource_ids):
                appearance = None
            value = appearance_view(appearance)
            return success_result(value or {'configured': False})
        if current_ids and Asset.objects.filter(pk__in=current_ids).exclude(uploader=owner_id).exists():
            return valid_result('当前战斗形象属于其他账号，不能覆盖或清除', status=403)
        if request.method == 'DELETE':
            agent.battle_appearance = None
            agent.save(update_fields=['battle_appearance', 'updated_at'])
            return success_result({'configured': False})
        try:
            return success_result(validate_and_save_appearance(
                agent, owner_id, request.data,
            ))
        except ValueError as exc:
            return valid_result(str(exc), status=400)
        except Exception as exc:
            from rest_framework.exceptions import ValidationError
            if isinstance(exc, ValidationError):
                return valid_result('战斗形象配置无效', data=exc.detail, status=400)
            raise

    @action(detail=True, methods=['get'], url_path='battle-appearance-generation-options', permission_classes=[IsAuthenticated])
    def battle_appearance_generation_options(self, request, pk=None):
        from utils.drf_utils import get_current_user_identifier
        from system_mcp.image_generation import image_generation_options
        agent = self.get_object()
        return success_result(image_generation_options(
            agent=agent, model_id=request.query_params.get('model_id') or request.query_params.get('modelId'), scene='battle_head',
            user_id=get_current_user_identifier(request),
        ))

    @action(detail=True, methods=['get', 'post', 'delete'], url_path='battle-appearance-generation', permission_classes=[IsAuthenticated])
    def battle_appearance_generation(self, request, pk=None):
        from utils.drf_utils import get_current_user_identifier
        from system_mcp.image_generation import image_generation_options
        from system_mcp.image_generation_tasks import _output, generate_image, get_image_generation_result
        from prompts.models import ImageGenerationTask
        from rest_framework.exceptions import ValidationError
        from .agent_availability import require_active_agent
        from system_mcp.image_task_lifecycle import cancel_battle_head_task, expire_battle_head_tasks

        agent = self.get_object()
        owner_id = get_current_user_identifier(request)
        require_active_agent(agent)
        scope = {'user_id': owner_id, 'agent_key': str(agent.pk)}
        if request.method == 'DELETE':
            try:
                task = cancel_battle_head_task(request.query_params.get('task_id') or request.query_params.get('taskId', ''), owner_id, str(agent.pk))
                return success_result(_output(task))
            except ValueError as exc:
                return valid_result(str(exc), status=404)
        expire_battle_head_tasks(owner_id, str(agent.pk))
        if request.method == 'GET':
            task_id = request.query_params.get('task_id') or request.query_params.get('taskId')
            if task_id:
                try:
                    return success_result(get_image_generation_result({'task_id': task_id}, agent, user_id=owner_id))
                except ValueError as exc:
                    return valid_result(str(exc), status=404)
            tasks = ImageGenerationTask.objects.filter(**scope, request_data__scene='battle_head').exclude(status='discarded').order_by('-created_at')[:10]
            return success_result([_output(task) for task in tasks])

        active_task = ImageGenerationTask.objects.filter(
            **scope,
            request_data__scene='battle_head',
            status__in=['submitting', 'generating', 'download_pending'],
        ).order_by('-created_at').first()
        if active_task:
            return success_result(_output(active_task))

        data = request.data.copy()
        if not isinstance(data, dict):
            return valid_result('生图参数格式无效', status=400)
        try:
            options = image_generation_options(agent, data.get('model_id'), 'battle_head', owner_id)
            if not options.get('configured'):
                return valid_result(options.get('message') or '请先配置生图模型', status=400)
            from .battle_head_generation import build_battle_head_request
            data = build_battle_head_request(data, options, agent)
            return success_result(generate_image(data, agent, user_id=owner_id, scene='battle_head'))
        except (ValueError, ValidationError) as exc:
            detail = getattr(exc, 'detail', str(exc))
            return valid_result(str(detail), status=400)

    @action(detail=True, methods=['post'], url_path='battle-appearance-generation-recover', permission_classes=[IsAuthenticated])
    def battle_appearance_generation_recover(self, request, pk=None):
        from utils.drf_utils import get_current_user_identifier
        from system_mcp.image_task_lifecycle import recover_battle_head_task
        from system_mcp.image_generation_tasks import _output
        agent = self.get_object()
        try:
            task = recover_battle_head_task(request.data.get('task_id', ''), get_current_user_identifier(request), str(agent.pk))
            return success_result(_output(task))
        except ValueError as exc:
            return valid_result(str(exc), status=400)

    @staticmethod
    def _sync_feishu_im_connection(agent_id):
        def sync_connection():
            from .feishu_im_ws import _feishu_im_ws_manager
            _feishu_im_ws_manager.sync_agent(agent_id)
        transaction.on_commit(sync_connection)

    def list(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data)

    @guarded
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._save_agent(serializer)
        self._sync_feishu_im_connection(serializer.instance.id)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.get_object()).data)

    @guarded
    @transaction.atomic
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        if instance.archived:
            return valid_result('居民已归档，请先恢复再编辑', status=409)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self._save_agent(serializer)
        self._sync_feishu_im_connection(instance.id)
        return success_result(serializer.data)

    @guarded
    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        return self.archive(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def archive(self, request, *args, **kwargs):
        from .agent_archive import archive_agent
        try:
            agent = archive_agent(self.get_object().pk)
        except ValueError as exc:
            return valid_result(str(exc), status=409)
        self._sync_feishu_im_connection(agent.pk)
        return success_result(self.get_serializer(agent).data)

    @action(detail=True, methods=['post'])
    def restore(self, request, *args, **kwargs):
        from .agent_archive import restore_agent
        agent = restore_agent(self.get_object().pk)
        self._sync_feishu_im_connection(agent.pk)
        return success_result(self.get_serializer(agent).data)

    @action(detail=True, methods=['get', 'post'], url_path='memories')
    @guarded
    def memories(self, request, pk=None):
        agent = self.get_object()
        if request.method.lower() == 'get':
            queryset = AgentLongTermMemory.objects.filter(agent=agent).order_by('-updated_at')
            return success_result(AgentLongTermMemorySerializer(queryset, many=True).data)
        serializer = AgentLongTermMemorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(
            agent=agent,
            scope=serializer.validated_data.get('scope', 'agent'),
            chat_id=serializer.validated_data.get('chat_id', ''),
            sender_id=serializer.validated_data.get('sender_id', ''),
            metadata={'source': 'manual'},
        )
        return success_result(serializer.data)

    @action(detail=True, methods=['get'], url_path='memory-status')
    def memory_status(self, request, pk=None):
        agent = self.get_object()
        from .agent_world.memory.models import AgentMemoryState
        from .agent_world.memory.policy import statistics
        state = AgentMemoryState.objects.filter(agent=agent).first()
        return success_result({**statistics(agent), 'state': {
            'enabled_at': state.enabled_at, 'processed_day': state.processed_day,
            'status': state.status, 'detail': state.detail, 'updated_at': state.updated_at,
        } if state else None})

    @action(detail=True, methods=['put', 'delete'], url_path=r'memories/(?P<memory_id>[^/.]+)')
    @guarded
    def memory_detail(self, request, pk=None, memory_id=None):
        agent = self.get_object()
        memory = AgentLongTermMemory.objects.filter(agent=agent, id=memory_id).first()
        if not memory:
            response = valid_result('记忆不存在')
            response.status_code = 404
            return response
        if request.method.lower() == 'delete':
            from .agent_world.memory.policy import protect
            protect(memory)
            memory.status = AgentLongTermMemory.STATUS_ARCHIVED
            memory.save(update_fields=['status', 'metadata', 'updated_at'])
            return success_result()
        serializer = AgentLongTermMemorySerializer(memory, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        from .agent_world.memory.policy import protect
        if any(key in request.data for key in ('title', 'content', 'memory_type', 'status', 'scope', 'chat_id', 'sender_id', 'confidence')):
            protect(memory)
        serializer.save(metadata=memory.metadata)
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
    permission_classes = [IsAuthenticated]
    queryset = AgentTask.objects.select_related('agent', 'followup_agent').all()
    serializer_class = AgentTaskSerializer

    def get_queryset(self):
        from django.db.models import Q
        from utils.drf_utils import get_current_user_identifier
        owner=get_current_user_identifier(self.request)
        rows = super().get_queryset()
        for kind, field in [('memo_capture', 'memo_config'), ('cooking', 'cooking_config'), ('alchemy', 'alchemy_config'),
                            ('market', 'market_config'), ('investment', 'investment_config'), ('exploration', 'exploration_config')]:
            rows = rows.filter(~Q(task_kind=kind) | Q(**{field + '__owner_id': owner}))
        for kind,field in [('farm','farm_config'),('travel','travel_config'),('post_publish','publish_config'),('post_interaction','world_state')]:
            rows=rows.filter(~Q(task_kind=kind) | Q(**{field+'__owner_id':owner}) | Q(**{field+'__owner_id__isnull':True}))
        return rows

    @action(detail=False, methods=['get'])
    def publish_collections(self, request):
        from anthology.models import Anthology
        from utils.drf_utils import get_current_user_identifier
        rows = Anthology.objects.filter(type='agent', is_valid=True, user_id=get_current_user_identifier(request))
        return success_result([{'coll_id': row.pk, 'title': row.title, 'type': row.type} for row in rows])

    @action(detail=False, methods=['get', 'post'])
    def world_runner(self, request):
        from .models import WorldActionRuntime
        runtime, _ = WorldActionRuntime.objects.get_or_create(pk='world')
        if request.method == 'POST':
            value = request.data.get('enabled')
            if type(value) is not bool:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'enabled': '必须是布尔值'})
            if value:
                from .agent_world.life_config import config_for
                from utils.drf_utils import get_current_user_identifier
                life=config_for(get_current_user_identifier(request))
                if not life.migrated or not life.settings.get('agent_ids'):
                    return valid_result('请先保存统一生活配置并选择参与居民',status=400)
            runtime.enabled = value
            runtime.save(update_fields=['enabled'])
            if not value:
                from .agent_world.market_sessions import cleanup
                cleanup()
        return success_result({'enabled': runtime.enabled})

    def list(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.filter_queryset(self.get_queryset()), many=True).data)

    def create(self, request, *args, **kwargs):
        if request.data.get('task_kind') == 'farm':
            from utils.drf_utils import get_current_user_identifier
            existing = AgentTask.objects.filter(task_kind='farm').first()
            if existing and existing.farm_config.get('owner_id') != get_current_user_identifier(request):
                return valid_result('无权修改此农场任务', status=403)
        if request.data.get('task_kind') == 'travel':
            from utils.drf_utils import get_current_user_identifier
            existing = AgentTask.objects.filter(task_kind='travel').first()
            if existing and existing.travel_config.get('owner_id') != get_current_user_identifier(request):
                return valid_result('无权修改此旅行任务', status=403)
        if request.data.get('task_kind') == 'post_publish':
            from utils.drf_utils import get_current_user_identifier
            existing = AgentTask.objects.filter(task_kind='post_publish').first()
            if existing and existing.publish_config.get('owner_id') != get_current_user_identifier(request):
                return valid_result('无权修改此发帖任务', status=403)
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            return valid_result("任务配置不符合要求", data=serializer.errors, status=400)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        return success_result(self.get_serializer(self.get_object()).data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        from utils.drf_utils import get_current_user_identifier
        if instance.task_kind == 'market':
            if instance.market_config.get('owner_id') != get_current_user_identifier(request):
                return valid_result('无权操作其他账号的市场任务', status=403)
        if instance.task_kind == 'alchemy' and instance.alchemy_config.get('owner_id') != get_current_user_identifier(request):
            return valid_result('无权修改此炼金任务', status=403)
        if instance.task_kind == 'farm' and instance.farm_config.get('owner_id') != get_current_user_identifier(request):
            return valid_result('无权修改此农场任务', status=403)
        if instance.task_kind == 'travel' and instance.travel_config.get('owner_id') != get_current_user_identifier(request):
            return valid_result('无权修改此旅行任务', status=403)
        if instance.task_kind == 'post_publish' and instance.publish_config.get('owner_id') != get_current_user_identifier(request):
            return valid_result('无权修改此发帖任务', status=403)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        if not serializer.is_valid():
            return valid_result("任务配置不符合要求", data=serializer.errors, status=400)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        from .agent_world.builtin_tasks import SYSTEM_TASK_KINDS
        if self.get_object().task_kind in SYSTEM_TASK_KINDS:
            return valid_result('内置系统任务不能删除，请关闭任务', status=400)
        self.perform_destroy(self.get_object())
        return success_result()

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        from .agent_world.publish_runner import preview
        from rest_framework import serializers
        task = self.get_object()
        if task.task_kind != 'post_publish':
            return valid_result('仅自主发帖任务支持预览', status=400)
        class Input(serializers.Serializer):
            agent_id = serializers.CharField(max_length=40)
        data = Input(data=request.data)
        if not data.is_valid():
            return valid_result('请提供绑定 Agent ID', data=data.errors, status=400)
        agent = Agent.objects.filter(pk=data.validated_data['agent_id']).first()
        from .agent_world.life_scope import allowed
        if not agent or not allowed(task,agent.pk):
            return valid_result('请选择参与统一生活且未暂停的居民', status=400)
        from article.access import can_manage_anthology
        if not can_manage_anthology(request, task.publish_config.get('collection_id'), 'agent'):
            return valid_result('无权管理输出文集', status=403)
        try:
            return success_result(preview(task, agent))
        except Exception as exc:
            from .agent_world.publish_diagnostics import PublishSearchError, logger as publish_logger
            publish_logger.error('发帖预览失败 task=%s agent=%s exception=%s', task.pk, agent.pk, type(exc).__name__)
            logger.exception('发帖预览失败 task=%s', task.pk)
            reason = str(exc) if isinstance(exc, PublishSearchError) else '请检查搜索或模型配置，并查看系统日志'
            return valid_result(f'预览失败：{reason}', status=502)

    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        task = self.get_object()
        publish_category_id = request.data.get('category_id')
        if publish_category_id not in (None, ''):
            if task.task_kind != 'post_publish' or not isinstance(publish_category_id, str) or len(publish_category_id) > 64:
                return valid_result('手动发帖分类参数无效', status=400)
            from .agent_world.publish_config import categories_for
            if publish_category_id not in {category.pk for category in categories_for(task.publish_config)}:
                return valid_result('所选分类不在当前任务允许范围内或已失效', status=400)
        if task.task_kind == 'market':
            from utils.drf_utils import get_current_user_identifier
            if task.market_config.get('owner_id') != get_current_user_identifier(request):
                return valid_result('无权执行其他账号的市场任务', status=403)
        if task.task_kind == 'farm':
            from utils.drf_utils import get_current_user_identifier
            if task.farm_config.get('owner_id') != get_current_user_identifier(request):
                return valid_result('无权运行此农场任务', status=403)
        if task.task_kind == 'travel':
            from article.access import can_manage_anthology
            if not can_manage_anthology(request, task.travel_config.get('collection_id'), 'agent'):
                return valid_result('无权管理输出文集', status=403)
        if task.task_kind == 'post_publish':
            from article.access import can_manage_anthology
            if not can_manage_anthology(request, task.publish_config.get('collection_id'), 'agent'):
                return valid_result('无权管理输出文集', status=403)
        from .agent_world.life_config import KINDS,task_owner
        from .agent_world.life_scope import allowed
        actor=request.data.get('actor_id')
        if task.task_kind not in KINDS:
            ids = task.agent_ids or [task.agent_id]
            if not Agent.objects.filter(pk__in=ids, archived_at__isnull=True).exists():
                return valid_result('任务居民均已归档，请先恢复居民', status=409)
        if task.task_kind in KINDS:
            from utils.drf_utils import get_current_user_identifier
            if task_owner(task)!=get_current_user_identifier(request) or not actor or not allowed(task,actor):
                return valid_result('请明确选择此账号已参与且未暂停的居民',status=400)
        logger.info('Manual agent task requested: id=%s, name=%s', task.id, task.name)

        def runner():
            from system_settings.agent_task_scheduler import _agent_task_scheduler
            if task.task_kind in KINDS:
                from .agent_world.life_manual import run_manual_life
                from django.db import close_old_connections
                close_old_connections()
                try:run_manual_life(task,actor,task_owner(task),_agent_task_scheduler,
                                    publish_category_id=publish_category_id or '')
                finally:close_old_connections()
            else:
                _agent_task_scheduler.run_manual_task(task.id)

        threading.Thread(target=runner, name=f'agent-task-manual-{task.id}', daemon=True).start()
        return success_result({'detail': '任务已开始执行'})


class AgentRunRecordViewSet(viewsets.ModelViewSet):
    queryset = AgentRunRecord.objects.select_related('task', 'agent').all()
    serializer_class = AgentRunRecordSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset()).order_by('-started_at', '-id')
        try:
            limit = min(max(int(request.query_params.get('limit', 20)), 1), 50)
        except (ValueError, TypeError):
            return valid_result('limit 必须为整数', status=400)
        cursor = request.query_params.get('cursor', '')
        if cursor:
            cursor_time, separator, cursor_id = cursor.rpartition('|')
            try:
                before = parse_datetime(cursor_time)
            except ValueError:
                before = None
            if not separator or not before or not cursor_id:
                return valid_result('无效的执行记录游标', status=400)
            queryset = queryset.filter(Q(started_at__lt=before) | Q(started_at=before, id__lt=cursor_id))
        items = list(queryset[:limit + 1])
        has_more = len(items) > limit
        items = items[:limit]
        return success_result({
            'items': self.get_serializer(items, many=True).data,
            'next_cursor': f'{items[-1].started_at.isoformat()}|{items[-1].id}' if has_more else None,
            'has_more': has_more,
        })

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
        from .agent_activity_presentation import grouped_activities
        return grouped_activities(super().get_queryset().filter(
            Q(activity_type='work') | Q(artifact_coll_id__in=visible_coll_ids)
        ))

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
        excluded_type = str(request.query_params.get('exclude_type') or '').strip()
        if excluded_type in {'work', 'publication', 'interaction'}:
            queryset = queryset.exclude(activity_type=excluded_type)
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
        agents_queryset = list(Agent.objects.filter(archived_at__isnull=True))
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
        from .agent_world.combat.queries import resident_presence
        from utils.drf_utils import get_current_user_identifier
        exploring=resident_presence(get_current_user_identifier(request))
        agents = []
        for agent in agents_queryset:
            activity = latest_by_agent.get(agent.id)
            running_activity = running_by_agent.get(agent.id)
            agents.append({
                'id': agent.id,
                'name': agent.name,
                'avatar': agent.avatar,
                'status': exploring[agent.id]['status'] if agent.id in exploring else 'running' if running_activity else 'idle',
                'currentAction': exploring[agent.id]['current_action'] if agent.id in exploring else running_activity.current_action if running_activity else '',
                'latestTitle': activity.title if activity else '',
                'todayCount': counts.get(agent.id, 0),
            })
        return success_result({
            'todayActivityCount': today_activities.count(),
            'todayWorkCount': today_activities.filter(activity_type='publication').count(),
            'activeAgentCount': sum(agent['status']=='running' for agent in agents),
            'latest': self.get_serializer(latest, many=True).data,
            'agents': agents,
        })
