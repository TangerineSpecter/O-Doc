"""Model policy takes precedence over call-site defaults; display is independent."""
from .thinking_capabilities import capability


def thinking_body(config: dict, *, default_mode='default', include_thinking=False) -> dict:
    configured = config.get('thinking_mode', 'default')
    mode = default_mode if configured == 'default' else configured
    controls = capability(config, probe_ollama=config.get('thinking_mode', 'default') != 'default')
    protocol = controls['protocol']
    body = {}
    if mode in ('enabled', 'disabled'):
        if protocol == 'enable_thinking':
            body['enable_thinking'] = mode == 'enabled'
        elif protocol in ('thinking', 'adaptive'):
            body['thinking'] = {'type': 'adaptive' if protocol == 'adaptive' and mode == 'enabled' else mode}
        elif protocol == 'reasoning_effort':
            body['reasoning_effort'] = controls['enabled_effort'] if mode == 'enabled' else 'none'
        elif configured != 'default':
            raise ValueError('该模型尚未配置可用的思考控制协议，请选择参数协议或使用默认模式')
    # MiniMax output formatting is separate from whether the model reasons.
    if include_thinking and config.get('provider_type') == 'MiniMax':
        body['reasoning_split'] = True
    return body
