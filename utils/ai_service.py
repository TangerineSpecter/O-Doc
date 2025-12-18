# utils/ai_service.py
import logging

from openai import OpenAI

from system_settings.models import SystemSetting, AIModel

logger = logging.getLogger(__name__)


class AIService:
    @staticmethod
    def get_default_client_config():
        """获取系统默认的 AI 配置"""
        try:
            config_obj = SystemSetting.objects.get(key='system_ai_config')
            config = config_obj.value
            model_id = config.get('default_chat_model_id')

            if not model_id:
                raise ValueError("No default model configured")

            ai_model = AIModel.objects.get(id=model_id)
            provider = ai_model.provider

            return {
                "api_key": provider.api_key,
                "base_url": provider.base_url.rstrip('/'),
                "model_name": ai_model.name
            }
        except Exception as e:
            logger.error(f"Failed to load AI config: {e}")
            raise e

    @classmethod
    def chat_completion(cls, prompt):
        """执行 AI 对话"""
        try:
            config = cls.get_default_client_config()

            client = OpenAI(
                api_key=config['api_key'],
                base_url=config['base_url']
            )

            response = client.chat.completions.create(
                model=config['model_name'],
                messages=[{"role": "user", "content": prompt}],
                stream=False
            ) # type: ignore

            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"AI API Call Error: {e}")
            raise e

    @classmethod
    def stream_chat_completion(cls, messages):
        """流式对话 (用于前端 Chat 界面)"""
        try:
            config = cls.get_default_client_config()
            client = OpenAI(api_key=config['api_key'], base_url=config['base_url'])

            stream = client.chat.completions.create(
                model=config['model_name'],
                messages=messages,
                stream=True,
                # temperature=0.5, # 可根据需要通过参数传入
            )

            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except Exception as e:
            logger.error(f"AI Stream Error: {e}")
            raise e
