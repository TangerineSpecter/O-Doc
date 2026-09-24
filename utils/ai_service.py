# utils/ai_service.py
import logging
import re
import json
import time
import uuid

from openai import AuthenticationError, OpenAI

from system_settings.models import SystemSetting, AIModel
from .ai_observer import emit_ai_event

logger = logging.getLogger(__name__)

THINK_BLOCK_RE = re.compile(r'<think(?:ing)?>.*?</think(?:ing)?>', re.IGNORECASE | re.DOTALL)
OPENAI_COMPATIBLE_VERSION_RE = re.compile(r'/(?:v\d+(?:beta)?)(?:/openai)?$', re.IGNORECASE)


class AIAuthenticationError(RuntimeError):
    """An AI provider rejected the configured API key.

    The original provider response can contain key fragments, so callers should
    use this safe exception for logs, task records, and user notifications.
    """

    def __init__(self, provider_id='', provider_name='', api_key='', *, model_name='', model_role=''):
        self.provider_id = provider_id
        self.provider_name = provider_name or '未知提供商'
        self.api_key = api_key or ''
        self.model_name = model_name
        self.model_role = model_role
        super().__init__(f'AI 提供商「{self.provider_name}」的 API Key 已失效或无权访问')


class AIService:
    @staticmethod
    def _get_config_value(config, camel_key, snake_key=None):
        return config.get(camel_key) or config.get(snake_key or '')

    @staticmethod
    def _normalize_base_url(base_url):
        base_url = base_url.strip().rstrip('/')

        # 1. 如果用户误填了完整路径 /chat/completions，先去掉它
        if base_url.endswith('/chat/completions'):
            base_url = base_url[:-len('/chat/completions')]
            base_url = base_url.rstrip('/')

        if not OPENAI_COMPATIBLE_VERSION_RE.search(base_url):
            base_url += '/v1'

        return base_url

    @staticmethod
    def _build_thinking_extra_body(provider_type, include_thinking, disable_thinking=False):
        extra_body = {}
        if include_thinking:
            extra_body["reasoning_split"] = True
            return extra_body

        if not disable_thinking:
            return extra_body

        # DashScope/Qwen OpenAI-compatible endpoints support this flag.
        if provider_type == 'Qwen':
            extra_body["enable_thinking"] = False

        return extra_body

    @staticmethod
    def get_default_client_config(use_simple_model=False):
        """获取系统默认的 AI 配置"""
        try:
            config_obj = SystemSetting.objects.get(key='system_ai_config')
            config = config_obj.value
            model_role = 'default'
            if use_simple_model:
                model_id = AIService._get_config_value(config, 'simpleChatModelId', 'simple_chat_model_id')
                if model_id:
                    model_role = 'simple'
                else:
                    model_id = AIService._get_config_value(config, 'defaultChatModelId', 'default_chat_model_id')
            else:
                model_id = AIService._get_config_value(config, 'defaultChatModelId', 'default_chat_model_id')

            if not model_id:
                raise ValueError("No default model configured")

            ai_model = AIModel.objects.get(id=model_id)
            provider = ai_model.provider

            return {
                "api_key": provider.api_key,
                "base_url": AIService._normalize_base_url(provider.base_url),
                "model_name": ai_model.name,
                "model_role": model_role,
                "provider_type": provider.type,
                "provider_id": provider.id,
                "provider_name": provider.name,
            }
        except Exception as e:
            if isinstance(e, ValueError) and str(e) == "No default model configured":
                raise
            logger.error(f"Failed to load AI config: {e}")
            raise e

    @staticmethod
    def get_client_config_for_model(model_id):
        """按模型 ID 获取 AI 客户端配置。"""
        try:
            if not model_id:
                return AIService.get_default_client_config()

            ai_model = AIModel.objects.get(id=model_id)
            provider = ai_model.provider

            return {
                "api_key": provider.api_key,
                "base_url": AIService._normalize_base_url(provider.base_url),
                "model_name": ai_model.name,
                "provider_type": provider.type,
                "provider_id": provider.id,
                "provider_name": provider.name,
            }
        except Exception as e:
            logger.error(f"Failed to load AI model config: {e}")
            raise e

    @staticmethod
    def get_default_image_client_config():
        """获取系统默认的图像识别模型配置"""
        try:
            config_obj = SystemSetting.objects.get(key='system_ai_config')
            config = config_obj.value
            model_id = AIService._get_config_value(config, 'defaultImageModelId', 'default_image_model_id')

            if not model_id:
                raise ValueError("No default image model configured")

            ai_model = AIModel.objects.get(id=model_id)
            provider = ai_model.provider

            return {
                "api_key": provider.api_key,
                "base_url": AIService._normalize_base_url(provider.base_url),
                "model_name": ai_model.name,
                "provider_type": provider.type,
                "provider_id": provider.id,
                "provider_name": provider.name,
            }
        except Exception as e:
            logger.error(f"Failed to load image AI config: {e}")
            raise e

    @classmethod
    def chat_completion(cls, prompt, use_simple_model=False, *, bounded=False, json_output=False, max_tokens=4096):
        """执行 AI 对话"""
        if bounded:
            from .bounded_completion import complete
            from .completion_options import thinking_options
            config = cls.get_default_client_config(use_simple_model=use_simple_model)
            try:
                content = complete(config, prompt, json_output=json_output, max_tokens=max_tokens, extra_body=thinking_options(config))
                return cls.strip_thinking(content)
            except AuthenticationError as exc:
                cls._raise_authentication_error(exc, config)
        started = time.monotonic()
        request_id = uuid.uuid4().hex
        metadata = {'request_id': request_id}
        try:
            config = cls.get_default_client_config(use_simple_model=use_simple_model)
            metadata.update({key: config.get(key, '') for key in ('provider_name', 'model_name', 'model_role')})
            emit_ai_event('model_request_started', '正在请求模型，等待返回', **metadata, timeout_seconds=120, sdk_retries=1)

            client = OpenAI(
                api_key=config['api_key'],
                base_url=config['base_url'],
                timeout=120.0,
                max_retries=1,
            )

            response = client.chat.completions.create(
                model=config['model_name'],
                messages=[{"role": "user", "content": prompt}],
                stream=False,
                extra_body=cls._build_thinking_extra_body(
                    config.get('provider_type'),
                    include_thinking=False,
                    disable_thinking=use_simple_model
                ) or None,
            ) # type: ignore

            choice = response.choices[0]
            content = cls.strip_thinking(choice.message.content)
            finish = choice.finish_reason if isinstance(choice.finish_reason, str) else ''
            emit_ai_event('model_response', '模型已返回，准备检查输出', **metadata, chars=len(content), finish_reason=finish, duration_ms=(time.monotonic() - started) * 1000)
            if finish == 'length':
                emit_ai_event('output_truncated', '模型输出达到长度限制，可能未完整返回', 'warning', **metadata, reason='输出可能被截断；本次结果仍需校验。')
            return content
        except AuthenticationError as exc:
            emit_ai_event('model_request_failed', '模型认证失败', 'error', **metadata, error_type='authentication', duration_ms=(time.monotonic() - started) * 1000)
            cls._raise_authentication_error(exc, config)
        except Exception as e:
            emit_ai_event('model_request_failed', '模型请求失败', 'error', **metadata, error_type=type(e).__name__, duration_ms=(time.monotonic() - started) * 1000)
            logger.error(f"AI API Call Error: {e}")
            raise e

    @classmethod
    def chat_completion_messages(cls, messages, model_id=None):
        """执行非流式多轮对话，可指定模型。"""
        try:
            config = cls.get_client_config_for_model(model_id)
            client = OpenAI(
                api_key=config['api_key'],
                base_url=config['base_url'],
                timeout=120.0,
                max_retries=1,
            )

            response = client.chat.completions.create(
                model=config['model_name'],
                messages=messages,
                stream=False,
                extra_body=cls._build_thinking_extra_body(
                    config.get('provider_type'),
                    include_thinking=False,
                    disable_thinking=False
                ) or None,
            ) # type: ignore

            return cls.strip_thinking(response.choices[0].message.content)
        except AuthenticationError as exc:
            cls._raise_authentication_error(exc, config)
        except Exception as e:
            logger.error(f"AI Messages API Call Error: {e}")
            raise e

    @classmethod
    def chat_completion_with_tools(cls, prompt, tools, tool_executor, on_tool_call=None, model_id=None, use_simple_model=False, max_rounds=5):
        """执行支持 OpenAI-compatible tool calls 的 AI 对话。"""
        return cls.chat_completion_messages_with_tools(
            [{"role": "user", "content": prompt}],
            tools,
            tool_executor,
            on_tool_call=on_tool_call,
            model_id=model_id,
            use_simple_model=use_simple_model,
            max_rounds=max_rounds,
        )

    @classmethod
    def chat_completion_messages_with_tools(
            cls,
            messages,
            tools,
            tool_executor,
            on_tool_call=None,
            model_id=None,
            use_simple_model=False,
            max_rounds=5,
            tool_choice=None,
    ):
        """执行支持 OpenAI-compatible tool calls 的多轮对话，可指定模型。"""
        try:
            config = (
                cls.get_client_config_for_model(model_id)
                if model_id
                else cls.get_default_client_config(use_simple_model=use_simple_model)
            )
            client = OpenAI(
                api_key=config['api_key'],
                base_url=config['base_url'],
                timeout=120.0,
                max_retries=1,
            )
            messages = [dict(message) for message in messages]

            for _ in range(max_rounds):
                request_kwargs = {
                    'model': config['model_name'],
                    'messages': messages,
                    'tools': tools,
                    'stream': False,
                    'extra_body': cls._build_thinking_extra_body(
                        config.get('provider_type'),
                        include_thinking=False,
                        disable_thinking=use_simple_model
                    ) or None,
                }
                if tool_choice:
                    request_kwargs['tool_choice'] = tool_choice
                response = client.chat.completions.create(**request_kwargs) # type: ignore

                message = response.choices[0].message
                tool_calls = getattr(message, 'tool_calls', None) or []
                if not tool_calls:
                    return cls.strip_thinking(message.content)

                assistant_message = {
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        tool_call.model_dump() if hasattr(tool_call, 'model_dump') else tool_call
                        for tool_call in tool_calls
                    ],
                }
                messages.append(assistant_message)

                for tool_call in tool_calls:
                    function = getattr(tool_call, 'function', None)
                    tool_name = getattr(function, 'name', '') if function else ''
                    raw_arguments = getattr(function, 'arguments', '{}') if function else '{}'
                    try:
                        arguments = json.loads(raw_arguments or '{}')
                    except json.JSONDecodeError:
                        arguments = {}

                    if on_tool_call:
                        on_tool_call(tool_name, arguments)

                    result = tool_executor(tool_name, arguments)
                    messages.append({
                        "role": "tool",
                        "tool_call_id": getattr(tool_call, 'id', ''),
                        "content": cls._stringify_tool_result(result),
                    })

            raise RuntimeError("AI Tool 调用轮次过多，已停止执行")
        except AuthenticationError as exc:
            cls._raise_authentication_error(exc, config)
        except Exception as e:
            logger.error(f"AI Tool Call Error: {e}")
            raise e

    @staticmethod
    def _stringify_tool_result(result):
        if isinstance(result, str):
            return result
        try:
            return json.dumps(result, ensure_ascii=False)
        except TypeError:
            return str(result)

    @classmethod
    def image_description(cls, image_data_url, title='', location=''):
        """基于图片和元信息生成图片描述。"""
        try:
            config = cls.get_default_image_client_config()
            client = OpenAI(
                api_key=config['api_key'],
                base_url=config['base_url'],
                timeout=55.0,
                max_retries=0,
            )

            prompt = f"""请根据图片内容，并结合用户提供的标题和地点，写一段适合图片文集使用的描述说明。
要求：
1. 只返回描述正文，不要添加“描述：”等前缀。
2. 语言自然，有画面感，但不要编造图片中看不到的事实。
3. 结合标题和地点信息；如果地点为空，不要强行提及地点。
4. 控制在 60 到 120 个中文字符之间。

图片标题：{title or '未填写'}
拍摄地点：{location or '未填写'}"""

            response = client.chat.completions.create(
                model=config['model_name'],
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_data_url}},
                    ],
                }],
                stream=False,
            )

            return cls.strip_thinking(response.choices[0].message.content)
        except AuthenticationError as exc:
            cls._raise_authentication_error(exc, config)
        except Exception as e:
            logger.error(f"AI Image Description Error: {e}")
            raise e

    @classmethod
    def image_visual_fingerprint(cls, image_data_url):
        """为图片检索提取客观画面特征，不覆盖图片介绍。"""
        config = cls.get_default_image_client_config()
        try:
            client = OpenAI(api_key=config['api_key'], base_url=config['base_url'], timeout=55.0, max_retries=0)
            response = client.chat.completions.create(
                model=config['model_name'],
                messages=[{'role': 'user', 'content': [
                    {'type': 'text', 'text': (
                        '请用简洁中文描述这张图可用于搜索的可见特征：主体外观、动作、场景、构图、画风、主色和情绪。'
                        '如有清晰可见的文字，逐字写出；看不清就省略。不要根据标题猜测，不要编造角色、作品或地点名称。'
                        '只输出描述正文，不要解释。'
                    )},
                    {'type': 'image_url', 'image_url': {'url': image_data_url}},
                ]}],
                stream=False,
            )
            description = cls.strip_thinking(response.choices[0].message.content or '').strip()
            if not description:
                raise ValueError('图像模型未返回可用于检索的描述')
            return description[:4000], config['model_name']
        except AuthenticationError as exc:
            cls._raise_authentication_error(exc, config)

    @staticmethod
    def _raise_authentication_error(exc, config):
        """Convert provider authentication responses to a safe application error."""
        provider_name = config.get('provider_name') or '未知提供商'
        logger.warning('AI provider authentication failed: provider=%s', provider_name)
        raise AIAuthenticationError(
            provider_id=config.get('provider_id', ''),
            provider_name=provider_name,
            api_key=config.get('api_key', ''),
            model_name=config.get('model_name', ''),
            model_role=config.get('model_role', ''),
        ) from exc

    @staticmethod
    def strip_thinking(content):
        """移除模型返回中的 <think> 思考块，仅保留可展示答案。"""
        if not content:
            return content

        return THINK_BLOCK_RE.sub('', content).strip()

    @classmethod
    def stream_chat_completion(cls, messages, include_thinking=False, use_simple_model=False):
        """流式对话 (用于前端 Chat 界面)"""
        stream = None
        client = None
        try:
            config = cls.get_default_client_config(use_simple_model=use_simple_model)
            client = OpenAI(api_key=config['api_key'], base_url=config['base_url'], timeout=120.0, max_retries=1)

            extra_body = cls._build_thinking_extra_body(
                config.get('provider_type'),
                include_thinking=include_thinking,
                disable_thinking=use_simple_model
            )

            stream = client.chat.completions.create(
                model=config['model_name'],
                messages=messages,
                stream=True,
                # temperature=0.5, # 可根据需要通过参数传入
                extra_body=extra_body or None,
            )

            previous_content = ''
            previous_thinking = ''
            strip_state = {'in_thinking': False, 'tag_buffer': ''}

            for chunk in stream:
                if not chunk.choices:
                    continue

                delta = chunk.choices[0].delta
                reasoning_delta = getattr(delta, 'reasoning_details', None) or getattr(delta, 'reasoning_content', None)
                if include_thinking and reasoning_delta:
                    thinking_delta, previous_thinking = cls._normalize_stream_delta(
                        previous_thinking,
                        cls._stringify_reasoning_delta(reasoning_delta)
                    )
                    if thinking_delta:
                        yield {
                            'type': 'thinking',
                            'content': thinking_delta
                        }
                    continue

                if delta.content:
                    content_delta, previous_content = cls._normalize_stream_delta(previous_content, delta.content)
                    if not content_delta:
                        continue

                    if not include_thinking:
                        yield from cls._split_thinking_stream_chunk(content_delta, strip_state, include_thinking=False)
                        continue

                    yield from cls._split_thinking_stream_chunk(content_delta, strip_state, include_thinking=True)

            if not include_thinking:
                visible_content = cls._flush_thinking_stream_state(strip_state)
                if visible_content:
                    yield {
                        'type': 'answer',
                        'content': visible_content
                    }
                return

            yield from cls._flush_split_thinking_stream_state(strip_state, include_thinking=True)

        except AuthenticationError as exc:
            cls._raise_authentication_error(exc, config)
        except Exception as e:
            logger.error(f"AI Stream Error: {e}")
            raise e
        finally:
            try:
                if stream is not None:
                    stream.close()
            finally:
                if client is not None:
                    client.close()

    @staticmethod
    def _normalize_stream_delta(previous_text, next_text):
        if not next_text:
            return '', previous_text

        # Some compatible endpoints stream cumulative text when extra fields are enabled.
        if previous_text and next_text.startswith(previous_text):
            return next_text[len(previous_text):], next_text

        return next_text, previous_text + next_text

    @staticmethod
    def _stringify_reasoning_delta(reasoning_delta):
        if isinstance(reasoning_delta, str):
            return reasoning_delta

        if isinstance(reasoning_delta, list):
            parts = []
            for item in reasoning_delta:
                if isinstance(item, dict):
                    parts.append(item.get('text') or item.get('thinking') or item.get('content') or '')
                else:
                    parts.append(str(item))
            return ''.join(parts)

        return str(reasoning_delta)

    @staticmethod
    def _split_thinking_from_content(content):
        thinking_parts = []

        def collect(match):
            thinking_parts.append(match.group(0))
            return ''

        answer = THINK_BLOCK_RE.sub(collect, content)
        thinking = '\n\n'.join(
            re.sub(r'</?think(?:ing)?>', '', part, flags=re.IGNORECASE).strip()
            for part in thinking_parts
        ).strip()

        return thinking, answer.strip()

    @staticmethod
    def _strip_thinking_stream_chunk(content, state):
        return ''.join(event['content'] for event in AIService._split_thinking_stream_chunk(
            content,
            state,
            include_thinking=False
        ) if event['type'] == 'answer')

    @staticmethod
    def _split_thinking_stream_chunk(content, state, include_thinking=False):
        events = []
        bucket_type = 'thinking' if state['in_thinking'] else 'answer'
        bucket = []

        def flush():
            nonlocal bucket, bucket_type
            if not bucket:
                return
            if bucket_type == 'answer' or include_thinking:
                events.append({'type': bucket_type, 'content': ''.join(bucket)})
            bucket = []

        def switch(next_type):
            nonlocal bucket_type
            flush()
            bucket_type = next_type

        for char in content:
            if state['tag_buffer'] or char == '<':
                state['tag_buffer'] += char

                if char != '>':
                    if len(state['tag_buffer']) > 32:
                        if not state['in_thinking']:
                            bucket.append(state['tag_buffer'])
                        state['tag_buffer'] = ''
                    continue

                tag = state['tag_buffer']
                state['tag_buffer'] = ''

                if re.fullmatch(r'<think(?:ing)?>', tag, flags=re.IGNORECASE):
                    state['in_thinking'] = True
                    switch('thinking')
                    continue

                if re.fullmatch(r'</think(?:ing)?>', tag, flags=re.IGNORECASE):
                    state['in_thinking'] = False
                    switch('answer')
                    continue

                if not state['in_thinking']:
                    bucket.append(tag)
                continue

            if state['in_thinking']:
                if include_thinking:
                    bucket.append(char)
            else:
                bucket.append(char)

        flush()
        return events

    @staticmethod
    def _flush_thinking_stream_state(state):
        if state['tag_buffer'] and not state['in_thinking']:
            tag_buffer = state['tag_buffer']
            state['tag_buffer'] = ''
            return tag_buffer

        state['tag_buffer'] = ''
        return ''

    @staticmethod
    def _flush_split_thinking_stream_state(state, include_thinking=False):
        if state['tag_buffer']:
            content = state['tag_buffer']
            state['tag_buffer'] = ''
            if not state['in_thinking']:
                yield {'type': 'answer', 'content': content}
            elif include_thinking:
                yield {'type': 'thinking', 'content': content}
