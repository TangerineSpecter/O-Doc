import logging
import os
import socket
import threading
import json
import urllib.error
import urllib.request
from datetime import timedelta
from functools import lru_cache
from pathlib import Path
import re

from django.db import OperationalError, ProgrammingError, close_old_connections
from django.utils import timezone

from ai_assistant.prompts import CHAT_SYSTEM_PROMPT
from utils.ai_service import AIService
from utils.mcp_client import (
    call_mcp_tool,
    fetch_mcp_tools,
    hide_agent_identity_parameters,
)
from .models import Agent, AgentRunRecord, AgentTask, MCPServer, Skill
from .sync_scheduler import _env_flag, _is_server_process, get_scheduler_initial_delay_seconds

logger = logging.getLogger(__name__)

AGENT_POST_MARKDOWN_GUIDE_PATH = Path(__file__).resolve().parent.parent / 'docs' / 'config' / 'agent_post_markdown_guide.md'


@lru_cache(maxsize=1)
def _get_agent_post_markdown_guide():
    try:
        return AGENT_POST_MARKDOWN_GUIDE_PATH.read_text(encoding='utf-8').strip()
    except OSError:
        logger.warning('Agent post markdown guide missing: %s', AGENT_POST_MARKDOWN_GUIDE_PATH)
        return ''


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
        self._record_update_lock = threading.Lock()
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
        agents = self._get_task_agents(task)
        primary_agent = agents[0] if agents else None
        agent_runs = [
            {
                'agent': agent.id,
                'agentName': agent.name,
                'agentAvatar': agent.avatar,
                'status': 'running',
                'summary': '等待执行',
                'duration': '',
                'steps': [],
            }
            for agent in agents
        ]
        record = AgentRunRecord.objects.create(
            task=task,
            task_name=task.name,
            agent=primary_agent,
            agent_name=self._format_agent_names(agents),
            agent_runs=agent_runs,
            trigger=trigger,
            status='running',
            summary='任务开始执行',
            started_at=started,
            steps=[],
        )
        try:
            self._append_run_step(record, 'running', '开始执行任务', f"任务：{task.name}，触发方式：{trigger}")
            if not agents:
                raise RuntimeError('未配置 Agent')

            mode = task.execution_mode if task.execution_mode in ('parallel', 'serial') else 'parallel'
            self._append_run_step(
                record,
                'info',
                '装载 Agent',
                f"{self._format_agent_names(agents)} · {'并行执行' if mode == 'parallel' else '串行执行'}",
            )

            run_results = []
            if mode == 'serial':
                previous_content = ''
                for index, agent in enumerate(agents):
                    result = self._run_task_for_agent(record, task, agent, previous_content=previous_content)
                    run_results.append(result)
                    if result['status'] != 'success':
                        for skipped_agent in agents[index + 1:]:
                            skipped_summary = '前置 Agent 失败，未执行'
                            self._append_agent_run_step(record, skipped_agent.id, 'failed', '跳过执行', skipped_summary)
                            self._finish_agent_run(record, skipped_agent.id, 'failed', skipped_summary, '')
                            run_results.append({
                                'agent': skipped_agent.id,
                                'agentName': skipped_agent.name,
                                'agentAvatar': skipped_agent.avatar,
                                'status': 'failed',
                                'summary': skipped_summary,
                                'duration': '',
                                'content': '',
                            })
                        break
                    previous_content = result.get('content') or previous_content
            else:
                result_lock = threading.Lock()

                def runner(agent):
                    try:
                        close_old_connections()
                        result = self._run_task_for_agent(record, task, agent)
                    except Exception as exc:
                        result = {
                            'agent': agent.id,
                            'agentName': agent.name,
                            'agentAvatar': agent.avatar,
                            'status': 'failed',
                            'summary': str(exc)[:255],
                            'content': '',
                        }
                    with result_lock:
                        run_results.append(result)
                    close_old_connections()

                threads = [
                    threading.Thread(
                        target=runner,
                        args=(agent,),
                        name=f'agent-task-{task.id}-{agent.id}',
                        daemon=True,
                    )
                    for agent in agents
                ]
                for thread in threads:
                    thread.start()
                for thread in threads:
                    thread.join()

            failed_results = [result for result in run_results if result.get('status') != 'success']
            duration_seconds = max(0, int((timezone.now() - started).total_seconds()))
            record.status = 'failed' if failed_results else 'success'
            record.duration = self._format_duration(duration_seconds)
            record.summary = self._build_multi_agent_summary(run_results)
            record.save(update_fields=['status', 'duration', 'summary', 'updated_at'])
            if record.status == 'success':
                self._send_task_notification(task, record)
            self._append_run_step(
                record,
                record.status,
                '执行结束' if record.status == 'success' else '执行结束，有 Agent 失败',
                f"总耗时：{record.duration}",
            )
            _scheduler_log(f"task {record.status}: id={task.id}, name={task.name}")
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

    def _run_task_for_agent(self, record, task, agent, previous_content=''):
        agent_started = timezone.now()
        self._append_agent_run_step(record, agent.id, 'running', '开始执行', f"Agent：{agent.name}")
        try:
            self._append_agent_run_step(record, agent.id, 'info', '装载 Agent', f"Agent：{agent.name}")
            tool_context = self._append_agent_context_steps(record, task, agent=agent)
            self._append_agent_run_step(record, agent.id, 'running', '调用 AI 生成内容', '正在根据任务提示词生成最终内容')
            if tool_context['tools']:
                content = AIService.chat_completion_with_tools(
                    self._build_prompt(task, has_mcp_tools=True, agent=agent, previous_content=previous_content),
                    tool_context['tools'],
                    lambda tool_name, arguments: self._execute_mcp_tool(tool_context, tool_name, arguments),
                    on_tool_call=lambda tool_name, arguments: self._append_agent_run_step(
                        record,
                        agent.id,
                        'running',
                        '调用 MCP Tool',
                        f"{tool_name} 参数：{json.dumps(arguments, ensure_ascii=False)[:500]}",
                    )
                )
            else:
                content = AIService.chat_completion(
                    self._build_prompt(task, agent=agent, previous_content=previous_content)
                )
            self._append_agent_run_step(record, agent.id, 'success', 'AI 内容生成完成', f"生成内容长度：{len(content or '')} 字符")
            summary = self._build_completion_summary(content)
            duration = self._format_duration(max(0, int((timezone.now() - agent_started).total_seconds())))
            self._finish_agent_run(record, agent.id, 'success', summary, duration)
            self._append_agent_run_step(record, agent.id, 'success', '执行结束', f"耗时：{duration}")
            return {
                'agent': agent.id,
                'agentName': agent.name,
                'agentAvatar': agent.avatar,
                'status': 'success',
                'summary': summary,
                'duration': duration,
                'content': content or '',
            }
        except Exception as exc:
            summary = str(exc)[:255]
            duration = self._format_duration(max(0, int((timezone.now() - agent_started).total_seconds())))
            self._append_agent_run_step(record, agent.id, 'failed', '执行失败', str(exc)[:500])
            self._finish_agent_run(record, agent.id, 'failed', summary, duration)
            logger.exception('Agent task failed for agent %s: %s', agent.id, task.id)
            return {
                'agent': agent.id,
                'agentName': agent.name,
                'agentAvatar': agent.avatar,
                'status': 'failed',
                'summary': summary,
                'duration': duration,
                'content': '',
            }

    def _append_run_step(self, record, status, title, detail=''):
        step = {
            'time': _local_now().strftime('%Y-%m-%d %H:%M:%S'),
            'status': status,
            'title': title,
            'detail': detail or '',
        }
        with self._record_update_lock:
            steps = record.steps if isinstance(record.steps, list) else []
            record.steps = [*steps, step]
            record.save(update_fields=['steps', 'updated_at'])

    def _append_agent_run_step(self, record, agent_id, status, title, detail=''):
        step = {
            'time': _local_now().strftime('%Y-%m-%d %H:%M:%S'),
            'status': status,
            'title': title,
            'detail': detail or '',
        }
        with self._record_update_lock:
            agent_runs = record.agent_runs if isinstance(record.agent_runs, list) else []
            next_runs = []
            found = False
            for agent_run in agent_runs:
                if not isinstance(agent_run, dict) or agent_run.get('agent') != agent_id:
                    next_runs.append(agent_run)
                    continue
                found = True
                steps = agent_run.get('steps') if isinstance(agent_run.get('steps'), list) else []
                next_runs.append({
                    **agent_run,
                    'status': status if status in ('running', 'success', 'failed') else agent_run.get('status', 'running'),
                    'steps': [*steps, step],
                })
            if not found:
                next_runs.append({
                    'agent': agent_id,
                    'agentName': '',
                    'status': status if status in ('running', 'success', 'failed') else 'running',
                    'summary': '',
                    'duration': '',
                    'steps': [step],
                })
            record.agent_runs = next_runs
            record.save(update_fields=['agent_runs', 'updated_at'])

    def _finish_agent_run(self, record, agent_id, status, summary, duration):
        with self._record_update_lock:
            agent_runs = record.agent_runs if isinstance(record.agent_runs, list) else []
            record.agent_runs = [
                {
                    **agent_run,
                    'status': status,
                    'summary': summary,
                    'duration': duration,
                } if isinstance(agent_run, dict) and agent_run.get('agent') == agent_id else agent_run
                for agent_run in agent_runs
            ]
            record.save(update_fields=['agent_runs', 'updated_at'])

    def _append_agent_context_steps(self, record, task, agent=None):
        agent = agent or task.agent
        if not agent:
            return {'tools': [], 'tool_map': {}}

        tool_context = {'agent': agent, 'tools': [], 'tool_map': {}}

        if isinstance(agent.mcp_servers, list) and agent.mcp_servers:
            mcp_servers = list(MCPServer.objects.filter(id__in=agent.mcp_servers))
            if mcp_servers:
                details = []
                for server in mcp_servers:
                    if not server.enabled:
                        detail = f"{server.name} 已停用"
                        self._append_agent_run_step(record, agent.id, 'failed', 'MCP 执行失败', detail)
                        raise RuntimeError(detail)
                    self._append_agent_run_step(record, agent.id, 'running', '检查 MCP 连接', f"{server.name}：正在同步 Tool")
                    tools, error_msg = fetch_mcp_tools(server)
                    if error_msg:
                        detail = f"{server.name}：{error_msg}"
                        self._append_agent_run_step(record, agent.id, 'failed', 'MCP 执行失败', detail)
                        raise RuntimeError(detail)
                    if not tools:
                        detail = f"{server.name}：未发现可用 Tool"
                        self._append_agent_run_step(record, agent.id, 'failed', 'MCP 执行失败', detail)
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
                        parameters = hide_agent_identity_parameters(parameters, original_name)
                        tool_context['tools'].append({
                            'type': 'function',
                            'function': {
                                'name': safe_name,
                                'description': f"{server.name} / {original_name}: {tool.get('description') or ''}",
                                'parameters': parameters,
                            }
                        })
                self._append_agent_run_step(record, agent.id, 'info', '装载 MCP', '；'.join(details))
            else:
                self._append_agent_run_step(record, agent.id, 'info', '装载 MCP', 'Agent 已绑定 MCP，但未找到对应配置')
        else:
            self._append_agent_run_step(record, agent.id, 'info', '装载 MCP', '未绑定 MCP')

        skill_prompts = self._get_skill_prompts(agent)
        if skill_prompts:
            self._append_agent_run_step(record, agent.id, 'info', '装载技能', f"已装载 {len(skill_prompts)} 个技能")
        else:
            self._append_agent_run_step(record, agent.id, 'info', '装载技能', '未绑定可用技能')

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
        result, error_msg = call_mcp_tool(
            entry['server'],
            entry['tool_name'],
            arguments,
            agent=tool_context.get('agent'),
        )
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

    @staticmethod
    def _get_task_agents(task):
        agent_ids = task.agent_ids if isinstance(task.agent_ids, list) else []
        if not agent_ids and task.agent_id:
            agent_ids = [task.agent_id]
        if not agent_ids:
            return []

        agents = {agent.id: agent for agent in Agent.objects.filter(id__in=agent_ids)}
        return [agents[agent_id] for agent_id in agent_ids if agent_id in agents]

    @staticmethod
    def _format_agent_names(agents):
        names = [agent.name for agent in agents if agent]
        if not names:
            return ''
        if len(names) <= 3:
            return '、'.join(names)
        return f"{'、'.join(names[:3])} 等 {len(names)} 个 Agent"

    @staticmethod
    def _build_multi_agent_summary(results):
        if not results:
            return '任务未执行'
        parts = []
        for result in results:
            agent_name = result.get('agentName') or 'Agent'
            status_text = '成功' if result.get('status') == 'success' else '失败'
            summary = result.get('summary') or ''
            parts.append(f"{agent_name}：{status_text}，{summary}")
        return '；'.join(parts)[:255]

    def _build_prompt(self, task, has_mcp_tools=False, agent=None, previous_content=''):
        agent = agent or task.agent
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

        if previous_content:
            parts.append(
                "上一个 Agent 的执行结果如下。请把它作为上下文继续完成你的职责，不要重复无关过程：\n"
                + previous_content[:6000]
            )

        post_markdown_guide = _get_agent_post_markdown_guide()
        if post_markdown_guide:
            parts.append(post_markdown_guide)

        parts.append(
            "你正在执行一个定时 Agent 任务。请直接输出最终内容，不要描述执行过程。\n"
            + f"当前日期：{today}\n"
            + f"当前时间：{current_time}\n"
            + "如果任务里出现“今天”“今日”“最新”等相对时间，必须按上述当前日期理解，不要使用其他年份。\n"
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

    @staticmethod
    def _build_completion_summary(content):
        text = (content or '').strip()
        if not text:
            return '任务执行完成'
        return text[:255]

    def _send_task_notification(self, task, record=None):
        if not task.notify_enabled or not task.notify_webhook_url:
            if record:
                self._append_run_step(record, 'info', '跳过通知', '任务未启用通知')
            return

        if task.notify_platform != 'feishu':
            logger.warning('Unsupported task notification platform: %s', task.notify_platform)
            if record:
                self._append_run_step(record, 'failed', '通知失败', f"暂不支持通知平台：{task.notify_platform}")
            return

        text = f"{task.name} 任务执行完毕"
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
