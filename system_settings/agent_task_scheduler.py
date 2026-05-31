import logging
import os
import socket
import threading
from datetime import timedelta

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from ai_assistant.prompts import CHAT_SYSTEM_PROMPT
from anthology.models import Anthology
from article.models import Article
from memos.models import Memo
from utils.ai_service import AIService
from .models import AgentRunRecord, AgentTask, Skill
from .sync_scheduler import _env_flag, _is_server_process

logger = logging.getLogger(__name__)


def _local_now():
    now = timezone.now()
    if timezone.is_naive(now):
        return now
    return timezone.localtime(now)


def _to_local(value):
    if not value or timezone.is_naive(value):
        return value
    return timezone.localtime(value)


def should_start_agent_task_scheduler():
    if not _env_flag('ODOC_ENABLE_AGENT_TASK_SCHEDULER', 'true'):
        return False

    if _env_flag('ODOC_FORCE_AGENT_TASK_SCHEDULER', 'false'):
        return True

    return _is_server_process()


class AgentTaskScheduler:
    def __init__(self):
        self._started = False
        self._thread = None
        self._stop_event = threading.Event()
        self._run_lock = threading.Lock()
        self.runner_id = f"{socket.gethostname()}:{os.getpid()}"

    @property
    def poll_seconds(self):
        raw_value = os.getenv('ODOC_AGENT_TASK_SCHEDULER_POLL_SECONDS', '30')
        try:
            return max(10, int(raw_value))
        except (TypeError, ValueError):
            return 30

    def start(self):
        if self._started:
            return

        self._thread = threading.Thread(
            target=self._run_loop,
            name='agent-task-scheduler',
            daemon=True,
        )
        self._thread.start()
        self._started = True
        logger.info('Agent task scheduler started, poll=%ss', self.poll_seconds)

    def _run_loop(self):
        while not self._stop_event.is_set():
            try:
                close_old_connections()
                self._maybe_run_due_tasks()
            except Exception:
                logger.exception('Unexpected error in agent task scheduler')
            finally:
                close_old_connections()

            self._stop_event.wait(self.poll_seconds)

    def _maybe_run_due_tasks(self):
        if not self._run_lock.acquire(blocking=False):
            return

        try:
            try:
                tasks = list(AgentTask.objects.select_related('agent').filter(
                    enabled=True,
                    trigger='定时任务',
                ))
            except (OperationalError, ProgrammingError):
                return

            now = _local_now()
            for task in tasks:
                if self._is_due(task, now):
                    self._run_task(task)
        finally:
            self._run_lock.release()

    def _is_due(self, task, now):
        last_record = AgentRunRecord.objects.filter(task=task).order_by('-started_at').first()
        last_started_at = _to_local(last_record.started_at) if last_record else None

        if task.schedule_type == 'interval':
            interval_minutes = max(1, task.interval_minutes or 1)
            if not last_started_at:
                return True
            return now - last_started_at >= timedelta(minutes=interval_minutes)

        scheduled_at = self._get_scheduled_datetime(task, now)
        if scheduled_at is None or now < scheduled_at:
            return False

        return not last_started_at or last_started_at < scheduled_at

    @staticmethod
    def _get_scheduled_datetime(task, now):
        try:
            hour, minute = [int(part) for part in (task.schedule_time or '09:00').split(':')[:2]]
        except (TypeError, ValueError):
            hour, minute = 9, 0

        hour = min(max(hour, 0), 23)
        minute = min(max(minute, 0), 59)

        if task.schedule_type == 'daily':
            return now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        if task.schedule_type == 'weekly':
            try:
                target_weekday = int(task.schedule_weekday)
            except (TypeError, ValueError):
                target_weekday = 1
            # 前端保存为 1-6 表示周一到周六，0 表示周日；Python weekday 为 0-6 表示周一到周日。
            target_weekday = 6 if target_weekday == 0 else min(max(target_weekday - 1, 0), 5)
            if now.weekday() != target_weekday:
                return None
            return now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        if task.schedule_type == 'monthly':
            try:
                target_day = int(task.schedule_month_day)
            except (TypeError, ValueError):
                target_day = 1
            if now.day != target_day:
                return None
            return now.replace(hour=hour, minute=minute, second=0, microsecond=0)

        return None

    def _run_task(self, task):
        started = timezone.now()
        record = AgentRunRecord.objects.create(
            task=task,
            task_name=task.name,
            agent=task.agent,
            agent_name=task.agent.name if task.agent else '',
            trigger='scheduler',
            status='running',
            summary='任务开始执行',
            started_at=started,
        )

        try:
            content = AIService.chat_completion(self._build_prompt(task))
            output_summary = self._save_output(task, content)
            duration_seconds = max(0, int((timezone.now() - started).total_seconds()))
            record.status = 'success'
            record.duration = self._format_duration(duration_seconds)
            record.summary = output_summary
            record.save(update_fields=['status', 'duration', 'summary', 'updated_at'])
            logger.info('Agent task finished: %s', task.id)
        except Exception as exc:
            duration_seconds = max(0, int((timezone.now() - started).total_seconds()))
            record.status = 'failed'
            record.duration = self._format_duration(duration_seconds)
            record.summary = str(exc)[:255]
            record.save(update_fields=['status', 'duration', 'summary', 'updated_at'])
            logger.exception('Agent task failed: %s', task.id)

    def _build_prompt(self, task):
        agent = task.agent
        parts = [CHAT_SYSTEM_PROMPT]
        if agent and agent.prompt:
            parts.append(f"当前 Agent：{agent.name}\n{agent.prompt}")

        skill_prompts = self._get_skill_prompts(agent)
        if skill_prompts:
            parts.append("你已装载以下 O-Doc 系统技能。请按技能边界使用它们：\n" + "\n\n".join(skill_prompts))

        parts.append(
            "你正在执行一个定时 Agent 任务。请直接输出最终内容，不要描述执行过程。\n"
            f"任务名称：{task.name}\n"
            f"任务提示词：{task.prompt or '请根据 Agent 职责完成本次任务。'}"
        )
        return "\n\n".join(parts)

    @staticmethod
    def _get_skill_prompts(agent):
        if not agent or not isinstance(agent.skills, list) or not agent.skills:
            return []

        skills = Skill.objects.filter(
            id__in=agent.skills,
            enabled=True,
        )
        return [f"### {skill.name}\n{skill.prompt}" for skill in skills if skill.prompt]

    def _save_output(self, task, content):
        if task.output == 'memos':
            Memo.objects.create(
                content=(content or '')[:2000],
                tag='Agent任务',
                user_id='admin',
            )
            return '已输出到 Memos'

        if not task.target_collection_id:
            raise ValueError('任务未配置输出文集')

        title = self._build_article_title(task)
        article = Article.objects.create(
            title=title,
            content=content or '',
            coll_id=task.target_collection_id,
            author='admin',
            permission='public',
        )
        anthology = Anthology.objects.filter(coll_id=task.target_collection_id).first()
        if anthology:
            anthology.update_stats()
        return f"已输出到文集：{task.target_collection_title or task.target_collection_id} / {article.title}"

    @staticmethod
    def _build_article_title(task):
        timestamp = _local_now().strftime('%Y-%m-%d %H:%M:%S')
        return f"{task.name} {timestamp}"[:255]

    @staticmethod
    def _format_duration(seconds):
        if seconds < 60:
            return f"{seconds}s"
        minutes, rest = divmod(seconds, 60)
        if minutes < 60:
            return f"{minutes}m {rest}s"
        hours, minutes = divmod(minutes, 60)
        return f"{hours}h {minutes}m"


_agent_task_scheduler = AgentTaskScheduler()


def start_agent_task_scheduler():
    if should_start_agent_task_scheduler():
        _agent_task_scheduler.start()
