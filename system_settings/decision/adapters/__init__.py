"""Wire-protocol adapters for structured decision models."""
from .openai_chat_json import OpenAIChatJsonAdapter
from .systemone import SystemOneAdapter


ADAPTERS = {
    'systemone': SystemOneAdapter(),
    'openai_chat_json': OpenAIChatJsonAdapter(),
}


def get_adapter(protocol: str):
    try:
        return ADAPTERS[protocol]
    except KeyError:
        raise ValueError('不支持的决策协议') from None
