"""Model policy takes precedence over call-site defaults; display is independent."""
from .thinking_capabilities import capability


def thinking_body(config: dict, *, default_mode='default', include_thinking=False,
                  explicit_task_disable=False) -> dict:
    configured = config.get('thinking_mode', 'default')
    mode = default_mode if configured == 'default' else configured
    controls = capability(config, probe_ollama=config.get('thinking_mode', 'default') != 'default')
    protocol = controls['protocol']
    body = {}
    effort = config.get('reasoning_effort', 'default')
    if effort != 'default':
        if protocol != 'reasoning_effort' or effort not in controls['effort_options']:
            raise ValueError('此模型不支持所选的思考强度，请选择有效档位或使用默认值')
        body['reasoning_effort'] = effort
        mode = 'default'
    elif configured == 'default' and not controls['implicit_task_disable']:
        # Keep the old provider default for implicit simple/bounded tasks. An
        # explicit task request may prefer none only when this model supports it.
        if not (explicit_task_disable and default_mode == 'disabled' and 'none' in controls['effort_options']):
            mode = 'default'
    if mode in ('enabled', 'disabled'):
        if protocol == 'enable_thinking':
            body['enable_thinking'] = mode == 'enabled'
        elif protocol in ('thinking', 'adaptive'):
            body['thinking'] = {'type': 'adaptive' if protocol == 'adaptive' and mode == 'enabled' else mode}
        elif protocol == 'reasoning_effort':
            effort = controls['enabled_effort'] if mode == 'enabled' else 'none'
            if controls['effort_options'] and effort not in controls['effort_options']:
                raise ValueError('此模型不支持关闭思考，请选择支持的思考强度')
            body['reasoning_effort'] = effort
        elif configured != 'default':
            raise ValueError('该模型尚未配置可用的思考控制协议，请选择参数协议或使用默认模式')
    # MiniMax output formatting is separate from whether the model reasons.
    if include_thinking and config.get('provider_type') == 'MiniMax':
        body['reasoning_split'] = True
    return body
