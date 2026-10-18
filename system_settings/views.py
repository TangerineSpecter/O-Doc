import json
import logging
import os
import secrets
import tempfile
import threading
import tomllib
from pathlib import Path
from types import SimpleNamespace

import requests
from django.db import transaction
from django.http import FileResponse, StreamingHttpResponse
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from system_settings.sync_scheduler import (
    MAX_AUTO_SYNC_FAILURES,
    append_sync_message,
    cancel_running_sync,
    generate_runner_id,
    get_runtime_state,
    is_sync_running,
    mark_sync_started,
    remote_lock_recovery_runner,
    reset_auto_sync_failure_state,
    runner_owns_sync,
    should_abort_sync,
    should_pull_remote_before_push,
    update_runtime_state,
)
from system_settings.sync_execution import release_execution
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result, valid_result
from utils.remote_storage import (
    create_sync_manager,
    create_storage_client,
    default_sync_config,
    destination_signature,
    normalize_sync_config,
    public_sync_config,
    validate_sync_config,
)
from utils.sync_manager import (
    OverwriteConfirmationRequired, SyncChoicesRequired, SyncError, SyncManager, format_sync_result,
)
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
from .agent_views import AgentActivityViewSet, AgentRunRecordViewSet, AgentTaskViewSet, AgentViewSet


logger = logging.getLogger(__name__)


from .mcp_skill_views import (
    MCPServerViewSet,
    SkillViewSet,
    SYSTEM_MCP_CONFIG_KEY,
    _base_system_mcp_config,
    _default_system_mcp_config,
    _generate_system_mcp_api_key,
    _sync_scanned_system_mcp_servers,
)


from .ai_views import AIModelViewSet, AIProviderViewSet, GeoLocationViewSet


def _json_safe(value):
    """NDJSON progress must survive datetimes and other non-JSON values."""
    isoformat = getattr(value, 'isoformat', None)
    if callable(isoformat):
        try:
            rendered = isoformat()
        except (TypeError, ValueError):
            rendered = None
        if isinstance(rendered, str):
            return rendered
    return str(value)


class SystemConfigViewSet(viewsets.ViewSet):
    def get_permissions(self):
        if self.action in {
            'get_system_mcp_config',
            'save_system_mcp_config',
            'regenerate_system_mcp_key',
            'export_local_backup',
            'import_local_backup',
            'get_webdav_config',
            'get_webdav_status',
            'cancel_webdav_sync',
            'save_webdav_config',
            'sync_to_webdav',
            'sync_from_webdav',
            'get_sync_history',
            'restore_sync_history',
        }:
            return [IsAuthenticated()]
        return super().get_permissions()

    """
    专门处理系统全局配置的接口 (如默认模型)
    """

    @staticmethod
    def _choice_payload(exc):
        return [{
            'key': item.get('key'),
            'model': item.get('model'),
            'label': item.get('label'),
            'remoteLabel': item.get('remote_label'),
            'localAt': item.get('local_at'),
            'remoteAt': item.get('remote_at'),
            'suggested': item.get('suggested'),
        } for item in exc.conflicts]

    @staticmethod
    def _sync_event(step, msg, record=True, **extra):
        if not isinstance(step, str):
            step = 'error'
        if not isinstance(msg, str):
            msg = '' if msg is None else str(msg)
        if record and msg:
            append_sync_message(msg)
        payload = {"step": step, "msg": msg, **extra}
        try:
            return json.dumps(payload, ensure_ascii=False, default=_json_safe) + "\n"
        except (TypeError, ValueError):
            # A bad extra must not escape the generator; that becomes HTTP 500 HTML.
            return json.dumps({
                "step": "error",
                "msg": "同步进度里有无法写入的内容，请查看运行日志。",
            }, ensure_ascii=False) + "\n"

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
            'last_base_snapshot_id': runtime_state.get('last_base_snapshot_id', ''),
            'last_uploaded_snapshot_id': runtime_state.get('last_uploaded_snapshot_id', ''),
            'last_pulled_snapshot_id': runtime_state.get('last_pulled_snapshot_id', ''),
            'last_safety_backup': runtime_state.get('last_safety_backup', ''),
            'last_merge_summary': runtime_state.get('last_merge_summary', {}),
            'sync_progress': runtime_state.get('sync_progress', 0),
            'cancel_requested': bool(runtime_state.get('cancel_requested')),
            'auto_sync_consecutive_failures': runtime_state.get('auto_sync_consecutive_failures', 0),
            'auto_sync_next_retry_at': runtime_state.get('auto_sync_next_retry_at', ''),
            'auto_sync_paused': bool(runtime_state.get('auto_sync_paused')),
            'auto_sync_pause_notice_sent': bool(runtime_state.get('auto_sync_pause_notice_sent')),
            'auto_sync_max_failures': MAX_AUTO_SYNC_FAILURES,
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
            'lastBaseSnapshotId': payload['last_base_snapshot_id'],
            'lastUploadedSnapshotId': payload['last_uploaded_snapshot_id'],
            'lastPulledSnapshotId': payload['last_pulled_snapshot_id'],
            'lastSafetyBackup': payload['last_safety_backup'],
            'lastMergeSummary': payload['last_merge_summary'],
            'syncProgress': payload['sync_progress'],
            'cancelRequested': payload['cancel_requested'],
            'autoSyncConsecutiveFailures': payload['auto_sync_consecutive_failures'],
            'autoSyncNextRetryAt': payload['auto_sync_next_retry_at'],
            'autoSyncPaused': payload['auto_sync_paused'],
            'autoSyncPauseNoticeSent': payload['auto_sync_pause_notice_sent'],
            'autoSyncMaxFailures': payload['auto_sync_max_failures'],
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

        if not runner_owns_sync(runner_id):
            raise SyncError('同步已取消')
        data_count = manager.sync_data_download(
            remote_meta=remote_meta,
            should_abort=lambda: not runner_owns_sync(runner_id),
        )
        yield SystemConfigViewSet._sync_event(
            "processing",
            f"数据快照已恢复，共对齐 {data_count} 条记录"
        )

        file_count = manager.sync_assets_download(
            should_abort=lambda: not runner_owns_sync(runner_id),
        )
        yield SystemConfigViewSet._sync_event(
            "processing",
            f"媒体资源已对齐，共下载/覆盖 {file_count} 个文件"
        )

        snapshot_id = (remote_meta or {}).get('snapshot_id')
        if snapshot_id and runner_owns_sync(runner_id):
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
            'defaultImageGenerationModelId': '',
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
            'endTime': '08:00',
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
        end_time = data.get('endTime') or data.get('end_time') or '08:00'
        from system_settings.article_rag_scheduler import ArticleRagScheduler

        parsed_start = ArticleRagScheduler._parse_run_time(run_time)
        parsed_end = ArticleRagScheduler._parse_run_time(end_time)
        if not parsed_start or not parsed_end:
            return valid_result(msg='开始和结束时间必须使用 24 小时制 HH:MM')
        if parsed_start == parsed_end:
            return valid_result(msg='开始时间和结束时间不能相同')

        SystemSetting.objects.update_or_create(
            key='system_article_rag_schedule_config',
            defaults={
                'value': {
                    'enabled': enabled,
                    'runTime': run_time,
                    'endTime': end_time,
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

            return create_sync_manager(config)
        except (SystemSetting.DoesNotExist, ValueError):
            return None

    @action(detail=False, methods=['get'])
    def get_webdav_config(self, request):
        """获取同步与备份配置"""
        config, _ = SystemSetting.objects.get_or_create(
            key='system_webdav_config',
            defaults={'value': default_sync_config()}
        )
        return success_result(public_sync_config(config.value))

    @action(detail=False, methods=['get'])
    def get_webdav_status(self, request):
        runtime_state = get_runtime_state()
        if runtime_state.get('status') == 'running' and not is_sync_running(runtime_state):
            runtime_state = get_runtime_state()
        return success_result(self._status_payload(runtime_state))

    @action(detail=False, methods=['post'])
    def cancel_webdav_sync(self, request):
        """请求同步在安全检查点退出，并等待其释放远端同步锁。"""
        cancelled, runtime_state = cancel_running_sync('已请求终止同步，等待任务安全退出')
        if not cancelled:
            return valid_result(data=self._status_payload(runtime_state), msg='当前没有正在运行的同步任务')
        return success_result(
            self._status_payload(runtime_state),
            msg='已请求终止同步；正在等待当前网络请求结束并释放远端同步锁。',
        )

    @action(detail=False, methods=['get'])
    def get_sync_history(self, request):
        manager = self._get_sync_manager()
        if not manager:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)
        try:
            return success_result([{
                'snapshotId': item.get('snapshot_id', ''),
                'generatedAt': item.get('generated_at', ''),
                'source': item.get('source', ''),
                'deviceId': item.get('device_id', ''),
                'appVersion': item.get('app_version', ''),
                'recordCount': item.get('record_count', 0),
                'mediaCount': item.get('media_count', 0),
                'mediaBytes': item.get('media_bytes', 0),
                'snapshotBytes': item.get('snapshot_bytes'),
            } for item in manager.list_v2_history()])
        except SyncError as exc:
            return valid_result(msg=str(exc))

    @action(detail=False, methods=['post'])
    def restore_sync_history(self, request):
        snapshot_id = str(request.data.get('snapshotId') or request.data.get('snapshot_id') or '').strip()
        if not snapshot_id:
            return valid_result(msg='请选择要恢复的历史快照')
        manager = self._get_sync_manager()
        if not manager:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)
        runner_id = generate_runner_id('history-restore')
        acquired, _ = mark_sync_started(
            trigger='history-restore', runner_id=runner_id,
            initial_message='正在从历史快照恢复，已先创建本机安全快照',
        )
        if not acquired:
            return error_result(ErrorCode.WEBDEV_ERROR, data='已有同步任务正在运行，请稍后再恢复')
        try:
            snapshot, safety_backup = manager.restore_v2_snapshot(snapshot_id, runner_id=runner_id)
            update_runtime_state(
                status='success', trigger='history-restore', runner_id=runner_id,
                last_success_at=timezone.now().isoformat(), last_error='',
                last_synced_snapshot_id=snapshot['meta']['snapshot_id'],
                last_base_snapshot_id=snapshot['meta'].get('base_snapshot_id', ''),
                last_safety_backup=safety_backup,
            )
            return success_result({
                'snapshotId': snapshot['meta']['snapshot_id'],
                'safetyBackup': safety_backup,
            }, msg='历史快照已恢复，并已创建恢复前本机安全快照')
        except Exception as exc:
            if runner_owns_sync(runner_id):
                update_runtime_state(status='error', trigger='history-restore', runner_id=runner_id, last_error=str(exc))
            return valid_result(msg=str(exc))
        finally:
            release_execution(runner_id)

    @action(detail=False, methods=['post'])
    def export_local_backup(self, request):
        if is_sync_running():
            return error_result(ErrorCode.WEBDEV_ERROR, data='已有同步任务正在运行，请稍后再导出')

        runner_id = generate_runner_id('local-export')
        zip_file = tempfile.NamedTemporaryFile(prefix='odoc-backup-', suffix='.zip', delete=False)
        zip_path = zip_file.name
        zip_file.close()
        try:
            manager = SyncManager()
            manager.write_local_backup_zip(zip_path, source='local-export', runner_id=runner_id)
        except Exception as exc:
            if os.path.exists(zip_path):
                os.remove(zip_path)
            logging.getLogger(__name__).exception('导出本地备份失败')
            return error_result(ErrorCode.WEBDEV_DOWNLOAD_FAIL)

        filename = f"o-doc-backup-{timezone.now().strftime('%Y%m%d-%H%M%S')}.zip"
        response = FileResponse(open(zip_path, 'rb'), as_attachment=True, filename=filename)
        response['Content-Type'] = 'application/zip'

        def _cleanup():
            try:
                os.remove(zip_path)
            except OSError:
                pass

        if hasattr(response, 'closed'):
            original_close = response.close

            def close():
                original_close()
                _cleanup()

            response.close = close
        return response

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def import_local_backup(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return valid_result(msg='请选择要导入的备份压缩包')

        runner_id = generate_runner_id('local-import')
        acquired, _runtime = mark_sync_started(
            trigger='local-import',
            runner_id=runner_id,
            initial_message='开始导入本地备份压缩包',
        )
        if not acquired:
            return error_result(ErrorCode.WEBDEV_ERROR, data='已有同步任务正在运行，请稍后再导入')

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix='odoc-import-', suffix='.zip', delete=False) as tmp:
                tmp_path = tmp.name
                for chunk in upload.chunks():
                    tmp.write(chunk)

            manager = SyncManager()
            count, meta = manager.import_local_backup_zip(
                tmp_path,
                should_abort=lambda: not runner_owns_sync(runner_id),
            )
            if runner_owns_sync(runner_id):
                update_runtime_state(
                    status='success',
                    trigger='local-import',
                    runner_id=runner_id,
                    last_success_at=timezone.now().isoformat(),
                    last_error='',
                )
            return success_result({
                'count': count,
                'appVersion': (meta or {}).get('app_version', ''),
            }, msg='本地备份已导入，当前数据已按压缩包全量覆盖')
        except SyncError as exc:
            if runner_owns_sync(runner_id):
                update_runtime_state(status='error', trigger='local-import', runner_id=runner_id, last_error=str(exc))
            return valid_result(msg=str(exc))
        except Exception as exc:
            if runner_owns_sync(runner_id):
                update_runtime_state(status='error', trigger='local-import', runner_id=runner_id, last_error=str(exc))
            logging.getLogger(__name__).exception('导入本地备份失败')
            return error_result(ErrorCode.WEBDEV_DOWNLOAD_FAIL)
        finally:
            release_execution(runner_id)
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

    @action(detail=False, methods=['post'])
    def save_webdav_config(self, request):
        """保存同步与备份配置；开启时测试远端连接，关闭时只保存关闭状态。"""
        try:
            data = normalize_sync_config(request.data)
            previous = SystemSetting.objects.filter(key='system_webdav_config').first()
            previous_value = (previous.value if previous else {}) or {}
            dest_changed = destination_signature(previous_value) != destination_signature(data)
            if dest_changed:
                data['host_key'] = ''
            elif not data.get('host_key'):
                data['host_key'] = previous_value.get('host_key') or ''
            if data['enabled']:
                validate_sync_config(data)
        except ValueError as exc:
            return valid_result(msg=str(exc))

        try:
            client = None
            if data['enabled']:
                client = create_storage_client(data)
                if not client.check_connection():
                    raise Exception("验证失败，无法连接到备份服务器")

            if dest_changed:
                update_runtime_state(
                    last_synced_snapshot_id='',
                    last_uploaded_snapshot_id='',
                    last_pulled_snapshot_id='',
                )
                from anthology.models import Book
                book_queryset = Book.objects.filter(is_valid=True, remote_available=True)
                from system_settings.sync_state import record_bulk_change
                record_bulk_change(book_queryset)
                book_queryset.update(
                    remote_available=False,
                    remote_hash='',
                )

            if client:
                captured_host_key = getattr(client, 'last_host_key', '') or ''
                if isinstance(captured_host_key, str) and captured_host_key:
                    data['host_key'] = captured_host_key

            SystemSetting.objects.update_or_create(
                key='system_webdav_config',
                defaults={'value': data}
            )
            reset_auto_sync_failure_state()
            return success_result(
                msg="连接测试通过并保存成功" if data['enabled'] else "同步服务已关闭，配置已保存"
            )
        except Exception as e:
            logger.exception(
                'Remote synchronization configuration save failed: protocol=%s', data.get('protocol')
            )
            return error_result(ErrorCode.WEBDEV_LOGIN_FAIL)

    @action(detail=False, methods=['post'])
    def sync_to_webdav(self, request):
        manager = self._get_sync_manager()
        if not manager:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)
        force_overwrite = bool(request.data.get('force_overwrite', False))
        compare = bool(request.data.get('compare', False))
        resolutions = request.data.get('resolutions')
        resolution_default = request.data.get('resolution_default') or ''
        choices_confirmed = bool(request.data.get('choices_confirmed', False))

        def stream_generator():
            runner_id = generate_runner_id('manual')
            acquired = False
            try:
                recover_owned_remote_lock = remote_lock_recovery_runner()
                acquired, runtime_state = mark_sync_started(
                    trigger='manual',
                    runner_id=runner_id,
                    initial_message='手动上传同步开始：准备检查远端快照与本地资源',
                )
                if not acquired:
                    yield self._sync_event("error", "已有同步任务正在运行，请等待当前任务完成后再操作。", record=False)
                    return

                yield self._sync_event('init', '正在逐条对比本机与云端…' if compare else '正在检查当前远端目录是否已有备份…')
                if compare:
                    snapshot, summary, safety_backup = manager.sync_v2(
                        source='manual', runner_id=runner_id,
                        base_snapshot_id=runtime_state.get('last_synced_snapshot_id', ''),
                        on_progress=lambda message, progress=None: append_sync_message(
                            message, runner_id=runner_id, progress=progress),
                        should_abort=lambda: should_abort_sync(runner_id),
                        recover_owned_remote_lock=recover_owned_remote_lock,
                        review_conflicts=True,
                        resolutions=resolutions,
                        resolution_default=resolution_default,
                        choices_confirmed=choices_confirmed,
                    )
                else:
                    snapshot, summary, safety_backup = manager.sync_v2(
                        source='manual', runner_id=runner_id,
                        base_snapshot_id=runtime_state.get('last_synced_snapshot_id', ''),
                        on_progress=lambda message, progress=None: append_sync_message(
                            message, runner_id=runner_id, progress=progress),
                        should_abort=lambda: should_abort_sync(runner_id),
                        recover_owned_remote_lock=recover_owned_remote_lock,
                        force_overwrite=force_overwrite,
                        manual_upload=True,
                    )
                snapshot_meta = snapshot['meta']
                yield self._sync_event('summary', format_sync_result(summary, safety_backup))
                update_runtime_state(
                    status='success',
                    trigger='manual',
                    runner_id=runner_id,
                    last_success_at=timezone.now().isoformat(),
                    last_uploaded_snapshot_id=snapshot_meta['snapshot_id'],
                    last_synced_snapshot_id=snapshot_meta['snapshot_id'],
                    last_base_snapshot_id=snapshot_meta.get('base_snapshot_id', ''),
                    last_push_at=timezone.now().isoformat(),
                    last_error='',
                    cancel_requested=False, abandoned_runner_id='',
                    auto_sync_consecutive_failures=0,
                    auto_sync_next_retry_at='',
                    auto_sync_paused=False,
                    auto_sync_pause_notice_sent=False,
                    last_safety_backup=safety_backup,
                    last_merge_summary=summary,
                    sync_progress=100,
                )
                append_sync_message(
                    '数据与媒体均未变化，远端快照保持不变。' if summary.get('unchanged') else '同步快照已发布，远端 current 指针已更新。',
                    runner_id=runner_id, progress=100,
                )
                yield self._sync_event("done", "✅ 所有同步已完成！")
            except OverwriteConfirmationRequired as e:
                if acquired and runner_owns_sync(runner_id):
                    update_runtime_state(
                        status='idle', trigger='manual', runner_id=runner_id,
                        last_error='', cancel_requested=False, sync_progress=0,
                    )
                yield self._sync_event('confirm_overwrite', str(e))
            except SyncChoicesRequired as e:
                if acquired and runner_owns_sync(runner_id):
                    update_runtime_state(
                        status='idle', trigger='manual', runner_id=runner_id,
                        last_error='', cancel_requested=False, sync_progress=0,
                    )
                yield self._sync_event('choose_items', str(e), conflicts=self._choice_payload(e), conflictTotal=e.total)
            except Exception as e:
                if acquired and runner_owns_sync(runner_id):
                    if should_abort_sync(runner_id):
                        update_runtime_state(status='idle', last_error='', cancel_requested=False,
                                             abandoned_runner_id=runner_id, sync_progress=0)
                        yield self._sync_event('cancelled', '同步已终止。')
                        return
                    update_runtime_state(status='error', trigger='manual', runner_id=runner_id, last_error=str(e), cancel_requested=False)
                yield self._sync_event("error", str(e) if isinstance(e, SyncError) else f"同步失败：{str(e)}")
            finally:
                if acquired:
                    release_execution(runner_id)

        return StreamingHttpResponse(stream_generator(), content_type='application/x-ndjson')

    @action(detail=False, methods=['post'])
    def sync_from_webdav(self, request):
        """
        确认覆盖时用云端快照整库替换本机。未选择覆盖时逐条对比，两端都改过的记录交回用户选择。
        """
        manager = self._get_sync_manager()
        if not manager:
            return error_result(ErrorCode.WEBDEV_NOT_CONFIG)

        force_overwrite = bool(request.data.get('force_overwrite', False))
        compare = bool(request.data.get('compare', False))
        resolutions = request.data.get('resolutions')
        resolution_default = request.data.get('resolution_default') or ''
        choices_confirmed = bool(request.data.get('choices_confirmed', False))

        def stream_generator():
            runner_id = generate_runner_id('manual')
            acquired = False
            try:
                recover_owned_remote_lock = remote_lock_recovery_runner()
                acquired, runtime_state = mark_sync_started(
                    trigger='manual-pull',
                    runner_id=runner_id,
                    initial_message='手动从云端下载开始：准备拉取远端快照',
                )
                if not acquired:
                    yield self._sync_event("error", "已有同步任务正在运行，请等待当前任务完成后再操作。", record=False)
                    return

                # 下载读取远端时不因农场、生活或记忆完整性中断；更高的快照版本仍拒绝。
                manager.relax_integrity = True
                if force_overwrite:
                    yield self._sync_event('init', '正在用云端快照覆盖本机…')
                    snapshot, summary, safety_backup = manager.force_download_v2(
                        runner_id=runner_id,
                        on_progress=lambda message, progress=None: append_sync_message(
                            message, runner_id=runner_id, progress=progress),
                        should_abort=lambda: should_abort_sync(runner_id),
                        recover_owned_remote_lock=recover_owned_remote_lock,
                    )
                    remote = snapshot
                else:
                    remote = manager.get_v2_current()
                    if not remote:
                        raise SyncError('远端尚未升级为安全同步 v2；请先在拥有最新数据的设备执行一次上传同步。')
                    yield self._sync_event('init', '正在逐条对比本机与云端…' if compare else '正在比对修订清单与媒体哈希…')
                    snapshot, summary, safety_backup = manager.sync_v2(
                        source='manual-pull', runner_id=runner_id,
                        base_snapshot_id=runtime_state.get('last_synced_snapshot_id', ''),
                        on_progress=lambda message, progress=None: append_sync_message(
                            message, runner_id=runner_id, progress=progress),
                        should_abort=lambda: should_abort_sync(runner_id),
                        recover_owned_remote_lock=recover_owned_remote_lock,
                        review_conflicts=compare,
                        resolutions=resolutions,
                        resolution_default=resolution_default,
                        choices_confirmed=choices_confirmed,
                    )
                yield self._sync_event('summary', format_sync_result(summary, safety_backup))
                update_runtime_state(
                    status='success',
                    trigger='manual-pull',
                    runner_id=runner_id,
                    last_success_at=timezone.now().isoformat(),
                    last_error='',
                    cancel_requested=False, abandoned_runner_id='',
                    auto_sync_consecutive_failures=0,
                    auto_sync_next_retry_at='',
                    auto_sync_paused=False,
                    auto_sync_pause_notice_sent=False,
                    last_synced_snapshot_id=snapshot['meta']['snapshot_id'],
                    last_base_snapshot_id=snapshot['meta'].get('base_snapshot_id', ''),
                    last_pulled_snapshot_id=remote['meta']['snapshot_id'],
                    last_pull_at=timezone.now().isoformat(),
                    last_safety_backup=safety_backup,
                    last_merge_summary=summary,
                    sync_progress=100,
                )
                if summary.get('direction') == 'download':
                    finished = '云端快照已覆盖本机。'
                elif summary.get('unchanged'):
                    finished = '数据与媒体均未变化，远端快照保持不变。'
                else:
                    finished = '云端同步快照已发布，本地与远端已完成对齐。'
                append_sync_message(finished, runner_id=runner_id, progress=100)
                yield self._sync_event("done", "✅ 云端同步完成，本地数据与资源已刷新")
            except SyncChoicesRequired as e:
                if acquired and runner_owns_sync(runner_id):
                    update_runtime_state(
                        status='idle', trigger='manual-pull', runner_id=runner_id,
                        last_error='', cancel_requested=False, sync_progress=0,
                    )
                yield self._sync_event('choose_items', str(e), conflicts=self._choice_payload(e), conflictTotal=e.total)
            except Exception as e:
                if acquired and runner_owns_sync(runner_id):
                    if should_abort_sync(runner_id):
                        update_runtime_state(status='idle', last_error='', cancel_requested=False,
                                             abandoned_runner_id=runner_id, sync_progress=0)
                        yield self._sync_event('cancelled', '同步已终止。')
                        return
                    update_runtime_state(status='error', trigger='manual-pull', runner_id=runner_id, last_error=str(e), cancel_requested=False)
                yield self._sync_event("error", str(e) if isinstance(e, SyncError) else ErrorCode.WEBDEV_DOWNLOAD_FAIL.message)
            finally:
                if acquired:
                    release_execution(runner_id)

        return StreamingHttpResponse(stream_generator(), content_type='application/x-ndjson')
