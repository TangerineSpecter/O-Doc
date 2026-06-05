import logging
import os
import socket
import threading

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from anthology.models import Anthology
from article.models import Article
from utils.notification_service import NotificationService
from utils.rag_client import RagClient
from .models import SystemSetting
from .sync_scheduler import _env_flag, _is_server_process, get_scheduler_initial_delay_seconds

logger = logging.getLogger(__name__)

CONFIG_KEY = 'system_article_rag_schedule_config'
RUNTIME_KEY = 'system_article_rag_schedule_runtime'


def _local_now():
    now = timezone.now()
    if timezone.is_naive(now):
        return now
    return timezone.localtime(now)


def should_start_article_rag_scheduler():
    if not _env_flag('ODOC_ENABLE_ARTICLE_RAG_SCHEDULER', 'true'):
        return False

    if _env_flag('ODOC_FORCE_ARTICLE_RAG_SCHEDULER', 'false'):
        return True

    return _is_server_process()


class ArticleRagScheduler:
    def __init__(self):
        self._started = False
        self._thread = None
        self._start_lock = threading.Lock()
        self._stop_event = threading.Event()
        self._run_lock = threading.Lock()
        self.runner_id = f"{socket.gethostname()}:{os.getpid()}"

    @property
    def poll_seconds(self):
        raw_value = os.getenv('ODOC_ARTICLE_RAG_SCHEDULER_POLL_SECONDS', '30')
        try:
            return max(10, int(raw_value))
        except (TypeError, ValueError):
            return 30

    def start(self):
        with self._start_lock:
            if self._started:
                return

            self._started = True
            self._thread = threading.Thread(
                target=self._run_loop,
                name='article-rag-scheduler',
                daemon=True,
            )
            self._thread.start()
            logger.info('Article RAG scheduler started, poll=%ss', self.poll_seconds)

    def _run_loop(self):
        if self._stop_event.wait(get_scheduler_initial_delay_seconds()):
            return

        while not self._stop_event.is_set():
            try:
                close_old_connections()
                self._maybe_run()
            except Exception:
                logger.exception('Unexpected error in article RAG scheduler')
            finally:
                close_old_connections()

            self._stop_event.wait(self.poll_seconds)

    def _maybe_run(self):
        try:
            setting = SystemSetting.objects.filter(key=CONFIG_KEY).first()
        except (OperationalError, ProgrammingError):
            return

        if not setting:
            return

        config = setting.value or {}
        if not config.get('enabled'):
            return

        now = _local_now()
        run_time = self._parse_run_time(config.get('runTime') or config.get('run_time') or '02:00')
        if not run_time:
            logger.warning('Article RAG scheduler skipped invalid runTime=%s', config.get('runTime'))
            return

        if (now.hour, now.minute) < run_time:
            return

        today = now.date().isoformat()
        runtime = self._get_runtime()
        if runtime.get('last_run_date') == today:
            return

        last_started_at = str(runtime.get('last_started_at') or '')
        if runtime.get('status') == 'running' and last_started_at.startswith(today):
            return

        if not self._run_lock.acquire(blocking=False):
            return

        try:
            self._run(trigger='scheduler', run_date=today, notification_user='admin')
        finally:
            self._run_lock.release()

    def run_manual(self, notification_user=None):
        if not self._run_lock.acquire(blocking=False):
            return False

        try:
            self._run(trigger='manual', notification_user=notification_user or 'admin')
            return True
        finally:
            self._run_lock.release()

    def run_manual_async(self, notification_user=None):
        if not self._run_lock.acquire(blocking=False):
            return False

        def runner():
            try:
                close_old_connections()
                self._run(trigger='manual', notification_user=notification_user or 'admin')
            except Exception:
                logger.exception('Article RAG manual task failed unexpectedly')
            finally:
                close_old_connections()
                self._run_lock.release()

        threading.Thread(
            target=runner,
            name='article-rag-manual',
            daemon=True,
        ).start()
        return True

    @staticmethod
    def _parse_run_time(value):
        try:
            hour, minute = [int(part) for part in str(value).split(':')[:2]]
        except (TypeError, ValueError):
            return None

        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None

        return hour, minute

    @staticmethod
    def _get_runtime():
        try:
            setting = SystemSetting.objects.filter(key=RUNTIME_KEY).first()
        except (OperationalError, ProgrammingError):
            return {}

        return (setting.value or {}) if setting else {}

    @staticmethod
    def _save_runtime(**patch):
        current = ArticleRagScheduler._get_runtime()
        current.update(patch)
        current['updated_at'] = timezone.now().isoformat()
        try:
            SystemSetting.objects.update_or_create(
                key=RUNTIME_KEY,
                defaults={
                    'value': current,
                    'description': '文章 RAG 定时任务运行时状态',
                }
            )
        except (OperationalError, ProgrammingError):
            return current

        return current

    def _run(self, trigger='scheduler', run_date=None, notification_user=None):
        started_at = timezone.now()
        runtime_patch = {
            'status': 'running',
            'trigger': trigger,
            'runner_id': self.runner_id,
            'last_started_at': started_at.isoformat(),
            'last_error': '',
            'last_summary': [],
        }
        if run_date:
            runtime_patch['last_run_date'] = run_date
        self._save_runtime(**runtime_patch)

        queryset = Article.objects.filter(is_valid=True, is_rag_synced=False).order_by('updated_at')
        total = queryset.count()
        synced_count = 0
        failed_count = 0
        total_chunks = 0
        failures = []
        affected_coll_ids = set()

        logger.info('Article RAG started, trigger=%s, pending=%s', trigger, total)

        for article in queryset.iterator(chunk_size=50):
            try:
                chunk_count = RagClient.add_article(
                    article_id=article.article_id,
                    title=article.title,
                    content=article.content,
                    coll_id=article.coll_id,
                )
                article.is_rag_synced = True
                article.last_rag_synced_at = timezone.now()
                article.save(update_fields=['is_rag_synced', 'last_rag_synced_at'])
                synced_count += 1
                total_chunks += chunk_count or 0
                affected_coll_ids.add(article.coll_id)
            except Exception as exc:
                failed_count += 1
                message = str(exc) or '同步失败'
                failures.append({
                    'article_id': article.article_id,
                    'title': article.title,
                    'message': message,
                })
                logger.warning('Article RAG sync failed: article_id=%s, error=%s', article.article_id, message)

        for coll_id in affected_coll_ids:
            try:
                Anthology.objects.get(coll_id=coll_id).update_stats()
            except Exception:
                logger.exception('Failed to update anthology stats after article RAG sync, coll_id=%s', coll_id)

        status = 'success' if failed_count == 0 else 'partial'
        summary = [
            f"待处理 {total} 篇，成功 {synced_count} 篇，失败 {failed_count} 篇",
            f"生成 chunks 数：{total_chunks}",
        ]
        if failures:
            summary.extend(
                f"{item['title']}：{item['message']}"
                for item in failures[:10]
            )

        finished_at = timezone.now().isoformat()
        if synced_count > 0:
            self._send_notification(
                notification_user or 'admin',
                synced_count=synced_count,
                failed_count=failed_count,
                total_chunks=total_chunks,
                trigger=trigger,
            )

        self._save_runtime(
            status=status,
            trigger=trigger,
            runner_id=self.runner_id,
            last_finished_at=finished_at,
            last_success_at=finished_at if status == 'success' else '',
            last_error=failures[0]['message'] if failures else '',
            last_summary=summary,
            last_total=total,
            last_synced_count=synced_count,
            last_failed_count=failed_count,
            last_total_chunks=total_chunks,
        )
        logger.info(
            'Article RAG finished, trigger=%s, status=%s, total=%s, synced=%s, failed=%s',
            trigger,
            status,
            total,
            synced_count,
            failed_count,
        )

    @staticmethod
    def _send_notification(user, *, synced_count, failed_count, total_chunks, trigger):
        trigger_label = '手动执行' if trigger == 'manual' else '定时执行'
        content = f"{trigger_label}已完成，本次新增 RAG 文章 {synced_count} 篇，生成 chunks {total_chunks} 个。"
        if failed_count:
            content += f"另有 {failed_count} 篇处理失败，请检查后端日志或 RAG 运行状态。"

        NotificationService.send(
            user,
            title='文章 RAG 处理完成',
            content=content,
            level='success' if failed_count == 0 else 'warning',
            link='/settings',
        )


_article_rag_scheduler = ArticleRagScheduler()


def start_article_rag_scheduler():
    if should_start_article_rag_scheduler():
        _article_rag_scheduler.start()
