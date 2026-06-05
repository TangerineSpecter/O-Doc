import logging
import os
import socket
import threading
import json
import urllib.error
import urllib.request
from datetime import timedelta
import re

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from ai_assistant.prompts import CHAT_SYSTEM_PROMPT
from anthology.models import Anthology
from article.models import Article
from memos.models import Memo
from utils.ai_service import AIService
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools
from .models import AgentRunRecord, AgentTask, MCPServer, Skill
from .sync_scheduler import _env_flag, _is_server_process, get_scheduler_initial_delay_seconds

logger = logging.getLogger(__name__)


def _scheduler_log(message):
    text = f"[AgentTaskScheduler] {message}"
    logger.warning(text)


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
        self._start_lock = threading.Lock()
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
        with self._start_lock:
            if self._started:
                return

            self._started = True
            self._thread = threading.Thread(
                target=self._run_loop,
                name='agent-task-scheduler',
                daemon=True,
            )
            self._thread.start()
            _scheduler_log(f"started, poll={self.poll_seconds}s, runner={self.runner_id}")

    def _run_loop(self):
        if self._stop_event.wait(get_scheduler_initial_delay_seconds()):
            return

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
                    _scheduler_log(
                        f"due task detected: id={task.id}, name={task.name}, "
                        f"type={task.schedule_type}, time={task.schedule_time}, now={now}"
                    )
                    self._run_task(task, trigger='定时任务')
        finally:
            self._run_lock.release()

    def run_manual_task(self, task_id):
        try:
            close_old_connections()
            task = AgentTask.objects.select_related('agent').get(id=task_id)
            _scheduler_log(f"manual task requested: id={task.id}, name={task.name}")
            self._run_task(task, trigger='手动执行')
        except AgentTask.DoesNotExist:
            _scheduler_log(f"manual task missing: id={task_id}")
        except Exception:
            logger.exception('Unexpected error in manual agent task')
        finally:
            close_old_connections()

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

    def _run_task(self, task, trigger='scheduler'):
        started = timezone.now()
        record = AgentRunRecord.objects.create(
            task=task,
            task_name=task.name,
            agent=task.agent,
            agent_name=task.agent.name if task.agent else '',
            trigger=trigger,
            status='running',
            summary='任务开始执行',
            started_at=started,
            steps=[],
        )
        try:
            self._append_run_step(record, 'running', '开始执行任务', f"任务：{task.name}，触发方式：{trigger}")
            self._append_run_step(
                record,
                'info',
                '装载 Agent',
                f"Agent：{task.agent.name}" if task.agent else '未配置 Agent',
            )
            tool_context = self._append_agent_context_steps(record, task)
            self._append_run_step(record, 'running', '调用 AI 生成内容', '正在根据任务提示词生成最终内容')
            if tool_context['tools']:
                content = AIService.chat_completion_with_tools(
                    self._build_prompt(task, has_mcp_tools=True),
                    tool_context['tools'],
                    lambda tool_name, arguments: self._execute_mcp_tool(tool_context, tool_name, arguments),
                    on_tool_call=lambda tool_name, arguments: self._append_run_step(
                        record,
                        'running',
                        '调用 MCP Tool',
                        f"{tool_name} 参数：{json.dumps(arguments, ensure_ascii=False)[:500]}",
                    )
                )
            else:
                content = AIService.chat_completion(self._build_prompt(task))
            self._append_run_step(record, 'success', 'AI 内容生成完成', f"生成内容长度：{len(content or '')} 字符")
            self._append_run_step(record, 'running', '写入输出', '正在保存生成内容')
            output_info = self._save_output(task, content)
            self._append_run_step(record, 'success', output_info['step_title'], output_info['summary'])
            duration_seconds = max(0, int((timezone.now() - started).total_seconds()))
            record.status = 'success'
            record.duration = self._format_duration(duration_seconds)
            record.summary = output_info['summary']
            record.save(update_fields=['status', 'duration', 'summary', 'updated_at'])
            self._send_task_notification(task, output_info['title'], record)
            self._append_run_step(record, 'success', '执行结束', f"总耗时：{record.duration}")
            _scheduler_log(f"task success: id={task.id}, name={task.name}, title={output_info['title']}")
            logger.info('Agent task finished: %s', task.id)
        except Exception as exc:
            duration_seconds = max(0, int((timezone.now() - started).total_seconds()))
            record.status = 'failed'
            record.duration = self._format_duration(duration_seconds)
            record.summary = str(exc)[:255]
            record.save(update_fields=['status', 'duration', 'summary', 'updated_at'])
            self._append_run_step(record, 'failed', '执行失败', str(exc)[:500])
            _scheduler_log(f"task failed: id={task.id}, name={task.name}, error={exc}")
            logger.exception('Agent task failed: %s', task.id)

    def _append_run_step(self, record, status, title, detail=''):
        step = {
            'time': _local_now().strftime('%Y-%m-%d %H:%M:%S'),
            'status': status,
            'title': title,
            'detail': detail or '',
        }
        steps = record.steps if isinstance(record.steps, list) else []
        record.steps = [*steps, step]
        record.save(update_fields=['steps', 'updated_at'])

    def _append_agent_context_steps(self, record, task):
        agent = task.agent
        if not agent:
            return {'tools': [], 'tool_map': {}}

        tool_context = {'tools': [], 'tool_map': {}}

        if isinstance(agent.mcp_servers, list) and agent.mcp_servers:
            mcp_servers = list(MCPServer.objects.filter(id__in=agent.mcp_servers))
            if mcp_servers:
                details = []
                for server in mcp_servers:
                    if not server.enabled:
                        detail = f"{server.name} 已停用"
                        self._append_run_step(record, 'failed', 'MCP 执行失败', detail)
                        raise RuntimeError(detail)
                    self._append_run_step(record, 'running', '检查 MCP 连接', f"{server.name}：正在同步 Tool")
                    tools, error_msg = fetch_mcp_tools(server)
                    if error_msg:
                        detail = f"{server.name}：{error_msg}"
                        self._append_run_step(record, 'failed', 'MCP 执行失败', detail)
                        raise RuntimeError(detail)
                    if not tools:
                        detail = f"{server.name}：未发现可用 Tool"
                        self._append_run_step(record, 'failed', 'MCP 执行失败', detail)
                        raise RuntimeError(detail)
                    server.tools = self._merge_enabled_tools(tools, server.tools)
                    server.save(update_fields=['tools', 'updated_at'])
                    enabled_tools = [
                        tool.get('name')
                        for tool in (server.tools or [])
                        if isinstance(tool, dict) and tool.get('enabled', True)
                    ]
                    tool_text = f"（{', '.join(enabled_tools)}）" if enabled_tools else ''
                    details.append(f"{server.name}{tool_text}")
                    for tool in (server.tools or []):
                        if not isinstance(tool, dict) or not tool.get('enabled', True):
                            continue
                        original_name = tool.get('name')
                        safe_name = self._build_safe_tool_name(server, original_name, tool_context['tool_map'])
                        tool_context['tool_map'][safe_name] = {
                            'server': server,
                            'tool_name': original_name,
                        }
                        parameters = tool.get('inputSchema') or {'type': 'object', 'properties': {}}
                        if not isinstance(parameters, dict) or parameters.get('type') not in ('object', None):
                            parameters = {'type': 'object', 'properties': {}}
                        parameters.setdefault('type', 'object')
                        parameters.setdefault('properties', {})
                        tool_context['tools'].append({
                            'type': 'function',
                            'function': {
                                'name': safe_name,
                                'description': f"{server.name} / {original_name}: {tool.get('description') or ''}",
                                'parameters': parameters,
                            }
                        })
                self._append_run_step(record, 'info', '装载 MCP', '；'.join(details))
            else:
                self._append_run_step(record, 'info', '装载 MCP', 'Agent 已绑定 MCP，但未找到对应配置')
        else:
            self._append_run_step(record, 'info', '装载 MCP', '未绑定 MCP')

        skill_prompts = self._get_skill_prompts(agent)
        if skill_prompts:
            self._append_run_step(record, 'info', '装载技能', f"已装载 {len(skill_prompts)} 个技能")
        else:
            self._append_run_step(record, 'info', '装载技能', '未绑定可用技能')

        return tool_context

    @staticmethod
    def _build_safe_tool_name(server, tool_name, existing_map):
        base = re.sub(r'[^a-zA-Z0-9_]', '_', str(tool_name or 'tool')).strip('_') or 'tool'
        if base not in existing_map:
            return base[:64]
        prefix = re.sub(r'[^a-zA-Z0-9_]', '_', str(server.id or server.name)).strip('_') or 'mcp'
        return f"{prefix}_{base}"[:64]

    def _execute_mcp_tool(self, tool_context, safe_tool_name, arguments):
        entry = tool_context['tool_map'].get(safe_tool_name)
        if not entry:
            raise RuntimeError(f"未知 MCP Tool：{safe_tool_name}")
        result, error_msg = call_mcp_tool(entry['server'], entry['tool_name'], arguments)
        if error_msg:
            raise RuntimeError(f"{entry['server'].name}.{entry['tool_name']} 调用失败：{error_msg}")
        return result

    @staticmethod
    def _merge_enabled_tools(new_tools, existing_tools):
        existing = {tool.get('name'): tool for tool in (existing_tools or []) if isinstance(tool, dict) and tool.get('name')}
        merged_tools = []
        for tool in new_tools:
            name = tool.get('name')
            if name in existing:
                merged_tools.append({
                    **tool,
                    'enabled': existing[name].get('enabled', True),
                })
            else:
                merged_tools.append(tool)
        return merged_tools

    def _build_prompt(self, task, has_mcp_tools=False):
        agent = task.agent
        now = _local_now()
        today = now.strftime('%Y-%m-%d')
        current_time = now.strftime('%Y-%m-%d %H:%M:%S')
        parts = []
        if agent and agent.prompt:
            parts.append(f"当前 Agent：{agent.name}\n{agent.prompt}")
        else:
            parts.append(CHAT_SYSTEM_PROMPT)

        skill_prompts = self._get_skill_prompts(agent)
        if skill_prompts:
            parts.append("你已装载以下 O-Doc 系统技能。请按技能边界使用它们：\n" + "\n\n".join(skill_prompts))

        parts.append(
            "你正在执行一个定时 Agent 任务。请直接输出最终内容，不要描述执行过程。\n"
            + f"当前日期：{today}\n"
            + f"当前时间：{current_time}\n"
            + "如果任务里出现“今天”“今日”“最新”等相对时间，必须按上述当前日期理解，不要使用其他年份。\n"
            + "如果需要指定保存后的文章标题，请把标题作为输出第一行的一级 Markdown 标题，例如：# 标题。\n"
            + ("当前 Agent 绑定了 MCP Tools。凡是任务需要外部实时信息、搜索、读取链接或操作外部系统时，必须先调用合适的 Tool；如果 Tool 调用失败，不要编造结果。\n" if has_mcp_tools else "")
            + f"任务名称：{task.name}\n"
            + f"任务提示词：{task.prompt or '请根据 Agent 职责完成本次任务。'}"
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
            return {
                'summary': '已输出到 Memos',
                'title': task.name,
                'step_title': '输出到 Memos',
            }

        if not task.target_collection_id:
            raise ValueError('任务未配置输出文集')

        title, article_content = self._extract_article_title(task, content)
        article = Article.objects.create(
            title=title,
            content=article_content,
            coll_id=task.target_collection_id,
            author='admin',
            permission='public',
        )
        anthology = Anthology.objects.filter(coll_id=task.target_collection_id).first()
        if anthology:
            anthology.update_stats()
        return {
            'summary': f"已输出到文集：{task.target_collection_title or task.target_collection_id} / {article.title}",
            'title': article.title,
            'step_title': '输出文章',
        }

    def _send_task_notification(self, task, output_title, record=None):
        if not task.notify_enabled or not task.notify_webhook_url:
            if record:
                self._append_run_step(record, 'info', '跳过通知', '任务未启用通知')
            return

        if task.notify_platform != 'feishu':
            logger.warning('Unsupported task notification platform: %s', task.notify_platform)
            if record:
                self._append_run_step(record, 'failed', '通知失败', f"暂不支持通知平台：{task.notify_platform}")
            return

        text = f"{task.name} 任务执行完毕，执行内容为 {output_title}"
        try:
            if record:
                self._append_run_step(record, 'running', '发送飞书通知', text)
            self._send_feishu_message(task.notify_webhook_url, text)
            if record:
                self._append_run_step(record, 'success', '飞书通知已发送', text)
            _scheduler_log(f"notification sent: id={task.id}, platform=feishu")
        except Exception:
            if record:
                self._append_run_step(record, 'failed', '飞书通知发送失败', '请检查 Webhook 地址和飞书机器人配置')
            _scheduler_log(f"notification failed: id={task.id}, platform=feishu")
            logger.exception('Agent task notification failed: %s', task.id)

    @staticmethod
    def _send_feishu_message(webhook_url, text):
        payload = json.dumps({
            'msg_type': 'text',
            'content': {
                'text': text,
            },
        }).encode('utf-8')
        request = urllib.request.Request(
            webhook_url,
            data=payload,
            headers={'Content-Type': 'application/json; charset=utf-8'},
            method='POST',
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status >= 400:
                raise urllib.error.HTTPError(
                    webhook_url,
                    response.status,
                    f'Feishu webhook returned HTTP {response.status}',
                    response.headers,
                    None,
                )

    @staticmethod
    def _build_article_title(task):
        timestamp = _local_now().strftime('%Y-%m-%d %H:%M:%S')
        return f"{task.name} {timestamp}"[:255]

    def _extract_article_title(self, task, content):
        text = content or ''
        match = re.match(r'^\s*#\s+(.+?)\s*(?:\n+|$)', text)
        if not match:
            return self._build_article_title(task), text

        title = match.group(1).strip().strip('#').strip()
        if not title:
            return self._build_article_title(task), text

        article_content = text[match.end():].lstrip()
        return title[:255], article_content

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
