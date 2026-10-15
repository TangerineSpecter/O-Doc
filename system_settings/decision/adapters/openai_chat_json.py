"""OpenAI Chat Completions envelope carrying a serialized typed decision request."""
import json


class OpenAIChatJsonAdapter:
    protocol = 'openai_chat_json'

    @staticmethod
    def endpoint(base_url: str) -> str:
        value = base_url.rstrip('/')
        if value.endswith('/chat/completions'):
            return value
        return value + '/chat/completions'

    @staticmethod
    def build_payload(model_id: str, state: dict, question_id: str, question: dict) -> dict:
        decision = {'state': state, 'questions': {question_id: question}}
        content = json.dumps(decision, ensure_ascii=False, separators=(',', ':'))
        return {'model': model_id, 'messages': [{'role': 'user', 'content': content}]}

    @staticmethod
    def extract_answer(data: dict, question_id: str) -> dict:
        choices = data.get('choices')
        if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
            return None
        message = choices[0].get('message')
        content = message.get('content') if isinstance(message, dict) else None
        if not isinstance(content, str):
            return None
        text = content.strip()
        if text.startswith('```'):
            text = text.removeprefix('```json').removeprefix('```').removesuffix('```').strip()
        try:
            result = json.loads(text)
        except (TypeError, ValueError):
            return None
        return result.get(question_id) if isinstance(result, dict) else None

    @staticmethod
    def model_name(data: dict, configured_model: str) -> str:
        value = data.get('model')
        return value.strip() if isinstance(value, str) and value.strip() else configured_model

    @staticmethod
    def usage(data: dict) -> dict | None:
        value = data.get('usage')
        return value if isinstance(value, dict) else None

    @staticmethod
    def usage_fields() -> tuple[str, str, str]:
        return 'prompt_tokens', 'completion_tokens', 'total_tokens'
