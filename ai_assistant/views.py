import json
import requests
from django.http import StreamingHttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

# 请确保这些模型和工具类的导入路径与您的项目结构一致
from system_settings.models import SystemSetting, AIModel
from utils.rag_client import RagClient


class ChatView(APIView):
    # 允许未登录用户访问（根据需求可改为 IsAuthenticated）
    permission_classes = [AllowAny]

    def post(self, request):
        # 获取请求数据
        data = request.data
        message = data.get('message', '')
        history = data.get('history', [])
        # 兼容前端传递的驼峰或下划线参数
        use_kb = data.get('use_knowledge_base', False) or data.get('useKb', False)

        # 1. 获取系统默认模型配置
        try:
            config_obj = SystemSetting.objects.get(key='system_ai_config')
            config = config_obj.value
            # 优先获取配置的模型ID
            model_id = config.get('default_chat_model_id') or config.get('defaultChatModelId')
        except SystemSetting.DoesNotExist:
            return Response({'error': '系统未配置默认对话模型'}, status=400)

        if not model_id:
            return Response({'error': '未选择默认对话模型(model_id为空)'}, status=400)

        # 2. 查找模型对应的 Provider 信息
        try:
            ai_model = AIModel.objects.get(id=model_id)
            provider = ai_model.provider
        except AIModel.DoesNotExist:
            return Response({'error': f'配置的模型不存在 (ID: {model_id})'}, status=400)

        # 3. 准备 System Prompt 和 来源数据容器
        system_prompt = "你是“小橘文档”知识库助手。请用专业、简洁的语言回答用户问题。"
        sources_markdown = ""  # 用于存储引用来源的 Markdown 文本

        # 如果开启知识库且有用户消息
        if use_kb and message:
            try:
                # [核心逻辑] 获取检索结果 + 来源元数据
                # 注意：必须确保 utils/rag_client.py 中已实现了 search_with_sources 方法
                retrieved_docs, sources = RagClient.search_with_sources(message, n_results=4)

                if retrieved_docs:
                    context_str = "\n\n".join(retrieved_docs)
                    system_prompt += f"\n\n请严格基于以下[参考资料]回答用户的问题。如果参考资料不足以回答，请说明。\n\n[参考资料]:\n{context_str}\n"

                    # 构建 Markdown 格式的引用列表
                    if sources:
                        sources_markdown = "\n\n---\n**引用来源:**\n"
                        seen_ids = set()
                        for src in sources:
                            aid = src.get('id')
                            title = src.get('title', '未命名文档')

                            # 简单的去重逻辑
                            if aid and aid not in seen_ids:
                                # 格式：- [文章标题](/article/文章ID)
                                # 前端需支持 Markdown 链接点击跳转
                                sources_markdown += f"- [{title}](/article/{aid})\n"
                                seen_ids.add(aid)
                else:
                    system_prompt += "\n(知识库中未检索到相关内容，将基于通用知识回答)"
            except Exception as e:
                print(f"RAG Search Error: {e}")
                # 即使 RAG 失败，也不应该阻断对话，而是降级为普通对话
                system_prompt += "\n(知识库检索服务暂时不可用，正基于通用知识回答)"

        # 4. 构建发送给 LLM 的消息列表
        # 确保 history 格式正确，这里假设前端已经处理好格式
        messages = [{'role': 'system', 'content': system_prompt}] + history + [{'role': 'user', 'content': message}]

        # 5. 准备请求头和 URL
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json"
        }

        # URL 处理优化：移除末尾斜杠，并确保兼容性
        base_url = provider.base_url.rstrip('/')
        api_url = f"{base_url}/chat/completions"

        payload = {
            "model": ai_model.name,
            "messages": messages,
            "stream": True,
            # 可选：防止模型废话过多
            # "temperature": 0.5,
        }

        # 6. 定义流式生成器
        def event_stream():
            try:
                response = requests.post(api_url, headers=headers, json=payload, stream=True, timeout=60)

                if response.status_code != 200:
                    error_msg = f"Error: Upstream API {response.status_code} - {response.text}"
                    print(error_msg)
                    yield error_msg
                    return

                for line in response.iter_lines():
                    if line:
                        line = line.decode('utf-8')
                        if line.startswith('data: '):
                            json_str = line[6:]

                            # 结束标志
                            if json_str.strip() == '[DONE]':
                                break

                            try:
                                data = json.loads(json_str)
                                # 兼容不同厂商的响应结构，通常在 choices[0].delta.content
                                choices = data.get('choices', [])
                                if choices:
                                    delta = choices[0].get('delta', {})
                                    content = delta.get('content', '')
                                    if content:
                                        yield content
                            except json.JSONDecodeError:
                                pass
                            except Exception as e:
                                print(f"Stream Parse Error: {e}")
                                pass

                # [关键步骤] AI 回答结束后，追加来源信息
                if sources_markdown:
                    yield sources_markdown

            except Exception as e:
                print(f"Chat API Request Error: {e}")
                yield f"Error: {str(e)}"

        return StreamingHttpResponse(event_stream(), content_type='text/event-stream')