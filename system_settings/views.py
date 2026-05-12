import json

from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action

from system_settings.sync_scheduler import (
    generate_runner_id,
    get_runtime_state,
    update_runtime_state,
)
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from utils.sync_manager import SyncError, SyncManager
from utils.webdav import WebDavClient
from .models import AIProvider, AIModel, SystemSetting, GeoLocation
from .serializers import AIProviderSerializer, AIModelSerializer, GeoLocationSerializer


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


class SystemConfigViewSet(viewsets.ViewSet):
    """
    专门处理系统全局配置的接口 (如默认模型)
    """

    @staticmethod
    def _sync_from_remote(manager, runtime_state, remote_meta, runner_id, trigger):
        if remote_meta and remote_meta.get('snapshot_id'):
            remote_snapshot_id = remote_meta['snapshot_id']
            last_synced_snapshot_id = runtime_state.get('last_synced_snapshot_id')
            if remote_snapshot_id != last_synced_snapshot_id:
                yield json.dumps({
                    "step": "processing",
                    "msg": "检测到远端快照已更新，先拉取远端数据再继续同步。"
                }) + "\n"

        yield json.dumps({"step": "init", "msg": "开始从云端拉取快照..."}) + "\n"

        data_count = manager.sync_data_download()
        yield json.dumps({
            "step": "processing",
            "msg": f"数据快照已恢复，共对齐 {data_count} 条记录"
        }) + "\n"

        file_count = manager.sync_assets_download()
        yield json.dumps({
            "step": "processing",
            "msg": f"媒体资源已对齐，共下载/覆盖 {file_count} 个文件"
        }) + "\n"

        static_count = manager.sync_static_download()
        yield json.dumps({
            "step": "processing",
            "msg": f"静态资源已对齐，共下载/覆盖 {static_count} 个文件"
        }) + "\n"

        snapshot_id = (remote_meta or {}).get('snapshot_id')
        if snapshot_id:
            now = timezone.now().isoformat()
            update_runtime_state(
                status='success',
                trigger=trigger,
                runner_id=runner_id,
                last_pulled_snapshot_id=snapshot_id,
                last_synced_snapshot_id=snapshot_id,
                last_pull_at=now,
                last_error='',
            )

    @action(detail=False, methods=['get'])
    def get_ai_config(self, request):
        # 获取 AI 配置，如果没有则返回默认空结构
        default_value = {
            'defaultChatModelId': '',
            'simpleChatModelId': '',
            'defaultEmbeddingModelId': '',
            'defaultRerankModelId': ''
        }
        config, _ = SystemSetting.objects.get_or_create(
            key='system_ai_config',
            defaults={'value': default_value}
        )
        return success_result({**default_value, **config.value})

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
        return success_result({
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
        })

    @action(detail=False, methods=['post'])
    def save_webdav_config(self, request):
        """保存 WebDAV 配置"""
        data = request.data

        # 1. 简单校验
        url = data.get('url')
        username = data.get('username')
        password = data.get('password')
        if not all([url, username, password]):
            return error_result()

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
            try:
                runner_id = generate_runner_id('manual')
                runtime_state = get_runtime_state()
                issues = manager.validate_upload_state()
                if issues:
                    for issue in issues:
                        yield json.dumps({"step": "error", "msg": issue}) + "\n"
                    return

                remote_meta = manager.get_remote_snapshot_meta()
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

                yield json.dumps({
                    "step": "init",
                    "msg": "开始上传同步，当前会先同步文件，再写入数据快照，避免云端出现半同步状态。"
                }) + "\n"

                for chunk in manager.sync_static_upload_stream():
                    yield chunk

                for chunk in manager.sync_assets_upload_stream():
                    yield chunk

                for chunk in manager.sync_data_upload_stream():
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
                yield json.dumps({"step": "done", "msg": "✅ 所有同步已完成！"}) + "\n"
            except SyncError as e:
                yield json.dumps({"step": "error", "msg": str(e)}) + "\n"
            except Exception as e:
                yield json.dumps({"step": "error", "msg": f"同步失败：{str(e)}"}) + "\n"

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
            try:
                runner_id = generate_runner_id('manual')
                runtime_state = get_runtime_state()
                remote_meta = manager.get_remote_snapshot_meta()
                yield from self._sync_from_remote(
                    manager=manager,
                    runtime_state=runtime_state,
                    remote_meta=remote_meta,
                    runner_id=runner_id,
                    trigger='manual-pull',
                )
                yield json.dumps({"step": "done", "msg": "✅ 云端同步完成，本地数据与资源已刷新"}) + "\n"
            except SyncError as e:
                yield json.dumps({"step": "error", "msg": str(e)}) + "\n"
            except Exception as e:
                yield json.dumps({"step": "error", "msg": ErrorCode.WEBDEV_DOWNLOAD_FAIL.message}) + "\n"

        return StreamingHttpResponse(stream_generator(), content_type='application/x-ndjson')
