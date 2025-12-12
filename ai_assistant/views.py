import json

import requests
from django.http import StreamingHttpResponse
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from system_settings.models import SystemSetting, AIModel  # 确保导入正确


class ChatView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        # DRF 的 CamelCaseJSONParser 会自动将前端的驼峰参数转为下划线
        # 例如: useKnowledgeBase -> use_knowledge_base
        data = request.data

        message = data.get('message', '')
        history = data.get('history', [])
        # 修改点 1: 获取参数改为下划线
        use_kb = data.get('use_knowledge_base', False)

        # 1. 获取系统默认模型配置
        try:
            config_obj = SystemSetting.objects.get(key='system_ai_config')
            config = config_obj.value

            # 修改点 2: 从配置中获取 ID 改为下划线 (因为数据库存的是下划线)
            # 为了兼容性，我们可以优先取下划线，取不到再试驼峰
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

        # 3. 构建请求
        system_prompt = "你是“小橘文档”知识库助手。"
        if use_kb:
            # TODO: 这里后续接入 RAG 检索逻辑
            system_prompt += " (已开启知识库模式，但检索功能暂未连接)"

        # 构建 OpenAI 格式的消息列表
        messages = [{'role': 'system', 'content': system_prompt}] + history + [{'role': 'user', 'content': message}]

        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json"
        }

        # 处理不同厂商的 Base URL 结尾斜杠问题
        base_url = provider.base_url.rstrip('/')
        if not base_url.endswith('/v1'):
            # 有些厂商(如DeepSeek/OpenAI)如果不带v1可能会有问题，视具体配置而定
            # 这里保持原样，假设用户配置的 URL 是完整的或标准的
            pass

        payload = {
            "model": ai_model.name,
            "messages": messages,
            "stream": True,
            # 可以根据需要添加 temperature 等参数
            # "temperature": 0.7
        }

        # 4. 定义流式生成器
        def event_stream():
            try:
                # 拼接聊天接口路径，通常是 /chat/completions
                # 如果是 Ollama 等特殊接口，可能需要特殊处理，这里默认兼容 OpenAI 格式
                api_url = f"{base_url}/chat/completions"

                response = requests.post(
                    api_url,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=60
                )

                if response.status_code != 200:
                    yield f"Error: Upstream API {response.status_code} - {response.text}"
                    return

                for line in response.iter_lines():
                    if line:
                        line = line.decode('utf-8')
                        if line.startswith('data: '):
                            json_str = line[6:]
                            if json_str.strip() == '[DONE]':
                                break
                            try:
                                data = json.loads(json_str)
                                # 兼容不同厂商的返回结构，大部分是 choices[0].delta.content
                                delta = data['choices'][0].get('delta', {})
                                content = delta.get('content', '')
                                if content:
                                    yield content
                            except Exception as e:
                                print(f"Parse error: {e}, Line: {line}")
                                pass
            except Exception as e:
                yield f"Error: {str(e)}"

        return StreamingHttpResponse(event_stream(), content_type='text/event-stream')
