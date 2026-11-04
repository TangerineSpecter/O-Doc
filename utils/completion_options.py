"""Shared model policy for bounded completions, retaining legacy default behavior."""
from .thinking import thinking_body
from .thinking_capabilities import OPENAI_GPT6_MODELS


def thinking_options(config: dict) -> dict:
    return thinking_body(config, default_mode='disabled')


def temperature_options(config: dict, body: dict, temperature: float) -> dict:
    """OpenAI 开启 reasoning_effort 时省略不兼容的采样参数。"""
    if config.get('provider_type') == 'OpenAi':
        effort = body.get('reasoning_effort')
        if effort not in (None, 'none') or (effort is None and config.get('model_name', '').lower() in OPENAI_GPT6_MODELS):
            return {}
    return {'temperature': temperature}


def output_limit_options(config: dict, max_tokens: int | None) -> dict:
    """Use the native OpenAI token limit without changing relay-provider contracts."""
    if max_tokens is None:
        return {}
    key = 'max_completion_tokens' if config.get('provider_type') == 'OpenAi' else 'max_tokens'
    return {key: max_tokens}
