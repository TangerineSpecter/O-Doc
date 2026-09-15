"""Verified provider controls for bounded, non-tool book completions only."""
import re


def thinking_options(config: dict) -> dict:
    provider, model = config.get('provider_type'), config.get('model_name', '')
    if provider == 'Qwen':
        return {'enable_thinking': False}
    if provider == 'DeepSeek' or provider == 'MiniMax' and re.match(r'^minimax-m3(?:$|[-:])', model, re.IGNORECASE):
        # DeepSeek Chat Completions / MiniMax M3 OpenAI SDK official docs.
        # M2.x accepts this parameter but ignores it, so deliberately omit it.
        return {'thinking': {'type': 'disabled'}}
    return {}
