import json
import os
from pathlib import Path
import secrets
import tomllib
from types import SimpleNamespace

from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from system_settings.models import Agent, MCPServer, Skill, SystemSetting
from system_settings.serializers import MCPServerSerializer, SkillSerializer
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result


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


