import json
import os
import tomllib
from pathlib import Path

from django.db import transaction
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action

from system_settings.sync_scheduler import (
    append_sync_message,
    generate_runner_id,
    get_runtime_state,
    mark_sync_started,
    update_runtime_state,
)
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from utils.sync_manager import SyncError, SyncManager
from utils.webdav import WebDavClient
from .models import Agent, AgentRunRecord, AgentTask, AIProvider, AIModel, MCPServer, Skill, SystemSetting, GeoLocation
from .runtime_tracker import get_runtime_info
from .serializers import (
    AgentRunRecordSerializer,
    AgentSerializer,
    AgentTaskSerializer,
    AIProviderSerializer,
    AIModelSerializer,
    MCPServerSerializer,
    SkillSerializer,
    GeoLocationSerializer,
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
        self.perform_destroy(instance)
        return success_result()


class AIModelViewSet(viewsets.ModelViewSet):
    queryset = AIModel.objects.all()
    serializer_class = AIModelSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return success_result(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        self.perform_destroy(instance)
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

    def perform_create(self, serializer):
        instance = serializer.save()
        if not instance.tools:
            from utils.mcp_client import fetch_mcp_tools
            tools, _ = fetch_mcp_tools(instance)
            if tools:
                instance.tools = tools
                instance.save(update_fields=['tools'])

    def perform_update(self, serializer):
        serializer.save()

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
        
        existing_tools = {t['name']: t for t in (server.tools or []) if isinstance(t, dict) and 'name' in t}
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
        if server.get('name') == 'node_repl' and command.endswith('/Contents/Resources/node_repl'):
            return True
        return False

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
        scanned = self._scan_local_configs()
        saved = []
        from utils.mcp_client import fetch_mcp_tools
        for server in scanned:
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
