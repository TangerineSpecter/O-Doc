"""Conservative Chat Completions capability registry, audited 2026-10-10.

Sources and scope are documented in docs/模型思考控制支持说明.md.
Unknown models are unverified, not automatically considered toggleable.
"""
import re

RELAY_PROVIDERS = ('NewAPI', 'custom')
MANUAL_PROTOCOLS = ('thinking', 'enable_thinking', 'adaptive', 'reasoning_effort')


QWEN_HYBRID = {
    'qwen3.8-max', 'qwen3.8-flash', 'qwen3.8-27b',
    'qwen3.7-max', 'qwen3.7-max-2026-05-20', 'qwen3.7-max-2026-06-08',
    'qwen3.7-plus', 'qwen3.7-plus-2026-05-26', 'qwen3.7-flash', 'qwen3.7-flash-2026-07-15',
    'qwen3.6-max-preview', 'qwen3.6-plus', 'qwen3.6-plus-2026-04-02',
    'qwen3.6-flash', 'qwen3.6-flash-2026-04-16', 'qwen3.6-35b-a3b',
    'qwen3.5-plus', 'qwen3.5-plus-2026-02-15', 'qwen3.5-flash', 'qwen3.5-flash-2026-02-23',
    'qwen3.5-397b-a17b', 'qwen3.5-122b-a10b', 'qwen3.5-27b', 'qwen3.5-35b-a3b',
    'qwen3-max', 'qwen3-max-preview', 'qwen3-max-2026-01-23',
    'qwen3-235b-a22b', 'qwen3-32b', 'qwen3-30b-a3b', 'qwen3-14b', 'qwen3-8b',
    'qwen-plus', 'qwen-plus-latest', 'qwen-flash', 'qwen-turbo',
}


def _qwen_hybrid(name: str) -> bool:
    if name in QWEN_HYBRID:
        return True
    snapshot = re.fullmatch(r'qwen-(plus|flash)-(\d{4}-\d{2}-\d{2})', name)
    return bool(snapshot and snapshot[2] >= ('2025-04-28' if snapshot[1] == 'plus' else '2025-07-28'))


def capability(config: dict, *, probe_ollama=False) -> dict:
    provider = config.get('provider_type', '')
    name = config.get('model_name', '').lower()
    selected = config.get('thinking_protocol', 'auto')
    manual = provider in RELAY_PROVIDERS
    result = {'supported': False, 'protocol': 'unsupported', 'manual_protocol': manual,
              'reason': '此模型的思考开关能力尚未确认，暂不提供开关。', 'enabled_effort': 'medium'}
    if config.get('model_type', 'chat') not in ('chat', 'image'):
        result.update(reason='此模型功能类型不提供思考开关。', manual_protocol=False)
        return result
    if selected == 'unsupported':
        result['reason'] = '此模型已配置为不支持思考控制。'
        return result
    protocol = 'unsupported'
    if manual:
        if selected in MANUAL_PROTOCOLS:
            protocol = selected
        else:
            result['reason'] = '中转模型能力取决于实际路由；按上游文档选择协议后才能配置开关。'
    elif provider == 'DeepSeek':
        if name in ('deepseek-flash', 'deepseek-v4-pro'):
            protocol = 'thinking'
    elif provider in ('Qwen', 'SiliconFlow'):
        local = name.split('/')[-1]
        if re.search(r'(thinking|instruct|coder|qwq|deepseek-r1)', local):
            result['reason'] = '此模型为固定思考或非思考模型，不提供思考开关。'
        elif provider == 'Qwen' and re.fullmatch(r'qwen3(?:\.[5-8])?-\d.*', local):
            result['reason'] = '当前未适配此百炼开源型号的流式思考调用，暂不提供开关。'
        elif (_qwen_hybrid(local)
              or re.match(r'deepseek-v(?:3\.[12]|4)(?:[.\-]|$)', local)):
            protocol = 'enable_thinking'
    elif provider == 'Doubao':
        if 'thinking' in name:
            result['reason'] = '此豆包型号固定开启思考，无法关闭。'
        elif re.match(r'doubao-seed-(?:1-6|1-8|2-[01])(?:-|$)', name):
            protocol = 'thinking'
    elif provider == 'Xiaomi':
        if name in ('mimo-v2.5', 'mimo-v2.5-pro', 'mimo-v2.6-flash',
                    'mimo-v2.6-pro', 'mimo-v2.6-pro-ultraspeed'):
            protocol = 'thinking'
    elif provider == 'MiniMax':
        if name == 'minimax-m3':
            protocol = 'adaptive'
        elif re.match(r'minimax-m(?:2|3\.1)', name):
            result['reason'] = '此 MiniMax 型号不能关闭思考，不提供开关。'
    elif provider == 'Google AI':
        if re.fullmatch(r'gemini-2\.5-flash(?:-lite)?(?:-preview-\d{2}-\d{2})?', name):
            protocol = 'reasoning_effort'
        elif name.startswith(('gemini-2.5-pro', 'gemini-3')):
            result['reason'] = '此 Gemini 型号不能完全关闭思考，不提供开关。'
    elif provider == 'OpenAi':
        # These exact families document none. Do not extrapolate to Codex/Pro/6.x.
        if re.fullmatch(r'gpt-5\.[12](?:-\d{4}-\d{2}-\d{2})?', name):
            protocol = 'reasoning_effort'
    elif provider == 'Ollama':
        metadata = config.get('ollama_thinking')
        if metadata is None and probe_ollama and name:
            from .ollama_thinking import model_thinking
            metadata = model_thinking(config.get('base_url', ''), config.get('model_name', ''))
        values = metadata.get('values', []) if isinstance(metadata, dict) else []
        if not isinstance(values, list):
            values = []
        if any(value is False for value in values) and any(value is True for value in values):
            protocol = 'reasoning_effort'
        elif values:
            result['reason'] = '此 Ollama 模型未声明可同时开启和关闭思考，不提供开关。'
        else:
            result['reason'] = 'Ollama 未返回可验证的思考元数据，请确认服务版本及模型；暂不提供开关。'
    if protocol != 'unsupported':
        result.update(supported=True, protocol=protocol, reason='此模型支持单独配置思考模式。')
    # Native providers must use the documented protocol, not a freely selected one.
    if not manual and selected not in ('auto', protocol):
        result.update(supported=False, protocol='unsupported', reason='已保存的协议不符合此模型，请恢复自动协议。')
    return result
