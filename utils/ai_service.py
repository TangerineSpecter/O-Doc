# utils/ai_service.py
import logging
import re

from openai import OpenAI

from system_settings.models import SystemSetting, AIModel

logger = logging.getLogger(__name__)

THINK_BLOCK_RE = re.compile(r'<think(?:ing)?>.*?</think(?:ing)?>', re.IGNORECASE | re.DOTALL)


class AIService:
    @staticmethod
    def _get_config_value(config, camel_key, snake_key=None):
        return config.get(camel_key) or config.get(snake_key or '')

    @staticmethod
    def _normalize_base_url(base_url):
        base_url = base_url.strip().rstrip('/')

        # 1. 如果用户误填了完整路径 /chat/completions，先去掉它
        if base_url.endswith('/chat/completions'):
            base_url = base_url.replace('/chat/completions', '')
            base_url = base_url.rstrip('/')

        # 2. 关键修复：如果 URL 不以 /v1 (或 /v1beta) 结尾，自动补全 /v1
        # 这一步是为了模拟 Cherry Studio 的行为，解决 405 错误
        if not base_url.endswith('/v1') and not base_url.endswith('/v1beta'):
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
            if use_simple_model:
                model_id = AIService._get_config_value(config, 'simpleChatModelId', 'simple_chat_model_id')
                if not model_id:
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
                "provider_type": provider.type
            }
        except Exception as e:
            logger.error(f"Failed to load AI config: {e}")
            raise e

    @classmethod
    def chat_completion(cls, prompt, use_simple_model=False):
        """执行 AI 对话"""
        try:
            config = cls.get_default_client_config(use_simple_model=use_simple_model)

            client = OpenAI(
                api_key=config['api_key'],
                base_url=config['base_url']
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

            return cls.strip_thinking(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"AI API Call Error: {e}")
            raise e

    @staticmethod
    def strip_thinking(content):
        """移除模型返回中的 <think> 思考块，仅保留可展示答案。"""
        if not content:
            return content

        return THINK_BLOCK_RE.sub('', content).strip()

    @classmethod
    def stream_chat_completion(cls, messages, include_thinking=False, use_simple_model=False):
        """流式对话 (用于前端 Chat 界面)"""
        try:
            config = cls.get_default_client_config(use_simple_model=use_simple_model)
            client = OpenAI(api_key=config['api_key'], base_url=config['base_url'])

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

        except Exception as e:
            logger.error(f"AI Stream Error: {e}")
            raise e

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
