"""已验证的工具调用兼容参数，不改变模型保存配置或普通聊天。"""
from urllib.parse import urlparse

from .thinking import thinking_body

FOURSAPI_HOSTS = frozenset({
    '4sapi.org', '4sapi.cn', '4sapi.net', '4sapi.com', '4sapi.ai', '4stoken.com',
})


class ToolThinkingCompatibilityError(ValueError):
    """可向用户展示的固定配置提示，不包含提供商响应正文。"""

    def __init__(self):
        reason = (
            '4sapi 的 gpt-6-luna 在当前接口中不能同时开启思考和调用工具。'
            '请将模型思考模式改为默认或关闭后重试。'
        )
        super().__init__(reason)
        self.diagnostics = {'error_type': 'tool_thinking_incompatible', 'reason': reason}


def tool_thinking_options(config: dict, *, has_tools: bool, disable_thinking: bool = False) -> dict:
    host = urlparse(config.get('base_url', '')).hostname
    if has_tools and host in FOURSAPI_HOSTS and config.get('model_name') == 'gpt-6-luna':
        if config.get('thinking_mode', 'default') == 'enabled':
            raise ToolThinkingCompatibilityError()
        # 上游已明确要求此模型的函数工具必须使用 none，省略参数仍会 400。
        return {'reasoning_effort': 'none'}
    return thinking_body(config, default_mode='disabled' if disable_thinking else 'default')
