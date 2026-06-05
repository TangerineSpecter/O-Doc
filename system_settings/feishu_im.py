import base64
import hashlib
import json
import logging
import threading
from datetime import datetime, timedelta

import requests
from django.db import IntegrityError, close_old_connections
from django.utils import timezone

from system_settings.models import Agent, AgentIMMessage, SystemSetting
from utils.ai_service import AIService

logger = logging.getLogger(__name__)

FEISHU_API_BASE = 'https://open.feishu.cn/open-apis'
TOKEN_CACHE_PREFIX = 'feishu_token:'


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
        else:
            reply = _build_agent_reply(agent, record.content.strip(), record)

        send_feishu_reply(agent, record.message_id, reply)
        record.response = reply
        record.status = AgentIMMessage.STATUS_REPLIED
        record.save(update_fields=['response', 'status', 'updated_at'])
    except Exception as exc:
        logger.exception('Feishu IM message processing failed: %s', record_id)
        try:
            record = AgentIMMessage.objects.get(id=record_id)
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
    )
    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_text},
    ]
    return AIService.chat_completion_messages(messages, model_id=agent.model_id)


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
