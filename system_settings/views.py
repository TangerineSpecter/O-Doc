from rest_framework import viewsets
from rest_framework.decorators import action

from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from utils.sync_manager import SyncManager
from utils.webdav import WebDavClient
from .models import AIProvider, AIModel, SystemSetting
from .serializers import AIProviderSerializer, AIModelSerializer


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


class SystemConfigViewSet(viewsets.ViewSet):
    """
    专门处理系统全局配置的接口 (如默认模型)
    """

    @action(detail=False, methods=['get'])
    def get_ai_config(self, request):
        # 获取 AI 配置，如果没有则返回默认空结构
        config, _ = SystemSetting.objects.get_or_create(
            key='system_ai_config',
            defaults={'value': {
                'defaultChatModelId': '',
                'defaultEmbeddingModelId': '',
                'defaultRerankModelId': ''
            }}
        )
        return success_result(config.value)

    @action(detail=False, methods=['post'])
    def save_ai_config(self, request):
        # 保存 AI 配置
        data = request.data
        SystemSetting.objects.update_or_create(
            key='system_ai_config',
            defaults={'value': data}
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
            remote_path = config.get('remotePath', '/o-doc-sync/')
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
                'remotePath': '/o-doc-backup/',
                'interval': 30
            }}
        )
        return success_result(config.value)

    @action(detail=False, methods=['post'])
    def save_webdav_config(self, request):
        """保存 WebDAV 配置"""
        data = request.data
        SystemSetting.objects.update_or_create(
            key='system_webdav_config',
            defaults={'value': data}
        )
        return success_result()

    @action(detail=False, methods=['post'])
    def sync_to_webdav(self, request):
        """
        [上传/推送]
        1. 数据库：本地与云端合并后，推送到云端。
        2. 资源：上传本地有但云端没有的文件。
        """
        manager = self._get_sync_manager()
        if not manager:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)

        try:
            # 1. 同步数据
            data_count = manager.sync_data_upload()
            # 2. 同步资源
            file_count = manager.sync_assets_upload()

            return success_result(msg=f"同步完成：更新 {data_count} 条数据记录，上传 {file_count} 个新文件")
        except Exception as e:
            return error_result(ErrorCode.WEBDEV_UPLOAD_FAIL)

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

        try:
            # 1. 拉取数据
            data_count = manager.sync_data_download()
            # 2. 拉取资源
            file_count = manager.sync_assets_download()

            return success_result(msg=f"同步完成：本地合并 {data_count} 条记录，下载 {file_count} 个文件")
        except Exception as e:
            return error_result(ErrorCode.WEBDEV_DOWNLOAD_FAIL)
