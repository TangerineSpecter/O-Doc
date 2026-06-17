# ai_assistant/views.py
import logging
import json
import re
import queue
import threading

from django.http import StreamingHttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_assistant.prompts import (
    CHAT_SYSTEM_PROMPT,
    RAG_CONTEXT_TEMPLATE,
    RAG_EMPTY_MESSAGE,
    RAG_ERROR_MESSAGE
)
from system_settings.models import Agent, MCPServer, Skill
from utils.ai_service import AIService
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools
from utils.rag_client import RagClient

logger = logging.getLogger(__name__)


class ChatView(APIView):
    # 允许未登录用户访问
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            # 1. 获取请求数据
            data = request.data
            message = data.get('message', '')
            history = data.get('history', [])
            use_kb = data.get('use_knowledge_base', False) or data.get('useKb', False)
            coll_id = data.get('coll_id') or data.get('collId')
            include_thinking = data.get('include_thinking', False) or data.get('thinkingMode', False)
            use_simple_model = data.get('use_simple_model', False) or data.get('useSimpleModel', False)
            selected_skills = data.get('skills') or data.get('skillIds') or []
            selected_agent_id = data.get('agent_id') or data.get('agentId')
            selected_mcp_servers = data.get('mcp_server_ids') or data.get('mcpServerIds') or []
            if not isinstance(selected_mcp_servers, list):
                selected_mcp_servers = []
            if use_simple_model:
                include_thinking = False

            # 2. 准备 Prompt 和 上下文
            system_prompt = ""
            sources_markdown = ""

            skill_ids = []
            if selected_agent_id:
                try:
                    agent = Agent.objects.get(id=selected_agent_id)
                    if agent.prompt:
                        system_prompt = agent.prompt
                    else:
                        system_prompt = CHAT_SYSTEM_PROMPT
                    if isinstance(agent.skills, list):
                        skill_ids.extend(agent.skills)
                    if isinstance(agent.mcp_servers, list):
                        selected_mcp_servers = [*agent.mcp_servers, *selected_mcp_servers]
                except Agent.DoesNotExist:
                    logger.warning("ChatView received unknown agent_id: %s", selected_agent_id)
                    system_prompt = CHAT_SYSTEM_PROMPT
            else:
                system_prompt = CHAT_SYSTEM_PROMPT

            if isinstance(selected_skills, list):
                skill_ids.extend(selected_skills)

            skill_ids = list(dict.fromkeys(skill_ids))
            if skill_ids:
                skills = list(Skill.objects.filter(
                    id__in=skill_ids,
                    enabled=True,
                    available_in_chat=True,
                ))
                skill_prompts = []
                for skill in skills:
                    if skill.prompt:
                        skill_prompts.append(f"### {skill.name}\n{skill.prompt}")

                if skill_prompts:
                    system_prompt += "\n\n你已装载以下 O-Doc 系统技能。请按技能边界使用它们：\n" + "\n\n".join(skill_prompts)

            # 3. 处理 RAG (检索增强生成)
            if use_kb and message:
                try:
                    # 获取检索结果 + 来源元数据
                    retrieved_docs, sources = RagClient.search_with_sources(message, n_results=4, coll_id=coll_id)

                    if retrieved_docs:
                        # 注入上下文
                        context_str = "\n\n".join(retrieved_docs)
                        system_prompt += RAG_CONTEXT_TEMPLATE.format(context=context_str)

                        # 构建引用来源 (仅当有结果时)
                        if sources:
                            sources_markdown = self._build_sources_markdown(sources)
                    else:
                        system_prompt += RAG_EMPTY_MESSAGE

                except Exception as e:
                    logger.error(f"RAG Search Error: {e}", exc_info=True)
                    system_prompt += RAG_ERROR_MESSAGE

            # 4. 构建完整消息链
            # 格式：[System, ...History, User]
            full_messages = [{'role': 'system', 'content': system_prompt}] + history + [
                {'role': 'user', 'content': message}]

            tool_context = self._build_mcp_tool_context(selected_mcp_servers)
            if tool_context['tools']:
                tool_prompt = (
                    system_prompt
                    + "\n\n当前对话已装载 MCP Tools。凡是用户请求需要外部信息、检索、读取链接、操作系统或调用工具时，必须优先调用合适的 Tool；"
                    + "如果缺少必要参数，请先向用户追问，不要编造参数。"
                    + f"\n\n用户消息：{message}"
                )
                return StreamingHttpResponse(
                    self._stream_tool_response_generator(tool_prompt, tool_context, include_thinking, use_simple_model),
                    content_type='text/event-stream'
                )

            # 5. 调用 AI 服务并返回流式响应
            return StreamingHttpResponse(
                self._stream_response_generator(full_messages, sources_markdown, include_thinking, use_simple_model),
                content_type='text/event-stream'
            )

        except ValueError as e:
            # 捕获配置错误 (如未配置模型)
            return Response({'error': str(e)}, status=400)
        except Exception as e:
            logger.error(f"ChatView System Error: {e}", exc_info=True)
            return Response({'error': "Internal Server Error"}, status=500)

    @staticmethod
    def _build_sources_markdown(sources):
        """构建引用来源的 Markdown 字符串"""
        markdown = "\n\n---\n**引用来源:**\n"
        seen_ids = set()

        for src in sources:
            aid = src.get('id')
            title = src.get('title', '未命名文档')
            coll_id = src.get('coll_id')

            if aid and aid not in seen_ids:
                href = f"/article/{coll_id}/{aid}" if coll_id else f"/article/{aid}"
                markdown += f"- [{title}]({href})\n"
                seen_ids.add(aid)

        return markdown

    @classmethod
    def _build_mcp_tool_context(cls, server_ids):
        if not isinstance(server_ids, list):
            return {'tools': [], 'tool_map': {}}

        normalized_ids = list(dict.fromkeys([
            str(server_id).strip()
            for server_id in server_ids
            if str(server_id or '').strip()
        ]))
        if not normalized_ids:
            return {'tools': [], 'tool_map': {}}

        tool_context = {'tools': [], 'tool_map': {}}
        servers = list(MCPServer.objects.filter(id__in=normalized_ids, enabled=True, available_in_chat=True))

        for server in servers:
            tools, error_msg = fetch_mcp_tools(server)
            if error_msg:
                logger.warning("ChatView MCP sync failed for %s: %s", server.name, error_msg)
                continue
            if tools:
                server.tools = cls._merge_enabled_tools(tools, server.tools)
                server.save(update_fields=['tools', 'updated_at'])

            for tool in (server.tools or []):
                if not isinstance(tool, dict) or not tool.get('enabled', True):
                    continue
                original_name = tool.get('name')
                safe_name = cls._build_safe_tool_name(server, original_name, tool_context['tool_map'])
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

        return tool_context

    @staticmethod
    def _build_safe_tool_name(server, tool_name, existing_map):
        base = re.sub(r'[^a-zA-Z0-9_]', '_', str(tool_name or 'tool')).strip('_') or 'tool'
        if base not in existing_map:
            return base[:64]
        prefix = re.sub(r'[^a-zA-Z0-9_]', '_', str(server.id or server.name)).strip('_') or 'mcp'
        return f"{prefix}_{base}"[:64]

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
    def _execute_mcp_tool(tool_context, safe_tool_name, arguments):
        entry = tool_context['tool_map'].get(safe_tool_name)
        if not entry:
            raise RuntimeError(f"未知 MCP Tool：{safe_tool_name}")
        result, error_msg = call_mcp_tool(entry['server'], entry['tool_name'], arguments)
        if error_msg:
            raise RuntimeError(f"{entry['server'].name}.{entry['tool_name']} 调用失败：{error_msg}")
        return result

    @staticmethod
    def _stream_response_generator(messages, sources_markdown, include_thinking=False, use_simple_model=False):
        """生成器：负责流式输出 AI 内容，并在最后追加来源信息"""
        try:
            # 获取来自 AI Service 的流生成器
            ai_stream = AIService.stream_chat_completion(
                messages,
                include_thinking=include_thinking,
                use_simple_model=use_simple_model
            )

            for event in ai_stream:
                if isinstance(event, dict):
                    yield json.dumps(event, ensure_ascii=False) + "\n"
                else:
                    yield json.dumps({'type': 'answer', 'content': event}, ensure_ascii=False) + "\n"

            # AI 回答结束后，追加来源信息
            if sources_markdown:
                yield json.dumps({'type': 'answer', 'content': sources_markdown}, ensure_ascii=False) + "\n"

        except Exception as e:
            logger.error(f"Stream Generation Error: {e}")
            yield json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False) + "\n"

    @classmethod
    def _stream_tool_response_generator(cls, prompt, tool_context, include_thinking=False, use_simple_model=False):
        event_queue = queue.Queue()
        done_marker = object()

        def describe_tool(safe_tool_name):
            entry = tool_context['tool_map'].get(safe_tool_name) or {}
            server = entry.get('server')
            return {
                'toolName': entry.get('tool_name') or safe_tool_name,
                'serverName': getattr(server, 'name', '') or 'MCP',
            }

        def run_tool_chat():
            try:
                if include_thinking:
                    event_queue.put({
                        'type': 'thinking',
                        'content': '已装载 MCP Tools，正在判断是否需要调用工具。\n'
                    })

                def execute_with_events(tool_name, arguments):
                    payload = describe_tool(tool_name)
                    event_queue.put({'type': 'mcp_tool_call', **payload})
                    result = cls._execute_mcp_tool(tool_context, tool_name, arguments)
                    event_queue.put({'type': 'mcp_tool_result', **payload})
                    return result

                content = AIService.chat_completion_with_tools(
                    prompt,
                    tool_context['tools'],
                    execute_with_events,
                    use_simple_model=use_simple_model,
                )
                event_queue.put({'type': 'answer', 'content': content})
            except Exception as e:
                logger.error(f"Tool Stream Generation Error: {e}")
                event_queue.put({'type': 'error', 'content': str(e)})
            finally:
                event_queue.put(done_marker)

        threading.Thread(target=run_tool_chat, daemon=True).start()

        while True:
            event = event_queue.get()
            if event is done_marker:
                break
            yield json.dumps(event, ensure_ascii=False) + "\n"
