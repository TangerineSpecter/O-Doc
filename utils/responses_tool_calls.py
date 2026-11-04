"""Bridge the existing agent tool loop to native OpenAI Responses requests.

Keep the agent's Chat-shaped working history so existing compaction and tool
executors retain their contracts. Replay each Responses output verbatim,
including encrypted reasoning, rather than reconstructing reasoning from text.
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass

from .thinking import thinking_body
from .thinking_capabilities import OPENAI_GPT6_MODELS
from .token_usage import create_response


def uses_responses_tools(config: dict, tools: list) -> bool:
    return bool(tools) and config.get('provider_type') == 'OpenAi' and config.get('model_name', '').lower() in OPENAI_GPT6_MODELS


def _as_dict(item) -> dict:
    if isinstance(item, dict):
        return copy.deepcopy(item)
    dump = getattr(item, 'model_dump', None)
    if callable(dump):
        return dump(mode='json', exclude_none=True)
    raise ValueError('Responses 接口返回了无法解析的输出项')


def _response_tools(tools: list) -> list[dict]:
    result = []
    for tool in tools:
        if not isinstance(tool, dict) or tool.get('type') != 'function' or not isinstance(tool.get('function'), dict):
            raise ValueError('Responses 工具入口仅支持已注册的函数工具')
        function = tool['function']
        name = function.get('name')
        if not isinstance(name, str) or not name:
            raise ValueError('函数工具缺少名称')
        result.append({'type': 'function', 'name': name, 'description': function.get('description', ''),
                       'parameters': copy.deepcopy(function.get('parameters') or {'type': 'object', 'properties': {}}),
                       'strict': function.get('strict', False)})
    if len({tool['name'] for tool in result}) != len(result):
        raise ValueError('函数工具名称重复')
    return result


def _response_content(content):
    if isinstance(content, str):
        return content
    if content is None:
        return ''
    if not isinstance(content, list):
        raise ValueError('Responses 消息内容格式不支持')
    parts = []
    for part in content:
        if not isinstance(part, dict):
            raise ValueError('Responses 消息内容格式不支持')
        if part.get('type') == 'text' and isinstance(part.get('text'), str):
            parts.append({'type': 'input_text', 'text': part['text']})
        elif part.get('type') == 'image_url':
            image = part.get('image_url')
            if isinstance(image, str):
                image = {'url': image}
            if not isinstance(image, dict) or not isinstance(image.get('url'), str):
                raise ValueError('图片输入格式不正确')
            converted = {'type': 'input_image', 'image_url': image['url']}
            if image.get('detail'):
                converted['detail'] = image['detail']
            parts.append(converted)
        else:
            raise ValueError('Responses 消息包含暂不支持的内容类型')
    return parts


def _response_tool_choice(choice):
    if isinstance(choice, dict) and choice.get('type') == 'function' and isinstance(choice.get('function'), dict):
        return {'type': 'function', 'name': choice['function'].get('name', '')}
    return choice


@dataclass(frozen=True)
class FunctionCall:
    name: str
    arguments: str


@dataclass(frozen=True)
class ToolCall:
    id: str
    function: FunctionCall

    def model_dump(self):
        return {'id': self.id, 'type': 'function',
                'function': {'name': self.function.name, 'arguments': self.function.arguments}}


@dataclass(frozen=True)
class ToolMessage:
    content: str
    tool_calls: tuple[ToolCall, ...]


class ResponsesToolAdapter:
    def __init__(self, client, config: dict, tools: list, *, disable_thinking: bool = False,
                 explicit_task_disable: bool = False):
        self.client, self.config = client, config
        self.tools = _response_tools(tools)
        self.allowed_names = {tool['name'] for tool in self.tools}
        self.groups: dict[tuple[str, ...], list[dict]] = {}
        self.seen_call_ids: set[str] = set()
        options = thinking_body(config, default_mode='disabled' if disable_thinking else 'default',
                                explicit_task_disable=explicit_task_disable)
        self.effort = options.get('reasoning_effort')

    def _input(self, messages: list[dict]) -> list[dict]:
        items = []
        for message in messages:
            role = message.get('role')
            calls = message.get('tool_calls') or []
            if role == 'assistant' and calls:
                identifiers = tuple(call.get('id', '') for call in calls)
                group = self.groups.get(identifiers)
                if group is None:
                    raise ValueError('工具历史与 Responses 推理状态不匹配，已停止以避免重放操作')
                # Existing market compaction removes intermediate assistant prose.
                items.extend(copy.deepcopy(item) for item in group
                             if item.get('type') != 'message' or message.get('content') is not None)
            elif role == 'tool':
                items.append({'type': 'function_call_output', 'call_id': message.get('tool_call_id', ''),
                              'output': message.get('content') or ''})
            elif role in ('system', 'developer', 'user', 'assistant'):
                items.append({'role': role, 'content': _response_content(message.get('content'))})
            else:
                raise ValueError('Responses 消息角色不受支持')
        return items

    def create(self, messages: list[dict], *, tool_choice=None, timeout=None, retries=1) -> ToolMessage:
        parameters = {'model': self.config['model_name'], 'input': self._input(messages), 'tools': self.tools,
                      'store': False, 'include': ['reasoning.encrypted_content'], 'parallel_tool_calls': False}
        if self.effort is not None:
            parameters['reasoning'] = {'effort': self.effort}
        if tool_choice:
            parameters['tool_choice'] = _response_tool_choice(tool_choice)
        if timeout is not None:
            parameters['timeout'] = timeout
        response = create_response(self.client, self.config, retries=retries, **parameters)
        if getattr(response, 'status', None) != 'completed':
            raise RuntimeError('Responses 模型请求未完整完成，本次不执行工具')
        output = [_as_dict(item) for item in (getattr(response, 'output', None) or [])]
        calls, text, refused = [], [], False
        for item in output:
            kind = item.get('type')
            if kind == 'reasoning':
                continue
            elif kind == 'message':
                for part in item.get('content') or []:
                    if part.get('type') == 'output_text' and isinstance(part.get('text'), str):
                        text.append(part['text'])
                    elif part.get('type') == 'refusal':
                        refused = True
            elif kind == 'function_call':
                name, identity, arguments = item.get('name'), item.get('call_id'), item.get('arguments')
                if item.get('status') not in (None, 'completed'):
                    raise ValueError('模型返回的工具调用尚未完成，本次不执行工具')
                if name not in self.allowed_names or not isinstance(identity, str) or not identity or not isinstance(arguments, str):
                    raise ValueError('模型返回了未授权或格式无效的工具调用')
                if identity in self.seen_call_ids or any(call.id == identity for call in calls):
                    raise ValueError('模型返回了重复的工具调用 ID，已停止以避免重复执行')
                try:
                    decoded = json.loads(arguments)
                except (ValueError, TypeError) as exc:
                    raise ValueError('模型返回了无效的工具参数，本次不执行工具') from exc
                if not isinstance(decoded, dict):
                    raise ValueError('工具参数必须是对象，本次不执行工具')
                calls.append(ToolCall(identity, FunctionCall(name, arguments)))
            else:
                raise ValueError('Responses 返回了未配置的输出类型，本次不执行工具')
        if refused:
            raise RuntimeError('模型拒绝了本次工具请求')
        if not calls and not ''.join(text).strip():
            raise RuntimeError('Responses 未返回有效回答')
        if calls:
            if any(item.get('type') == 'reasoning' and not item.get('encrypted_content') for item in output):
                raise RuntimeError('Responses 未返回可继续的推理状态，本次不执行工具')
            ids = tuple(call.id for call in calls)
            self.groups[ids] = output
            self.seen_call_ids.update(ids)
        return ToolMessage(''.join(text), tuple(calls))
