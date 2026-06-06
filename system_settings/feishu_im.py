import base64
import hashlib
import json
import logging
import math
import re
import threading
from datetime import datetime, timedelta

import requests
from django.db import IntegrityError, close_old_connections
from django.utils import timezone

from system_settings.agent_memory import (
    assign_record_conversation,
    build_memory_context,
    get_or_create_im_session,
    start_new_conversation,
    store_short_term_memory,
)
from system_settings.models import Agent, AgentIMMessage, SystemSetting
from utils.ai_service import AIService
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools

logger = logging.getLogger(__name__)

FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'
TOKEN_CACHE_PREFIX = 'feishu_token:'
MAX_CONTEXT_TOKENS = 48000
SUMMARY_TARGET_TOKENS = 3000
TOKEN_SAFETY_MARGIN = 1200
CJK_RE = re.compile(r'[\u3400-\u9fff\uf900-\ufaff]')


class FeishuIMError(Exception):
    pass


def normalize_feishu_event_payload(payload, encrypt_key=''):
    """处理飞书事件订阅的明文、challenge 和可选加密 payload。"""
    if not isinstance(payload, dict):
        raise FeishuIMError('飞书事件体不是有效 JSON 对象')

    if payload.get('encrypt'):
        if not encrypt_key:
            raise FeishuIMError('收到加密事件，但 Agent 未配置 Encrypt Key')
        payload = _decrypt_payload(payload.get('encrypt'), encrypt_key)

    if payload.get('type') == 'url_verification':
        return {
            'kind': 'challenge',
            'challenge': payload.get('challenge', ''),
            'payload': payload,
        }

    header = payload.get('header') or {}
    event = payload.get('event') or {}
    event_type = header.get('event_type') or payload.get('event_type')
    if event_type != 'im.message.receive_v1':
        return {
            'kind': 'ignored',
            'event_type': event_type,
            'payload': payload,
        }

    return {
        'kind': 'message',
        'event_id': header.get('event_id', ''),
        'token': header.get('token', ''),
        'event': event,
        'payload': payload,
    }


def verify_feishu_token(agent, token):
    expected = (agent.feishu_verification_token or '').strip()
    if expected and token != expected:
        raise FeishuIMError('飞书 Verification Token 校验失败')


def handle_feishu_message_event(agent, normalized_event):
    event = normalized_event.get('event') or {}
    message = event.get('message') or {}
    sender = event.get('sender') or {}
    sender_id = sender.get('sender_id') or {}
    message_id = str(message.get('message_id') or '').strip()

    if not message_id:
        raise FeishuIMError('飞书消息事件缺少 message_id')

    content_text = _extract_message_content(message)
    record_defaults = {
        'agent': agent,
        'platform': AgentIMMessage.PLATFORM_FEISHU,
        'event_id': normalized_event.get('event_id', ''),
        'chat_id': message.get('chat_id') or '',
        'sender_id': sender_id.get('open_id') or sender_id.get('union_id') or sender_id.get('user_id') or '',
        'message_type': message.get('message_type') or '',
        'content': content_text,
        'raw_event': normalized_event.get('payload') or {},
        'status': AgentIMMessage.STATUS_RECEIVED,
    }

    try:
        record = AgentIMMessage.objects.create(message_id=message_id, **record_defaults)
    except IntegrityError:
        logger.info('Duplicate Feishu message skipped: %s', message_id)
        return {'duplicate': True, 'message_id': message_id}

    threading.Thread(
        target=_process_feishu_record,
        args=(record.id,),
        name=f'feishu-im-{record.id}',
        daemon=True,
    ).start()
    return {'duplicate': False, 'message_id': message_id}


def handle_feishu_sdk_message_event(agent_id, event):
    """处理飞书 SDK 长连接分发出的 im.message.receive_v1 事件。"""
    try:
        from lark_oapi.core.json import JSON
    except ImportError as exc:
        raise FeishuIMError('当前环境缺少 lark-oapi，无法处理飞书长连接事件') from exc

    try:
        payload = json.loads(JSON.marshal(event))
    except Exception as exc:
        raise FeishuIMError('飞书长连接事件序列化失败') from exc

    normalized = normalize_feishu_event_payload(payload)
    if normalized.get('kind') != 'message':
        return {'ignored': True}

    agent = Agent.objects.get(id=agent_id)
    return handle_feishu_message_event(agent, normalized)


def _process_feishu_record(record_id):
    close_old_connections()
    typing_reaction_id = ''
    try:
        record = AgentIMMessage.objects.select_related('agent', 'agent__model').get(id=record_id)
        agent = record.agent
        if not agent.feishu_im_enabled:
            record.status = AgentIMMessage.STATUS_FAILED
            record.error = 'Agent 飞书 IM 已关闭'
            record.save(update_fields=['status', 'error', 'updated_at'])
            return

        if record.message_type != 'text':
            reply = '我现在先支持处理飞书文本消息。'
        elif not record.content.strip():
            reply = '我没有读到可处理的文本内容。'
        elif _is_new_conversation_command(record.content):
            start_new_conversation(agent, record)
            reply = '已开启新对话。'
        else:
            assign_record_conversation(agent, record)
            typing_reaction_id = _try_add_feishu_message_reaction(agent, record.message_id, 'Typing')
            reply = _build_agent_reply(agent, record.content.strip(), record)

        if typing_reaction_id:
            _try_delete_feishu_message_reaction(agent, record.message_id, typing_reaction_id)
        send_feishu_reply(agent, record.message_id, reply)
        record.response = reply
        record.status = AgentIMMessage.STATUS_REPLIED
        record.save(update_fields=['response', 'status', 'updated_at'])
        if record.message_type == 'text' and record.content.strip() and not _is_new_conversation_command(record.content):
            store_short_term_memory(agent, record)
    except Exception as exc:
        logger.exception('Feishu IM message processing failed: %s', record_id)
        try:
            record = AgentIMMessage.objects.get(id=record_id)
            if typing_reaction_id:
                _try_delete_feishu_message_reaction(record.agent, record.message_id, typing_reaction_id)
            _try_add_feishu_message_reaction(record.agent, record.message_id, 'CrossMark')
            record.status = AgentIMMessage.STATUS_FAILED
            record.error = str(exc)
            record.save(update_fields=['status', 'error', 'updated_at'])
        except Exception:
            logger.exception('Failed to mark Feishu IM record as failed: %s', record_id)
    finally:
        close_old_connections()


def _build_agent_reply(agent, user_text, record):
    system_prompt = agent.prompt or '你是一个可靠的文档协作 Agent。请简洁、准确地回复用户。'
    system_prompt += (
        '\n\n当前消息来自飞书 IM 通道。请直接回复用户需要的内容；'
        '不要提及后台处理流程，除非用户询问。'
        '\n你会看到同一飞书会话里的长期摘要和近期完整上下文。若上下文与当前问题有关，请延续对话；若无关，请以当前消息为准。'
    )
    messages = _build_context_messages(agent, record, system_prompt, user_text)
    messages.append({'role': 'user', 'content': user_text})
    tool_context = _build_agent_mcp_tool_context(agent)
    if tool_context['errors']:
        messages.insert(1, {
            'role': 'system',
            'content': (
                '以下 Agent 绑定的 MCP 未能装载。如果用户询问 MCP 状态或相关能力，'
                '请如实说明具体原因，不要声称完全没有配置 MCP：\n'
                + '\n'.join(f"- {item}" for item in tool_context['errors'])
            ),
        })

    if not tool_context['tools']:
        return AIService.chat_completion_messages(messages, model_id=agent.model_id)

    messages.insert(1, {
        'role': 'system',
        'content': (
            '当前飞书 IM Agent 已装载 MCP Tools。用户请求需要创建、查询、更新、删除闪念或其他外部工具能力时，'
            '必须优先调用合适的 Tool；如果缺少必要参数，请先向用户追问，不要编造参数。'
        ),
    })
    notified_mcp_servers = set()
    return AIService.chat_completion_messages_with_tools(
        messages,
        tool_context['tools'],
        lambda tool_name, arguments: _execute_agent_mcp_tool(tool_context, tool_name, arguments),
        on_tool_call=lambda tool_name, arguments: _notify_feishu_mcp_usage(
            agent,
            record.message_id,
            tool_context,
            tool_name,
            notified_mcp_servers,
        ),
        model_id=agent.model_id,
    )


def _build_agent_mcp_tool_context(agent):
    tool_context = {'tools': [], 'tool_map': {}, 'errors': []}
    if not isinstance(agent.mcp_servers, list) or not agent.mcp_servers:
        return tool_context

    from system_settings.models import MCPServer

    normalized_ids = list(dict.fromkeys([
        str(server_id).strip()
        for server_id in agent.mcp_servers
        if str(server_id or '').strip()
    ]))
    servers = list(MCPServer.objects.filter(id__in=normalized_ids))
    found_ids = {server.id for server in servers}
    for server_id in normalized_ids:
        if server_id not in found_ids:
            tool_context['errors'].append(f"MCP 配置不存在：{server_id}")

    for server in servers:
        if not server.enabled:
            tool_context['errors'].append(f"{server.name} 已停用")
            continue

        tools, error_msg = fetch_mcp_tools(server)
        if error_msg:
            logger.warning("Feishu IM MCP sync failed for %s: %s", server.name, error_msg)
            tool_context['errors'].append(f"{server.name}：{error_msg}")
            continue
        if tools:
            server.tools = _merge_enabled_mcp_tools(tools, server.tools)
            server.save(update_fields=['tools', 'updated_at'])

        for tool in (server.tools or []):
            if not isinstance(tool, dict) or not tool.get('enabled', True):
                continue
            original_name = tool.get('name')
            safe_name = _build_safe_mcp_tool_name(server, original_name, tool_context['tool_map'])
            tool_context['tool_map'][safe_name] = {
                'server': server,
                'tool_name': original_name,
            }
            parameters = tool.get('inputSchema') or {'type': 'object', 'properties': {}}
            if not isinstance(parameters, dict) or parameters.get('type') not in ('object', None):
                parameters = {'type': 'object', 'properties': {}}
            parameters.setdefault('type', 'object')
            parameters.setdefault('properties', {})
            tool_context['tools'].append({
                'type': 'function',
                'function': {
                    'name': safe_name,
                    'description': f"{server.name} / {original_name}: {tool.get('description') or ''}",
                    'parameters': parameters,
                }
            })

    return tool_context


def _execute_agent_mcp_tool(tool_context, safe_tool_name, arguments):
    entry = tool_context['tool_map'].get(safe_tool_name)
    if not entry:
        raise RuntimeError(f"未知 MCP Tool：{safe_tool_name}")
    result, error_msg = call_mcp_tool(entry['server'], entry['tool_name'], arguments)
    if error_msg:
        raise RuntimeError(f"{entry['server'].name}.{entry['tool_name']} 调用失败：{error_msg}")
    return result


def _notify_feishu_mcp_usage(agent, message_id, tool_context, safe_tool_name, notified_server_ids):
    entry = tool_context['tool_map'].get(safe_tool_name)
    if not entry:
        return

    server = entry.get('server')
    server_id = getattr(server, 'id', '') or getattr(server, 'name', '')
    if not server or server_id in notified_server_ids:
        return

    notified_server_ids.add(server_id)
    try:
        send_feishu_reply(agent, message_id, f"🔧 正在使用{server.name}...")
    except Exception:
        logger.warning(
            'Failed to send Feishu MCP usage notice: message=%s, server=%s',
            message_id,
            getattr(server, 'name', ''),
            exc_info=True,
        )


def _build_safe_mcp_tool_name(server, tool_name, existing_map):
    base = re.sub(r'[^a-zA-Z0-9_]', '_', str(tool_name or 'tool')).strip('_') or 'tool'
    if base not in existing_map:
        return base[:64]
    prefix = re.sub(r'[^a-zA-Z0-9_]', '_', str(server.id or server.name)).strip('_') or 'mcp'
    return f"{prefix}_{base}"[:64]


def _merge_enabled_mcp_tools(new_tools, existing_tools):
    existing = {tool.get('name'): tool for tool in (existing_tools or []) if isinstance(tool, dict) and tool.get('name')}
    merged_tools = []
    for tool in new_tools:
        name = tool.get('name')
        if name in existing:
            merged_tools.append({
                **tool,
                'enabled': existing[name].get('enabled', True),
            })
        else:
            merged_tools.append(tool)
    return merged_tools


def _build_context_messages(agent, record, system_prompt, user_text, max_context_tokens=MAX_CONTEXT_TOKENS):
    if not record.conversation_id:
        assign_record_conversation(agent, record)
    session = get_or_create_im_session(agent, record)
    conversation_id = record.conversation_id or session.conversation_id
    memory_messages = build_memory_context(agent, record, user_text)
    memory_text = '\n'.join(message.get('content') or '' for message in memory_messages)
    history_records = list(AgentIMMessage.objects.filter(
        agent=agent,
        platform=AgentIMMessage.PLATFORM_FEISHU,
        chat_id=record.chat_id,
        sender_id=record.sender_id or '',
        conversation_id=conversation_id,
        status=AgentIMMessage.STATUS_REPLIED,
        created_at__lt=record.created_at,
    ).exclude(
        response=''
    ).order_by('created_at'))

    summary = session.summary or ''
    context_records, omitted_records = _select_context_records(
        system_prompt,
        summary,
        user_text,
        history_records,
        extra_context=memory_text,
        max_context_tokens=max_context_tokens,
    )

    compress_records = _records_needing_summary(session, omitted_records)
    if compress_records:
        summary = _compress_session_summary(agent, session, compress_records)
        context_records, omitted_records = _select_context_records(
            system_prompt,
            summary,
            user_text,
            history_records,
            extra_context=memory_text,
            max_context_tokens=max_context_tokens,
        )

    messages = [{'role': 'system', 'content': system_prompt}]
    messages.extend(memory_messages)
    if summary:
        messages.append({
            'role': 'system',
            'content': (
                '以下是当前飞书会话早期历史的压缩摘要。它可能包含用户偏好、已确认事实、'
                '未完成事项、重要约定和最近任务状态。请把它作为长期上下文使用：\n'
                f'{summary}'
            )
        })

    messages.extend(_records_to_messages(context_records))
    return messages


def _select_context_records(system_prompt, summary, user_text, history_records, max_context_tokens=MAX_CONTEXT_TOKENS, extra_context=''):
    budget = max_context_tokens - TOKEN_SAFETY_MARGIN
    used_tokens = (
        _estimate_message_tokens(system_prompt)
        + _estimate_message_tokens(summary)
        + _estimate_message_tokens(user_text)
        + _estimate_message_tokens(extra_context)
    )
    selected = []
    for item in reversed(history_records):
        turn_tokens = _estimate_message_tokens(item.content) + _estimate_message_tokens(item.response) + 8
        if used_tokens + turn_tokens > budget:
            break
        selected.append(item)
        used_tokens += turn_tokens

    selected_ids = {item.id for item in selected}
    omitted = [item for item in history_records if item.id not in selected_ids]
    selected.reverse()
    return selected, omitted


def _records_needing_summary(session, records):
    if not records:
        return []
    if not session.summary_until:
        return records
    return [record for record in records if record.created_at and record.created_at > session.summary_until]


def _records_to_messages(records):
    messages = []
    for item in records:
        if item.content:
            messages.append({'role': 'user', 'content': item.content})
        if item.response:
            messages.append({'role': 'assistant', 'content': item.response})
    return messages


def _compress_session_summary(agent, session, records):
    transcript = _format_records_for_summary(records)
    previous_summary = session.summary or '无'
    prompt = f"""请将飞书 Agent 会话历史压缩成可供后续对话使用的长期摘要。

要求：
1. 保留用户偏好、明确事实、重要实体、文件/链接/任务名、未完成事项、已达成结论、输出格式约定。
2. 去掉寒暄、重复表达和无关细节。
3. 不要编造历史中没有的信息。
4. 用中文条目化输出，控制在约 {SUMMARY_TARGET_TOKENS} token 内。
5. 如果已有摘要和新增历史冲突，以新增历史为准，并在摘要中保留最新状态。

已有摘要：
{previous_summary}

新增历史：
{transcript}
"""
    try:
        summary = AIService.chat_completion_messages(
            [{'role': 'user', 'content': prompt}],
            model_id=agent.model_id,
        )
    except Exception:
        logger.exception('Failed to compress Feishu IM session summary: %s', session.id)
        return session.summary or ''

    last_record = records[-1]
    session.summary = _trim_to_estimated_tokens(summary, SUMMARY_TARGET_TOKENS) or session.summary
    session.summary_until = last_record.created_at
    session.summary_token_estimate = _estimate_message_tokens(session.summary)
    session.save(update_fields=['summary', 'summary_until', 'summary_token_estimate', 'updated_at'])
    return session.summary


def _format_records_for_summary(records):
    parts = []
    for index, item in enumerate(records, start=1):
        parts.append(
            f"第 {index} 轮\n"
            f"用户：{item.content or ''}\n"
            f"Agent：{item.response or ''}"
        )
    return '\n\n'.join(parts)


def _estimate_message_tokens(text):
    if not text:
        return 0
    text = str(text)
    cjk_count = len(CJK_RE.findall(text))
    non_cjk_count = max(0, len(text) - cjk_count)
    return cjk_count + math.ceil(non_cjk_count / 4) + 4


def _trim_to_estimated_tokens(text, max_tokens):
    if not text or _estimate_message_tokens(text) <= max_tokens:
        return text or ''

    chars = list(str(text))
    low = 0
    high = len(chars)
    while low < high:
        mid = (low + high + 1) // 2
        candidate = ''.join(chars[:mid]).rstrip()
        if _estimate_message_tokens(candidate) <= max_tokens:
            low = mid
        else:
            high = mid - 1
    return ''.join(chars[:low]).rstrip()


def _is_new_conversation_command(text):
    return str(text or '').strip().lower() == '/new'


def _extract_message_content(message):
    content = message.get('content') or ''
    if isinstance(content, dict):
        return str(content.get('text') or '').strip()
    if not isinstance(content, str):
        return ''
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return content.strip()
    if isinstance(parsed, dict):
        return str(parsed.get('text') or '').strip()
    return content.strip()


def send_feishu_reply(agent, message_id, text):
    token = get_tenant_access_token(agent)
    url = f'{FEISHU_API_BASE}/im/v1/messages/{message_id}/reply'
    payload = {
        'msg_type': 'text',
        'content': json.dumps({'text': text or ''}, ensure_ascii=False),
    }
    response = requests.post(
        url,
        json=payload,
        headers={'Authorization': f'Bearer {token}'},
        timeout=20,
    )
    _raise_for_feishu_error(response, '发送飞书回复失败')
    return response.json()


def add_feishu_message_reaction(agent, message_id, emoji_type):
    token = get_tenant_access_token(agent)
    url = f'{FEISHU_API_BASE}/im/v1/messages/{message_id}/reactions'
    payload = {
        'reaction_type': {
            'emoji_type': emoji_type,
        },
    }
    response = requests.post(
        url,
        json=payload,
        headers={'Authorization': f'Bearer {token}'},
        timeout=10,
    )
    data = _raise_for_feishu_error(response, '添加飞书消息表情失败')
    reaction = data.get('data') or {}
    return reaction.get('reaction_id') or ''


def _try_add_feishu_message_reaction(agent, message_id, emoji_type):
    try:
        return add_feishu_message_reaction(agent, message_id, emoji_type)
    except Exception:
        logger.warning(
            'Failed to add Feishu message reaction: message=%s, emoji=%s',
            message_id,
            emoji_type,
            exc_info=True,
        )
        return ''


def delete_feishu_message_reaction(agent, message_id, reaction_id):
    if not reaction_id:
        return
    token = get_tenant_access_token(agent)
    url = f'{FEISHU_API_BASE}/im/v1/messages/{message_id}/reactions/{reaction_id}'
    response = requests.delete(
        url,
        headers={'Authorization': f'Bearer {token}'},
        timeout=10,
    )
    _raise_for_feishu_error(response, '删除飞书消息表情失败')


def _try_delete_feishu_message_reaction(agent, message_id, reaction_id):
    try:
        delete_feishu_message_reaction(agent, message_id, reaction_id)
    except Exception:
        logger.warning(
            'Failed to delete Feishu message reaction: message=%s, reaction=%s',
            message_id,
            reaction_id,
            exc_info=True,
        )


def get_tenant_access_token(agent):
    app_key = hashlib.sha1((agent.feishu_app_id or '').encode('utf-8')).hexdigest()[:24]
    cache_key = f'{TOKEN_CACHE_PREFIX}{app_key}'
    cached = SystemSetting.objects.filter(key=cache_key).first()
    if cached:
        expires_at = cached.value.get('expiresAt')
        token = cached.value.get('tenantAccessToken')
        if token and expires_at:
            try:
                now = timezone.now()
                expires_at_dt = _normalize_cached_datetime(datetime.fromisoformat(expires_at), now)
                if expires_at_dt > now + timedelta(minutes=5):
                    return token
            except ValueError:
                pass

    response = requests.post(
        f'{FEISHU_API_BASE}/auth/v3/tenant_access_token/internal',
        json={
            'app_id': agent.feishu_app_id,
            'app_secret': agent.feishu_app_secret,
        },
        timeout=12,
    )
    data = _raise_for_feishu_error(response, '获取飞书 tenant_access_token 失败')
    token = data.get('tenant_access_token')
    if not token:
        raise FeishuIMError('飞书未返回 tenant_access_token')

    expires_in = int(data.get('expire') or 7200)
    expires_at = timezone.now() + timedelta(seconds=max(60, expires_in))
    SystemSetting.objects.update_or_create(
        key=cache_key,
        defaults={
            'value': {
                'tenantAccessToken': token,
                'expiresAt': expires_at.isoformat(),
            },
            'description': '飞书 tenant_access_token 缓存',
        }
    )
    return token


def _normalize_cached_datetime(value, reference):
    if timezone.is_naive(reference):
        if timezone.is_aware(value):
            return timezone.make_naive(value)
        return value

    if timezone.is_naive(value):
        return timezone.make_aware(value)
    return value


def _raise_for_feishu_error(response, message):
    try:
        data = response.json()
    except ValueError as exc:
        raise FeishuIMError(f'{message}: HTTP {response.status_code}') from exc

    code = data.get('code', 0)
    if response.status_code >= 400 or code not in (0, None):
        detail = data.get('msg') or data.get('message') or response.text
        raise FeishuIMError(f'{message}: {detail}')
    return data


def _decrypt_payload(encrypt_text, encrypt_key):
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives.padding import PKCS7
    except ImportError as exc:
        raise FeishuIMError('当前环境缺少 cryptography，无法解密飞书加密事件') from exc

    key = hashlib.sha256(encrypt_key.encode('utf-8')).digest()
    encrypted = base64.b64decode(encrypt_text)
    iv = encrypted[:16]
    ciphertext = encrypted[16:]
    decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()
    unpadder = PKCS7(algorithms.AES.block_size).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()
    return json.loads(plaintext.decode('utf-8'))
