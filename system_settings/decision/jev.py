"""Decision connection dispatch, shared validation and compatibility exports."""
import math
import re
import time

import requests

from system_settings.token_usage.capture import Capture
from system_settings.token_usage.normalize import count
from .adapters import get_adapter
from .config import api_key, connection, selected_connection_id
from .diagnostics import record_failure, request_identifier

JEV_MODELS_URL = 'https://api.typesafe.ai/v1/models'
# Healthy local decisions in production finished within about 21s. A dead
# connection used to block for 60s and exhaust the shared stage budget before
# any text fallback could run.
REQUEST_TIMEOUT_SECONDS = 30


class DecisionUnavailable(Exception):
    """Safe diagnostic without provider bodies or credentials."""


def _provider_label(profile: dict) -> str:
    if profile.get('id') == 'jev':
        return 'TypeSafe JEV'
    return profile.get('name') or '决策模型'


def _safe_model_name(adapter, data: dict, profile: dict, connection_id: str) -> str:
    actual = adapter.model_name(data, profile['model_id'])
    if not isinstance(actual, str) or not actual.strip() or len(actual) > 200:
        raise DecisionUnavailable('决策模型未返回有效模型名称')
    if connection_id == 'jev' and not re.fullmatch(r'jev-[a-zA-Z0-9_.-]{1,190}', actual):
        raise DecisionUnavailable('JEV 未返回有效模型版本')
    return actual


def _send(owner: str, profile: dict, state: dict, criteria: dict[str, object], *,
          deadline: float, instructions: str | None, question_id: str,
          capture: Capture | None = None, set_stage=None) -> tuple[str, float, str, dict | None, dict[str, float]]:
    connection_id = profile['id']
    secret = api_key(owner, connection_id)
    if connection_id == 'jev' and not secret:
        raise DecisionUnavailable('本机尚未配置 JEV 密钥')
    if not 1 <= len(criteria) <= 255:
        raise DecisionUnavailable('候选数量无效')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('决策请求达到执行时限')
    adapter = get_adapter(profile['protocol'])
    question = {
        'type': 'choice',
        'instructions': instructions or 'Choose the best option using the supplied state. Return one listed option.',
        'criteria': criteria,
    }
    payload = adapter.build_payload(profile['model_id'], state, question_id, question)
    endpoint = adapter.endpoint(profile['base_url'])
    headers = {'Authorization': 'Bearer ' + secret} if secret else {}
    if capture and hasattr(capture, 'set_request'):
        capture.set_request({'method': 'POST', 'url': endpoint, 'json': payload})
    if set_stage:
        set_stage('request')
    response = requests.post(endpoint, headers=headers, json=payload,
                             timeout=min(REQUEST_TIMEOUT_SECONDS, remaining))
    status = response.status_code
    if status != 200:
        raise _HttpDecisionError(status)
    if set_stage:
        set_stage('response_json')
    data = response.json()
    if capture and hasattr(capture, 'set_response'):
        capture.set_response({'raw': response.text, 'json': data})
    if not isinstance(data, dict):
        raise DecisionUnavailable('决策模型响应结构无效')
    if set_stage:
        set_stage('response_validation')
    if set_stage:
        set_stage('version_validation')
    model_name = _safe_model_name(adapter, data, profile, connection_id)
    if set_stage:
        set_stage('answer_validation')
    answer = adapter.extract_answer(data, question_id)
    if not isinstance(answer, dict) or answer.get('type') != 'choice' or answer.get('choice') not in criteria:
        raise DecisionUnavailable('决策模型返回了无效候选')
    probabilities, confidence = answer.get('probabilities'), answer.get('confidence')

    def probability(value):
        return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 1

    if (not isinstance(probabilities, dict) or set(probabilities) != set(criteria)
            or not all(probability(value) for value in probabilities.values())
            or abs(sum(probabilities.values()) - 1) > .01 or not probability(confidence)):
        raise DecisionUnavailable('决策模型返回了无效概率分布')
    if set_stage:
        set_stage('probability_validation')
    usage = adapter.usage(data)
    return answer['choice'], float(confidence), model_name, usage, probabilities


class _HttpDecisionError(DecisionUnavailable):
    def __init__(self, status):
        super().__init__(f'决策服务返回错误（HTTP {status}）')
        self.status = status


def choose(owner: str, state: dict, criteria: dict[str, object], *, deadline: float,
           instructions: str | None = None, question_id: str = 'next_action',
           connection_id: str | None = None, max_probability: bool = False) -> tuple[str, float]:
    connection_id = connection_id or selected_connection_id(owner)
    try:
        profile = connection(owner, connection_id)
    except ValueError as exc:
        raise DecisionUnavailable(str(exc)) from None
    label = _provider_label(profile)
    if connection_id == 'jev' and not api_key(owner, connection_id):
        raise DecisionUnavailable('本机尚未配置 JEV 密钥')
    model_key = f'decision:{connection_id}'[:40]
    capture = Capture({'model_id': model_key, 'model_name': profile['model_id'],
                       'provider_id': model_key, 'provider_name': label})
    request_id = request_identifier(capture.row)
    started, stage, status = time.monotonic(), 'request', None
    def update_stage(value):
        nonlocal stage
        stage = value
    try:
        selected, confidence, model_name, usage, probabilities = _send(
            owner, profile, state, criteria, deadline=deadline, instructions=instructions,
            question_id=question_id, capture=capture, set_stage=update_stage)
        if max_probability:
            selected = max(criteria, key=probabilities.__getitem__)
            confidence = probabilities[selected]
        stage = 'usage'
        if capture.row:
            capture.row.model_name = model_name[:200]
            capture.row.save(update_fields=['model_name', 'updated_at'])
        if isinstance(usage, dict):
            input_key, output_key, total_key = get_adapter(profile['protocol']).usage_fields()
            input_tokens, output_tokens = count(usage, input_key), count(usage, output_key)
            total_tokens = count(usage, total_key)
            if total_tokens is None and input_tokens is not None and output_tokens is not None:
                total_tokens = input_tokens + output_tokens
            capture.counts({'input_tokens': input_tokens, 'output_tokens': output_tokens,
                            'total_tokens': total_tokens})
        stage = 'finish'
        capture.finish('success')
        return selected, confidence
    except BaseException as exc:
        if isinstance(exc, _HttpDecisionError):
            status = exc.status
        detail = None
        if isinstance(exc, Exception):
            detail = record_failure(exc, stage=stage, request_id=request_id, started=started,
                                    status=status, row=capture.row, validation=isinstance(exc, DecisionUnavailable),
                                    provider_name=label, model_name=profile['model_id'],
                                    endpoint=get_adapter(profile['protocol']).endpoint(profile['base_url']))
        capture.finish('failed', error=exc)
        if isinstance(exc, (DecisionUnavailable, requests.RequestException, ValueError, TypeError, AttributeError)):
            raise DecisionUnavailable(detail) from None
        raise


def connection_test(owner: str, connection_id: str = 'jev') -> dict:
    try:
        profile = connection(owner, connection_id)
    except ValueError as exc:
        raise DecisionUnavailable(str(exc)) from None
    secret = api_key(owner, connection_id)
    if connection_id == 'jev':
        if not secret:
            raise DecisionUnavailable('本机尚未配置 JEV 密钥')
        try:
            response = requests.get(JEV_MODELS_URL, headers={'Authorization': 'Bearer ' + secret}, timeout=8)
            if response.status_code != 200:
                raise DecisionUnavailable(f'JEV 连接检测失败（HTTP {response.status_code}）')
            data = response.json()
            if not isinstance(data, dict) or not isinstance(data.get('models', data.get('data')), list):
                raise DecisionUnavailable('JEV 模型列表响应无效')
            return {'ok': True, 'connection_id': connection_id, 'protocol': profile['protocol']}
        except (requests.RequestException, ValueError):
            raise DecisionUnavailable('JEV 连接检测失败，请检查网络与密钥') from None
    try:
        _send(owner, profile, {'connection_test': 'Check whether the decision service is ready.'},
              {'connected': 'The service is reachable and can return a typed decision.',
              'unavailable': 'The service is not ready.'},
              deadline=time.monotonic() + REQUEST_TIMEOUT_SECONDS,
              instructions='Select the option that best describes the connection test.',
              question_id='connection_test')
    except DecisionUnavailable:
        raise
    except requests.Timeout:
        raise DecisionUnavailable('连接测试超时') from None
    except requests.RequestException:
        raise DecisionUnavailable('连接测试网络请求失败，请检查地址和网络') from None
    except (ValueError, TypeError, AttributeError):
        raise DecisionUnavailable('连接测试响应结构无效') from None
    return {'ok': True, 'connection_id': connection_id, 'protocol': profile['protocol']}
