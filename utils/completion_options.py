"""Shared model policy for bounded completions, retaining legacy default behavior."""
from .thinking import thinking_body


def thinking_options(config: dict) -> dict:
    return thinking_body(config, default_mode='disabled')


def temperature_options(config: dict, body: dict, temperature: float) -> dict:
    """OpenAI 开启 reasoning_effort 时省略不兼容的采样参数。"""
    if config.get('provider_type') == 'OpenAi' and body.get('reasoning_effort') not in (None, 'none'):
        return {}
    return {'temperature': temperature}
