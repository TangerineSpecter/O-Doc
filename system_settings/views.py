import json
import os
import secrets
import threading
import tomllib
from pathlib import Path
from types import SimpleNamespace

import requests
from django.db import transaction
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from system_settings.sync_scheduler import (
    append_sync_message,
    generate_runner_id,
    get_runtime_state,
    mark_sync_started,
    update_runtime_state,
)
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result, valid_result
from utils.sync_manager import SyncError, SyncManager
from utils.webdav import WebDavClient
from .feishu_im import (
    FeishuIMError,
    handle_feishu_message_event,
    normalize_feishu_event_payload,
    verify_feishu_token,
)
from .models import Agent, AgentLongTermMemory, AgentRunRecord, AgentTask, AIProvider, AIModel, MCPServer, Skill, SystemSetting, GeoLocation
from .runtime_tracker import get_runtime_info
from .serializers import (
    AgentLongTermMemorySerializer,
    AgentRunRecordSerializer,
    AgentSerializer,
    AgentTaskSerializer,
    AIProviderSerializer,
    AIModelSerializer,
    MCPServerSerializer,
    SkillSerializer,
    GeoLocationSerializer,
)


SYSTEM_MCP_CONFIG_KEY = 'system_mcp_config'


def _generate_system_mcp_api_key():
    return f'odoc-mcp-{secrets.token_urlsafe(32)}'


def _default_system_mcp_config():
    return {
        'enabled': True,
        'apiKey': _generate_system_mcp_api_key(),
    }


def _base_system_mcp_config():
    return {
        'enabled': True,
    }


def _system_mcp_tools(tool_names):
    from system_mcp.views import TOOLS

    return [
        {
            'name': tool['name'],
            'description': tool.get('description') or '',
            'inputSchema': tool.get('inputSchema') or {},
            'enabled': True,
        }
        for tool in TOOLS
        if tool['name'] in tool_names
    ]


def _memo_mcp_tools():
    from system_mcp.views import VISIBLE_MEMO_TOOL_NAMES

    return _system_mcp_tools(VISIBLE_MEMO_TOOL_NAMES)


def _comment_mcp_tools():
    from system_mcp.views import VISIBLE_COMMENT_TOOL_NAMES

    return _system_mcp_tools(VISIBLE_COMMENT_TOOL_NAMES)


def _anthology_mcp_tools():
    from system_mcp.views import VISIBLE_ANTHOLOGY_TOOL_NAMES

    return _system_mcp_tools(VISIBLE_ANTHOLOGY_TOOL_NAMES)


def _article_mcp_tools():
    from system_mcp.views import VISIBLE_ARTICLE_TOOL_NAMES

    return _system_mcp_tools(VISIBLE_ARTICLE_TOOL_NAMES)


def _agent_post_mcp_tools():
    from system_mcp.views import VISIBLE_AGENT_POST_TOOL_NAMES

    return _system_mcp_tools(VISIBLE_AGENT_POST_TOOL_NAMES)


def _sync_builtin_system_mcp_server(request, value, name, endpoint, description, tools):
    server = MCPServer.objects.filter(name=name).first()
    if not server:
        return
    server.url = request.build_absolute_uri(endpoint)
    server.headers = {'Authorization': f"Bearer {value.get('apiKey', '')}"}
    server.enabled = bool(value.get('enabled', True))
    server.source = 'system'
    server.transport = 'streamableHttp'
    server.command = ''
    server.args = []
    server.env = {}
    server.description = description
    server.tools = MCPServerViewSet._merge_tools(tools, server.tools)
    server.save(update_fields=[
        'url', 'headers', 'enabled', 'source', 'transport', 'command',
        'args', 'env', 'description', 'tools', 'updated_at',
    ])


def _sync_scanned_system_mcp_servers(request, value):
    _sync_builtin_system_mcp_server(
        request,
        value,
        '闪念 MCP',
        '/api/system-mcp/memos/',
        'O-Doc 内置系统 MCP，仅提供闪念 Memo 的创建、查询、更新和删除工具。',
        _memo_mcp_tools(),
    )
    _sync_builtin_system_mcp_server(
        request,
        value,
        '文集 MCP',
        '/api/system-mcp/anthologies/',
        'O-Doc 内置系统 MCP，仅提供文集的创建、查询、更新和删除工具。',
        _anthology_mcp_tools(),
    )
    _sync_builtin_system_mcp_server(
        request,
        value,
        '文章 MCP',
        '/api/system-mcp/articles/',
        'O-Doc 内置系统 MCP，仅提供文章的创建、查询、随机获取、更新和删除工具。',
        _article_mcp_tools(),
    )
    _sync_builtin_system_mcp_server(
        request,
        value,
        'Agent 帖子 MCP',
        '/api/system-mcp/agent-posts/',
        'O-Doc 内置系统 MCP，仅提供 Agent 文集帖子的创建、查询和删除工具。',
        _agent_post_mcp_tools(),
    )
    _sync_builtin_system_mcp_server(
        request,
        value,
        '评论 MCP',
        '/api/system-mcp/comments/',
        'O-Doc 内置系统 MCP，仅提供文章批注和评论相关的工具。',
        _comment_mcp_tools(),
    )


class AIProviderViewSet(viewsets.ModelViewSet):
    """
    AI提供商及模型配置接口
    """
    queryset = AIProvider.objects.all().order_by('-created_at')
    serializer_class = AIProviderSerializer

    # 【关键点】必须重写 list 方法，否则 DRF 默认只返回一个数组，前端就会报错
    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        # 用 success_result 包裹数组，返回 { code: 200, data: [...] }
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return success_result(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            server_id = instance.id
            self.perform_destroy(instance)
            for agent in Agent.objects.all():
                if server_id not in (agent.mcp_servers or []):
                    continue
                agent.mcp_servers = [item for item in agent.mcp_servers if item != server_id]
                agent.save(update_fields=['mcp_servers', 'updated_at'])
        return success_result()


class AIModelViewSet(viewsets.ModelViewSet):
    queryset = AIModel.objects.all()
    serializer_class = AIModelSerializer

    @staticmethod
    def _ollama_base_url(base_url):
        normalized = base_url.rstrip('/')
        if normalized.endswith('/v1'):
            normalized = normalized[:-3].rstrip('/')
        return normalized

    @staticmethod
    def _model_test_payload(model):
        if model.type == 'embedding':
            return '/embeddings', {
                'model': model.name,
                'input': 'O-Doc embedding connectivity test',
            }
        if model.type == 'rerank':
            return '/rerank', {
                'model': model.name,
                'query': 'O-Doc connectivity test',
                'documents': ['Connectivity test document.'],
            }
        return '/chat/completions', {
            'model': model.name,
            'messages': [{'role': 'user', 'content': 'Reply with OK.'}],
            'temperature': 0,
            'max_tokens': 8,
        }

    def _test_ollama_connection(self, model, started_at):
        provider = model.provider
        api_url = f"{self._ollama_base_url(provider.base_url)}/api/tags"
        response = requests.get(api_url, timeout=8)
        elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)

        if not (200 <= response.status_code < 300):
            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                    'detail': response.text[:1000],
                }
            )

        data = response.json()
        model_names = {
            item.get('name') or item.get('model')
            for item in data.get('models', [])
            if isinstance(item, dict)
        }
        if model.name not in model_names:
            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                    'detail': f"Ollama 服务可访问，但未找到模型 {model.name}",
                }
            )

        return success_result({
            'ok': True,
            'model_id': model.id,
            'model_name': model.name,
            'model_type': model.type,
            'provider_name': provider.name,
            'status_code': response.status_code,
            'elapsed_ms': elapsed_ms,
        })

    @action(detail=True, methods=['post'])
    def test_connection(self, request, pk=None):
        model = self.get_object()
        provider = model.provider
        if not provider.base_url:
            return valid_result(msg='连通性检测失败', data='服务商 Base URL 不能为空')

        started_at = timezone.now()
        if provider.type == 'Ollama':
            try:
                return self._test_ollama_connection(model, started_at)
            except requests.RequestException as e:
                elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)
                return valid_result(
                    msg='连通性检测失败',
                    data={
                        'ok': False,
                        'model_id': model.id,
                        'model_name': model.name,
                        'model_type': model.type,
                        'provider_name': provider.name,
                        'elapsed_ms': elapsed_ms,
                        'detail': str(e),
                    }
                )

        endpoint, payload = self._model_test_payload(model)
        api_url = f"{provider.base_url.rstrip('/')}{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if provider.api_key:
            headers['Authorization'] = f"Bearer {provider.api_key}"

        try:
            response = requests.post(api_url, json=payload, headers=headers, timeout=20)
            elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)
            if 200 <= response.status_code < 300:
                return success_result({
                    'ok': True,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                })

            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'status_code': response.status_code,
                    'elapsed_ms': elapsed_ms,
                    'detail': response.text[:1000],
                }
            )
        except requests.RequestException as e:
            elapsed_ms = int((timezone.now() - started_at).total_seconds() * 1000)
            return valid_result(
                msg='连通性检测失败',
                data={
                    'ok': False,
                    'model_id': model.id,
                    'model_name': model.name,
                    'model_type': model.type,
                    'provider_name': provider.name,
                    'elapsed_ms': elapsed_ms,
                    'detail': str(e),
                }
            )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        with transaction.atomic():
            server_id = instance.id
            self.perform_destroy(instance)
            for agent in Agent.objects.all():
                if server_id not in (agent.mcp_servers or []):
                    continue
                agent.mcp_servers = [item for item in agent.mcp_servers if item != server_id]
                agent.save(update_fields=['mcp_servers', 'updated_at'])
        return success_result()


class GeoLocationViewSet(viewsets.ModelViewSet):
    """地理位置配置接口"""

    queryset = GeoLocation.objects.all()
    serializer_class = GeoLocationSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return success_result()


class AgentViewSet(viewsets.ModelViewSet):
    """Agent 配置接口"""

    queryset = Agent.objects.select_related('model', 'model__provider').all()
    serializer_class = AgentSerializer

    @staticmethod
    def _sync_feishu_im_connection(agent_id):
        def sync_connection():
            from .feishu_im_ws import _feishu_im_ws_manager
            _feishu_im_ws_manager.sync_agent(agent_id)

        transaction.on_commit(sync_connection)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        self._sync_feishu_im_connection(serializer.instance.id)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return success_result(serializer.data)

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
            serializer = AgentLongTermMemorySerializer(queryset, many=True)
            return success_result(serializer.data)

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

    @action(
        detail=True,
        methods=['post'],
        url_path='feishu/events',
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
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
            result = handle_feishu_message_event(agent, normalized)
            return success_result(result)
        except FeishuIMError as exc:
            return valid_result(str(exc))


class AgentTaskViewSet(viewsets.ModelViewSet):
    """Agent 任务配置接口"""

    queryset = AgentTask.objects.select_related('agent').all()
    serializer_class = AgentTaskSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return success_result(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return success_result()

    @action(detail=True, methods=['post'])
    def run_now(self, request, pk=None):
        task = self.get_object()
        print(f"[AgentTaskViewSet] run_now requested: id={task.id}, name={task.name}", flush=True)

        def runner():
            from system_settings.agent_task_scheduler import _agent_task_scheduler
            _agent_task_scheduler.run_manual_task(task.id)

        threading.Thread(
            target=runner,
            name=f'agent-task-manual-{task.id}',
            daemon=True,
        ).start()
        return success_result({'detail': '任务已开始执行'})


class AgentRunRecordViewSet(viewsets.ModelViewSet):
    """Agent 任务执行记录接口"""

    queryset = AgentRunRecord.objects.select_related('task', 'agent').all()
    serializer_class = AgentRunRecordSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return success_result(serializer.data)


class MCPServerViewSet(viewsets.ModelViewSet):
    """MCP 服务配置接口"""

    queryset = MCPServer.objects.all()
    serializer_class = MCPServerSerializer

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        validate_connection = self._should_validate_connection(request.data)
        data = request.data.copy()
        data.pop('validate_connection', None)
        data.pop('validateConnection', None)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        tools = self._validate_connection(serializer.validated_data) if validate_connection else None
        self.perform_create(serializer, tools=tools)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return success_result(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        validate_connection = self._should_validate_connection(request.data)
        data = request.data.copy()
        data.pop('validate_connection', None)
        data.pop('validateConnection', None)
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        tools = self._validate_connection(serializer.validated_data, instance=instance) if validate_connection else None
        self.perform_update(serializer, tools=tools)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
        return success_result()

    def perform_create(self, serializer, tools=None):
        instance = serializer.save(tools=tools if tools is not None else serializer.validated_data.get('tools', []))
        if not instance.tools:
            from utils.mcp_client import fetch_mcp_tools
            tools, _ = fetch_mcp_tools(instance)
            if tools:
                instance.tools = tools
                instance.save(update_fields=['tools'])

    def perform_update(self, serializer, tools=None):
        if tools is not None:
            serializer.save(tools=tools)
            return
        serializer.save()

    @staticmethod
    def _should_validate_connection(data):
        return bool(data.get('validate_connection') or data.get('validateConnection'))

    @staticmethod
    def _merge_tools(new_tools, existing_tools=None):
        existing = {t['name']: t for t in (existing_tools or []) if isinstance(t, dict) and 'name' in t}
        merged_tools = []
        for tool in new_tools:
            name = tool['name']
            if name in existing:
                merged_tools.append({
                    'name': name,
                    'description': tool.get('description') or existing[name].get('description') or '',
                    'inputSchema': tool.get('inputSchema') or existing[name].get('inputSchema') or {},
                    'enabled': existing[name].get('enabled', True),
                })
            else:
                merged_tools.append(tool)
        return merged_tools

    def _validate_connection(self, validated_data, instance=None):
        from utils.mcp_client import fetch_mcp_tools

        def field_value(name, default):
            if name in validated_data:
                return validated_data[name]
            if instance is not None:
                return getattr(instance, name)
            return default

        candidate = SimpleNamespace(
            transport=field_value('transport', 'stdio'),
            command=field_value('command', ''),
            args=field_value('args', []),
            url=field_value('url', ''),
            headers=field_value('headers', {}),
            env=field_value('env', {}),
        )
        tools, error_msg = fetch_mcp_tools(candidate)
        if error_msg:
            raise ValidationError({'non_field_errors': [f"MCP 连通性检测失败：{error_msg}"]})
        if not tools:
            raise ValidationError({'non_field_errors': ["MCP 连通性检测失败：未发现可用 Tool"]})
        existing_tools = validated_data.get('tools')
        if existing_tools is None and instance is not None:
            existing_tools = instance.tools
        return self._merge_tools(tools, existing_tools)

    @action(detail=True, methods=['post'])
    def refresh_tools(self, request, pk=None):
        server = self.get_object()
        from utils.mcp_client import fetch_mcp_tools
        
        tools, error_msg = fetch_mcp_tools(server)
        if error_msg:
            return Response({
                'code': ErrorCode.SYSTEM_ERROR.code,
                'msg': error_msg,
                'data': None
            })
        
        merged_tools = self._merge_tools(tools, server.tools)
                
        server.tools = merged_tools
        server.save(update_fields=['tools'])
        
        serializer = self.get_serializer(server)
        return success_result(serializer.data)

    @staticmethod
    def _normalize_scanned_server(name, config, source_path):
        if not isinstance(config, dict):
            return None

        transport = config.get('transport') or ('streamableHttp' if config.get('url') else 'stdio')
        if transport == 'http':
            transport = 'streamableHttp'
        if transport not in {'stdio', 'sse', 'streamableHttp'}:
            transport = 'stdio'

        args = config.get('args') or []
        if isinstance(args, str):
            args = [args]
        if not isinstance(args, list):
            args = []

        env = config.get('env') or {}
        if not isinstance(env, dict):
            env = {}

        headers = config.get('headers') or {}
        if not isinstance(headers, dict):
            headers = {}

        return {
            'name': str(name),
            'transport': transport,
            'command': config.get('command') or '',
            'args': args,
            'url': config.get('url') or '',
            'headers': headers,
            'env': env,
            'source': 'system',
            'enabled': True,
            'description': f'扫描自 {source_path}',
            'tools': config.get('tools') if isinstance(config.get('tools'), list) else [],
        }

    @staticmethod
    def _should_skip_scanned_server(server):
        command = server.get('command') or ''
        if server.get('name') == 'node_repl' or os.path.basename(command) == 'node_repl':
            return True
        return False

    @staticmethod
    def _format_builtin_tools(tool_names):
        from system_mcp.views import TOOLS

        return [
            {
                'name': tool['name'],
                'description': tool.get('description') or '',
                'inputSchema': tool.get('inputSchema') or {},
                'enabled': True,
            }
            for tool in TOOLS
            if tool['name'] in tool_names
        ]

    @staticmethod
    def _ensure_system_mcp_value():
        config, _ = SystemSetting.objects.get_or_create(
            key=SYSTEM_MCP_CONFIG_KEY,
            defaults={
                'value': _default_system_mcp_config(),
                'description': '系统级 MCP 配置',
            }
        )
        value = {**_base_system_mcp_config(), **(config.value or {})}
        if not value.get('apiKey'):
            value['apiKey'] = _generate_system_mcp_api_key()
            config.value = value
            config.description = '系统级 MCP 配置'
            config.save(update_fields=['value', 'description'])
        return value

    @classmethod
    def _builtin_memo_server(cls, request):
        from system_mcp.views import VISIBLE_MEMO_TOOL_NAMES

        value = cls._ensure_system_mcp_value()
        return {
            'name': '闪念 MCP',
            'transport': 'streamableHttp',
            'command': '',
            'args': [],
            'url': request.build_absolute_uri('/api/system-mcp/memos/'),
            'headers': {'Authorization': f"Bearer {value.get('apiKey', '')}"},
            'env': {},
            'source': 'system',
            'enabled': bool(value.get('enabled', True)),
            'description': 'O-Doc 内置系统 MCP，仅提供闪念 Memo 的创建、查询、更新和删除工具。',
            'tools': cls._format_builtin_tools(VISIBLE_MEMO_TOOL_NAMES),
        }

    @classmethod
    def _builtin_comment_server(cls, request):
        from system_mcp.views import VISIBLE_COMMENT_TOOL_NAMES

        value = cls._ensure_system_mcp_value()
        return {
            'name': '评论 MCP',
            'transport': 'streamableHttp',
            'command': '',
            'args': [],
            'url': request.build_absolute_uri('/api/system-mcp/comments/'),
            'headers': {'Authorization': f"Bearer {value.get('apiKey', '')}"},
            'env': {},
            'source': 'system',
            'enabled': bool(value.get('enabled', True)),
            'description': 'O-Doc 内置系统 MCP，仅提供文章批注和评论相关的工具。',
            'tools': cls._format_builtin_tools(VISIBLE_COMMENT_TOOL_NAMES),
        }

    @classmethod
    def _builtin_anthology_server(cls, request):
        from system_mcp.views import VISIBLE_ANTHOLOGY_TOOL_NAMES

        value = cls._ensure_system_mcp_value()
        return {
            'name': '文集 MCP',
            'transport': 'streamableHttp',
            'command': '',
            'args': [],
            'url': request.build_absolute_uri('/api/system-mcp/anthologies/'),
            'headers': {'Authorization': f"Bearer {value.get('apiKey', '')}"},
            'env': {},
            'source': 'system',
            'enabled': bool(value.get('enabled', True)),
            'description': 'O-Doc 内置系统 MCP，仅提供文集的创建、查询、更新和删除工具。',
            'tools': cls._format_builtin_tools(VISIBLE_ANTHOLOGY_TOOL_NAMES),
        }

    @classmethod
    def _builtin_article_server(cls, request):
        from system_mcp.views import VISIBLE_ARTICLE_TOOL_NAMES

        value = cls._ensure_system_mcp_value()
        return {
            'name': '文章 MCP',
            'transport': 'streamableHttp',
            'command': '',
            'args': [],
            'url': request.build_absolute_uri('/api/system-mcp/articles/'),
            'headers': {'Authorization': f"Bearer {value.get('apiKey', '')}"},
            'env': {},
            'source': 'system',
            'enabled': bool(value.get('enabled', True)),
            'description': 'O-Doc 内置系统 MCP，仅提供文章的创建、查询、随机获取、更新和删除工具。',
            'tools': cls._format_builtin_tools(VISIBLE_ARTICLE_TOOL_NAMES),
        }

    @classmethod
    def _builtin_agent_post_server(cls, request):
        from system_mcp.views import VISIBLE_AGENT_POST_TOOL_NAMES

        value = cls._ensure_system_mcp_value()
        return {
            'name': 'Agent 帖子 MCP',
            'transport': 'streamableHttp',
            'command': '',
            'args': [],
            'url': request.build_absolute_uri('/api/system-mcp/agent-posts/'),
            'headers': {'Authorization': f"Bearer {value.get('apiKey', '')}"},
            'env': {},
            'source': 'system',
            'enabled': bool(value.get('enabled', True)),
            'description': 'O-Doc 内置系统 MCP，仅提供 Agent 文集帖子的创建、查询和删除工具。',
            'tools': cls._format_builtin_tools(VISIBLE_AGENT_POST_TOOL_NAMES),
        }

    @staticmethod
    def _extract_servers(payload, source_path):
        if not isinstance(payload, dict):
            return []

        candidates = []
        if isinstance(payload.get('mcpServers'), dict):
            candidates.append(payload['mcpServers'])
        if isinstance(payload.get('mcp_servers'), dict):
            candidates.append(payload['mcp_servers'])
        if isinstance(payload.get('mcp'), dict):
            candidates.append(payload['mcp'])

        result = []
        for server_map in candidates:
            for name, config in server_map.items():
                server = MCPServerViewSet._normalize_scanned_server(name, config, source_path)
                if server and not MCPServerViewSet._should_skip_scanned_server(server):
                    result.append(server)
        return result

    @staticmethod
    def _load_json(path):
        with path.open('r', encoding='utf-8') as file:
            return json.load(file)

    @staticmethod
    def _load_toml(path):
        with path.open('rb') as file:
            return tomllib.load(file)

    @classmethod
    def _scan_local_configs(cls):
        home = Path.home()
        paths = [
            home / '.codex' / 'config.toml',
            home / '.cursor' / 'mcp.json',
            home / '.continue' / 'config.json',
            home / 'Library' / 'Application Support' / 'Claude' / 'claude_desktop_config.json',
        ]

        servers = []
        seen = set()
        for path in paths:
            if not path.exists() or not path.is_file():
                continue

            try:
                payload = cls._load_toml(path) if path.suffix == '.toml' else cls._load_json(path)
            except (OSError, ValueError, tomllib.TOMLDecodeError):
                continue

            for server in cls._extract_servers(payload, str(path)):
                if server['name'] in seen:
                    continue
                seen.add(server['name'])
                servers.append(server)

        return servers

    @action(detail=False, methods=['post'])
    def scan(self, request):
        builtin_servers = [
            self._builtin_memo_server(request),
            self._builtin_anthology_server(request),
            self._builtin_article_server(request),
            self._builtin_agent_post_server(request),
            self._builtin_comment_server(request),
        ]
        builtin_names = {server['name'] for server in builtin_servers}
        scanned = [*builtin_servers, *self._scan_local_configs()]
        saved = []
        from utils.mcp_client import fetch_mcp_tools
        for server in scanned:
            if server['name'] in builtin_names:
                tools = server['tools']
            else:
                # 构造临时 MCPServer 实体用于连接探测
                temp_server = MCPServer(
                    transport=server['transport'],
                    command=server['command'],
                    args=server['args'],
                    url=server['url'],
                    headers=server['headers'],
                    env=server['env']
                )
                # 在扫描时，我们尝试连接获取真实 Tools 列表，但不强求一定要成功（失败了打印日志/返回空列表）
                tools, _ = fetch_mcp_tools(temp_server)
            
            try:
                db_instance = MCPServer.objects.get(name=server['name'])
                existing_tools = {t['name']: t for t in (db_instance.tools or []) if isinstance(t, dict) and 'name' in t}
                merged_tools = []
                for t in tools:
                    name = t['name']
                    if name in existing_tools:
                        merged_tools.append({
                            'name': name,
                            'description': t.get('description') or existing_tools[name].get('description') or '',
                            'inputSchema': t.get('inputSchema') or existing_tools[name].get('inputSchema') or {},
                            'enabled': existing_tools[name].get('enabled', True)
                        })
                    else:
                        merged_tools.append(t)
                server['tools'] = merged_tools
            except MCPServer.DoesNotExist:
                server['tools'] = tools

            instance, _ = MCPServer.objects.update_or_create(
                name=server['name'],
                defaults=server,
            )
            saved.append(instance)

        serializer = self.get_serializer(saved, many=True)
        return success_result({
            'count': len(saved),
            'servers': serializer.data,
        })


class SkillViewSet(viewsets.ModelViewSet):
    """技能配置接口"""

    queryset = Skill.objects.all()
    serializer_class = SkillSerializer

    def list(self, request, *args, **kwargs):
        from .builtin_skills import sync_builtin_skills

        sync_builtin_skills()
        queryset = self.filter_queryset(self.get_queryset())
        serializer = self.get_serializer(queryset, many=True)
        return success_result(serializer.data)

    def create(self, request, *args, **kwargs):
        payload = request.data.copy()
        payload['is_system'] = False
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return success_result(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        payload = request.data.copy()
        if instance.is_system:
            payload = {
                'enabled': bool(payload.get('enabled', instance.enabled)),
                'available_in_chat': bool(payload.get('available_in_chat', payload.get('availableInChat', instance.available_in_chat))),
            }
            partial = True
        serializer = self.get_serializer(instance, data=payload, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.is_system:
            return error_result(ErrorCode.PARAM_ERROR, {'detail': '系统技能不能删除'})
        with transaction.atomic():
            skill_id = instance.id
            self.perform_destroy(instance)
            for agent in Agent.objects.all():
                if skill_id not in (agent.skills or []):
                    continue
                agent.skills = [item for item in agent.skills if item != skill_id]
                agent.save(update_fields=['skills', 'updated_at'])
        return success_result()


class SystemConfigViewSet(viewsets.ViewSet):
    def get_permissions(self):
        if self.action in {
            'get_system_mcp_config',
            'save_system_mcp_config',
            'regenerate_system_mcp_key',
        }:
            return [IsAuthenticated()]
        return super().get_permissions()

    """
    专门处理系统全局配置的接口 (如默认模型)
    """

    @staticmethod
    def _sync_event(step, msg, record=True, **extra):
        if record and msg:
            append_sync_message(msg)
        payload = {"step": step, "msg": msg, **extra}
        return json.dumps(payload) + "\n"

    @staticmethod
    def _status_payload(runtime_state):
        payload = {
            'status': runtime_state.get('status', 'idle'),
            'trigger': runtime_state.get('trigger', ''),
            'runner_id': runtime_state.get('runner_id', ''),
            'last_started_at': runtime_state.get('last_started_at', ''),
            'last_success_at': runtime_state.get('last_success_at', ''),
            'last_pull_at': runtime_state.get('last_pull_at', ''),
            'last_push_at': runtime_state.get('last_push_at', ''),
            'last_error': runtime_state.get('last_error', ''),
            'last_summary': runtime_state.get('last_summary', []),
            'last_synced_snapshot_id': runtime_state.get('last_synced_snapshot_id', ''),
            'last_uploaded_snapshot_id': runtime_state.get('last_uploaded_snapshot_id', ''),
            'last_pulled_snapshot_id': runtime_state.get('last_pulled_snapshot_id', ''),
            'updated_at': runtime_state.get('updated_at', ''),
        }
        payload.update({
            'runnerId': payload['runner_id'],
            'lastStartedAt': payload['last_started_at'],
            'lastSuccessAt': payload['last_success_at'],
            'lastPullAt': payload['last_pull_at'],
            'lastPushAt': payload['last_push_at'],
            'lastError': payload['last_error'],
            'lastSummary': payload['last_summary'],
            'lastSyncedSnapshotId': payload['last_synced_snapshot_id'],
            'lastUploadedSnapshotId': payload['last_uploaded_snapshot_id'],
            'lastPulledSnapshotId': payload['last_pulled_snapshot_id'],
            'updatedAt': payload['updated_at'],
        })
        return payload

    @staticmethod
    def _sync_from_remote(manager, runtime_state, remote_meta, runner_id, trigger):
        if remote_meta and remote_meta.get('snapshot_id'):
            remote_snapshot_id = remote_meta['snapshot_id']
            last_synced_snapshot_id = runtime_state.get('last_synced_snapshot_id')
            if remote_snapshot_id != last_synced_snapshot_id:
                yield SystemConfigViewSet._sync_event(
                    "processing",
                    "检测到远端快照已更新，先拉取远端数据再继续同步。"
                )

        yield SystemConfigViewSet._sync_event("init", "开始从云端拉取快照...")

        data_count = manager.sync_data_download()
        yield SystemConfigViewSet._sync_event(
            "processing",
            f"数据快照已恢复，共对齐 {data_count} 条记录"
        )

        file_count = manager.sync_assets_download()
        yield SystemConfigViewSet._sync_event(
            "processing",
            f"媒体资源已对齐，共下载/覆盖 {file_count} 个文件"
        )

        snapshot_id = (remote_meta or {}).get('snapshot_id')
        if snapshot_id:
            now = timezone.now().isoformat()
            patch = {
                'trigger': trigger,
                'runner_id': runner_id,
                'last_pulled_snapshot_id': snapshot_id,
                'last_synced_snapshot_id': snapshot_id,
                'last_pull_at': now,
                'last_error': '',
            }
            if trigger != 'manual-preflight':
                patch['status'] = 'success'
            update_runtime_state(**patch)

    @action(detail=False, methods=['get'])
    def get_ai_config(self, request):
        # 获取 AI 配置，如果没有则返回默认空结构
        default_value = {
            'defaultChatModelId': '',
            'simpleChatModelId': '',
            'defaultImageModelId': '',
            'defaultEmbeddingModelId': '',
            'defaultRerankModelId': ''
        }
        config, _ = SystemSetting.objects.get_or_create(
            key='system_ai_config',
            defaults={'value': default_value}
        )
        return success_result({**default_value, **config.value})

    @action(detail=False, methods=['get'])
    def get_image_upload_config(self, request):
        """图片文集上传时的本地处理提示阈值。"""
        default_value = {
            'maxLongEdge': 2048,
            'maxFileSizeMb': 10,
        }
        config, _ = SystemSetting.objects.get_or_create(
            key='image_upload_config',
            defaults={
                'value': default_value,
                'description': '图片文集上传尺寸处理设置',
            }
        )
        return success_result({**default_value, **(config.value or {})})

    @action(detail=False, methods=['post'])
    def save_image_upload_config(self, request):
        data = request.data or {}
        try:
            max_long_edge = int(data.get('maxLongEdge', 2048))
            max_file_size_mb = float(data.get('maxFileSizeMb', 10))
        except (TypeError, ValueError):
            return error_result(ErrorCode.PARAM_ERROR, {'detail': '图片上传阈值格式不正确'})

        if not 256 <= max_long_edge <= 16384 or not 0.5 <= max_file_size_mb <= 100:
            return error_result(ErrorCode.PARAM_ERROR, {'detail': '最大边应在 256-16384px，文件大小应在 0.5-100MB'})

        value = {
            'maxLongEdge': max_long_edge,
            'maxFileSizeMb': max_file_size_mb,
        }
        SystemSetting.objects.update_or_create(
            key='image_upload_config',
            defaults={'value': value, 'description': '图片文集上传尺寸处理设置'}
        )
        return success_result(value)

    @action(detail=False, methods=['get'])
    def get_runtime_info(self, request):
        return success_result(get_runtime_info())

    @action(detail=False, methods=['post'])
    def save_ai_config(self, request):
        # 保存 AI 配置
        data = request.data
        SystemSetting.objects.update_or_create(
            key='system_ai_config',
            defaults={'value': data}
        )
        return success_result()

    @action(detail=False, methods=['get'])
    def get_memos_push_config(self, request):
        default_value = {
            'enabled': False,
            'pushTime': '09:00',
            'frequency': 'daily',
            'weekday': '1',
            'monthDay': '1',
        }
        config, _ = SystemSetting.objects.get_or_create(
            key='system_memos_push_config',
            defaults={'value': default_value}
        )
        return success_result({**default_value, **config.value})

    @action(detail=False, methods=['get'])
    def get_article_rag_schedule_config(self, request):
        default_value = {
            'enabled': False,
            'runTime': '02:00',
        }
        config, _ = SystemSetting.objects.get_or_create(
            key='system_article_rag_schedule_config',
            defaults={
                'value': default_value,
                'description': '文章 RAG 定时任务配置',
            }
        )
        return success_result({**default_value, **(config.value or {})})

    @action(detail=False, methods=['get'])
    def get_system_mcp_config(self, request):
        config, created = SystemSetting.objects.get_or_create(
            key=SYSTEM_MCP_CONFIG_KEY,
            defaults={
                'value': _default_system_mcp_config(),
                'description': '系统级 MCP 配置',
            }
        )
        value = {**_base_system_mcp_config(), **(config.value or {})}
        if created:
            value = config.value
        if not value.get('apiKey'):
            value['apiKey'] = _generate_system_mcp_api_key()
            config.value = value
            config.description = '系统级 MCP 配置'
            config.save(update_fields=['value', 'description'])
        _sync_scanned_system_mcp_servers(request, value)
        return success_result({
            'enabled': bool(value.get('enabled', True)),
            'apiKey': value.get('apiKey', ''),
            'endpoint': '/api/system-mcp/',
        })

    @action(detail=False, methods=['post'])
    def save_system_mcp_config(self, request):
        config, _ = SystemSetting.objects.get_or_create(
            key=SYSTEM_MCP_CONFIG_KEY,
            defaults={
                'value': _default_system_mcp_config(),
                'description': '系统级 MCP 配置',
            }
        )
        value = config.value or {}
        value['enabled'] = bool(request.data.get('enabled', value.get('enabled', True)))
        if not value.get('apiKey'):
            value['apiKey'] = _generate_system_mcp_api_key()
        config.value = value
        config.description = '系统级 MCP 配置'
        config.save(update_fields=['value', 'description'])
        _sync_scanned_system_mcp_servers(request, value)
        return success_result({
            'enabled': value['enabled'],
            'apiKey': value['apiKey'],
            'endpoint': '/api/system-mcp/',
        })

    @action(detail=False, methods=['post'])
    def regenerate_system_mcp_key(self, request):
        config, _ = SystemSetting.objects.get_or_create(
            key=SYSTEM_MCP_CONFIG_KEY,
            defaults={
                'value': _default_system_mcp_config(),
                'description': '系统级 MCP 配置',
            }
        )
        value = config.value or {}
        value['enabled'] = bool(value.get('enabled', True))
        value['apiKey'] = _generate_system_mcp_api_key()
        config.value = value
        config.description = '系统级 MCP 配置'
        config.save(update_fields=['value', 'description'])
        _sync_scanned_system_mcp_servers(request, value)
        return success_result({
            'enabled': value['enabled'],
            'apiKey': value['apiKey'],
            'endpoint': '/api/system-mcp/',
        })

    @action(detail=False, methods=['post'])
    def save_memos_push_config(self, request):
        data = request.data
        enabled = bool(data.get('enabled', False))
        push_time = data.get('pushTime') or data.get('push_time') or '09:00'
        frequency = data.get('frequency') or 'daily'
        weekday = str(data.get('weekday') or '1')
        month_day = str(data.get('monthDay') or data.get('month_day') or '1')

        SystemSetting.objects.update_or_create(
            key='system_memos_push_config',
            defaults={'value': {
                'enabled': enabled,
                'pushTime': push_time,
                'frequency': frequency,
                'weekday': weekday,
                'monthDay': month_day,
            }}
        )
        return success_result()

    @action(detail=False, methods=['post'])
    def save_article_rag_schedule_config(self, request):
        data = request.data
        enabled = bool(data.get('enabled', False))
        run_time = data.get('runTime') or data.get('run_time') or '02:00'

        SystemSetting.objects.update_or_create(
            key='system_article_rag_schedule_config',
            defaults={
                'value': {
                    'enabled': enabled,
                    'runTime': run_time,
                },
                'description': '文章 RAG 定时任务配置',
            }
        )
        return success_result()

    @action(detail=False, methods=['post'])
    def run_article_rag_now(self, request):
        notification_user = request.user if request.user and request.user.is_authenticated else 'admin'
        from system_settings.article_rag_scheduler import _article_rag_scheduler

        if not _article_rag_scheduler.run_manual_async(notification_user=notification_user):
            return valid_result(msg='已有文章 RAG 任务正在执行，请稍后再试')

        return success_result({'detail': '文章 RAG 任务已开始执行'})

    def _get_sync_manager(self):
        """辅助函数：初始化 SyncManager"""
        try:
            setting = SystemSetting.objects.get(key='system_webdav_config')
            config = setting.value
            if not config.get('enabled'):
                return None

            client = WebDavClient(config['url'], config['username'], config['password'])
            remote_path = config.get('remote_path') or config.get('remotePath') or '/o-doc-sync/'
            return SyncManager(client, remote_path)
        except SystemSetting.DoesNotExist:
            return None

    @action(detail=False, methods=['get'])
    def get_webdav_config(self, request):
        """获取 WebDAV 配置"""
        config, _ = SystemSetting.objects.get_or_create(
            key='system_webdav_config',
            defaults={'value': {
                'enabled': False,
                'url': '',
                'username': '',
                'password': '',
                'remote_path': '/o-doc-backup/',
                'interval': 30
            }}
        )
        return success_result(config.value)

    @action(detail=False, methods=['get'])
    def get_webdav_status(self, request):
        runtime_state = get_runtime_state()
        return success_result(self._status_payload(runtime_state))

    @action(detail=False, methods=['post'])
    def save_webdav_config(self, request):
        """保存 WebDAV 配置"""
        data = request.data

        # 1. 简单校验
        url = WebDavClient.normalize_base_url(data.get('url'))
        username = data.get('username')
        password = data.get('password')
        if not all([url, username, password]):
            return error_result()
        data['url'] = url

        try:
            # 2. 实例化并测试连接
            client = WebDavClient(url, username, password)
            if not client.check_connection():
                raise Exception("验证失败，无法连接到 WebDAV 服务器")

            # 3. 保存
            SystemSetting.objects.update_or_create(
                key='system_webdav_config',
                defaults={'value': data}
            )
            return success_result(msg="连接测试通过并保存成功")
        except Exception as e:
            # 5. 捕获连接错误（如 401 Unauthorized, 404 Not Found, Connection Error）
            print(f"WebDAV连接测试失败: {e}")
            return error_result(ErrorCode.WEBDEV_LOGIN_FAIL)

    @action(detail=False, methods=['post'])
    def sync_to_webdav(self, request):
        manager = self._get_sync_manager()
        if not manager:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)

        def stream_generator():
            runner_id = generate_runner_id('manual')
            acquired = False
            try:
                acquired, runtime_state = mark_sync_started(
                    trigger='manual',
                    runner_id=runner_id,
                    initial_message='手动上传同步开始：准备检查远端快照与本地资源',
                )
                if not acquired:
                    yield self._sync_event("error", "已有同步任务正在运行，请等待当前任务完成后再操作。", record=False)
                    return

                issues = manager.validate_upload_state()
                if issues:
                    update_runtime_state(
                        status='error',
                        trigger='manual',
                        runner_id=runner_id,
                        last_error='；'.join(issues),
                    )
                    for issue in issues:
                        yield self._sync_event("error", issue)
                    return

                remote_meta = manager.get_remote_snapshot_meta()
                manager.validate_remote_snapshot_version(remote_meta)
                remote_snapshot_id = (remote_meta or {}).get('snapshot_id')
                last_synced_snapshot_id = runtime_state.get('last_synced_snapshot_id')
                if remote_snapshot_id and remote_snapshot_id != last_synced_snapshot_id:
                    yield from self._sync_from_remote(
                        manager=manager,
                        runtime_state=runtime_state,
                        remote_meta=remote_meta,
                        runner_id=runner_id,
                        trigger='manual-preflight',
                    )

                yield self._sync_event(
                    "init",
                    "开始上传同步，当前会先同步资源文件，再写入数据快照，避免云端出现半同步状态。"
                )

                for chunk in manager.sync_assets_upload_stream():
                    try:
                        payload = json.loads(chunk.strip())
                        if payload.get('msg'):
                            append_sync_message(payload['msg'])
                    except json.JSONDecodeError:
                        pass
                    yield chunk

                for chunk in manager.sync_data_upload_stream():
                    try:
                        payload = json.loads(chunk.strip())
                        if payload.get('msg'):
                            append_sync_message(payload['msg'])
                    except json.JSONDecodeError:
                        pass
                    yield chunk

                snapshot_meta = manager.write_snapshot_meta(
                    source='manual',
                    runner_id=runner_id,
                )
                update_runtime_state(
                    status='success',
                    trigger='manual',
                    runner_id=runner_id,
                    last_success_at=timezone.now().isoformat(),
                    last_uploaded_snapshot_id=snapshot_meta['snapshot_id'],
                    last_synced_snapshot_id=snapshot_meta['snapshot_id'],
                    last_push_at=timezone.now().isoformat(),
                    last_error='',
                )
                yield self._sync_event("done", "✅ 所有同步已完成！")
            except SyncError as e:
                if acquired:
                    update_runtime_state(status='error', trigger='manual', runner_id=runner_id, last_error=str(e))
                yield self._sync_event("error", str(e))
            except Exception as e:
                if acquired:
                    update_runtime_state(status='error', trigger='manual', runner_id=runner_id, last_error=str(e))
                yield self._sync_event("error", f"同步失败：{str(e)}")

        return StreamingHttpResponse(stream_generator(), content_type='application/x-ndjson')

    @action(detail=False, methods=['post'])
    def sync_from_webdav(self, request):
        """
        [下载/拉取]
        1. 数据库：拉取云端数据合并到本地。
        2. 资源：下载本地缺失的文件。
        """
        manager = self._get_sync_manager()
        if not manager:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)

        def stream_generator():
            runner_id = generate_runner_id('manual')
            acquired = False
            try:
                acquired, runtime_state = mark_sync_started(
                    trigger='manual-pull',
                    runner_id=runner_id,
                    initial_message='手动从云端下载开始：准备拉取远端快照',
                )
                if not acquired:
                    yield self._sync_event("error", "已有同步任务正在运行，请等待当前任务完成后再操作。", record=False)
                    return

                remote_meta = manager.get_remote_snapshot_meta()
                manager.validate_remote_snapshot_version(remote_meta)
                yield from self._sync_from_remote(
                    manager=manager,
                    runtime_state=runtime_state,
                    remote_meta=remote_meta,
                    runner_id=runner_id,
                    trigger='manual-pull',
                )
                update_runtime_state(
                    status='success',
                    trigger='manual-pull',
                    runner_id=runner_id,
                    last_success_at=timezone.now().isoformat(),
                    last_error='',
                )
                yield self._sync_event("done", "✅ 云端同步完成，本地数据与资源已刷新")
            except SyncError as e:
                if acquired:
                    update_runtime_state(status='error', trigger='manual-pull', runner_id=runner_id, last_error=str(e))
                yield self._sync_event("error", str(e))
            except Exception as e:
                if acquired:
                    update_runtime_state(status='error', trigger='manual-pull', runner_id=runner_id, last_error=str(e))
                yield self._sync_event("error", ErrorCode.WEBDEV_DOWNLOAD_FAIL.message)

        return StreamingHttpResponse(stream_generator(), content_type='application/x-ndjson')
