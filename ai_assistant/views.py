# ai_assistant/views.py
import logging
import json

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
from utils.ai_service import AIService
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
            if use_simple_model:
                include_thinking = False

            # 2. 准备 Prompt 和 上下文
            system_prompt = CHAT_SYSTEM_PROMPT
            sources_markdown = ""

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
