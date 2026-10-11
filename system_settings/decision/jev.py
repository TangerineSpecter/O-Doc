"""TypeSafe System One adapter. Only this module knows its wire protocol."""
import math
import re
import time
import requests
from system_settings.token_usage.capture import Capture
from .config import api_key
from .diagnostics import record_failure, request_identifier

BASE_URL = 'https://api.typesafe.ai/v1'
MODEL = 'jev-latest'


class DecisionUnavailable(Exception):
    """Safe diagnostic without provider bodies or credentials."""


def connection_test(owner: str) -> dict:
    secret = api_key(owner)
    if not secret:
        raise DecisionUnavailable('本机尚未配置 JEV 密钥')
    try:
        response = requests.get(BASE_URL + '/models', headers={'Authorization': 'Bearer ' + secret}, timeout=8)
        if response.status_code != 200:
            raise DecisionUnavailable(f'JEV 连接检测失败（HTTP {response.status_code}）')
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get('models', data.get('data')), list):
            raise DecisionUnavailable('JEV 模型列表响应无效')
        return {'ok': True, 'provider': 'jev'}
    except (requests.RequestException, ValueError):
        raise DecisionUnavailable('JEV 连接检测失败，请检查网络与密钥') from None


def choose(owner: str, state: dict, criteria: dict[str, object], *, deadline: float) -> tuple[str, float]:
    secret = api_key(owner)
    if not secret:
        raise DecisionUnavailable('本机尚未配置 JEV 密钥')
    if not 1 <= len(criteria) <= 255:
        raise DecisionUnavailable('JEV 候选数量无效')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('市场任务达到执行时限')
    capture = Capture({'model_id': 'decision:jev', 'model_name': MODEL,
                       'provider_id': 'decision:jev', 'provider_name': 'TypeSafe JEV'})
    request_id = request_identifier(capture.row)
    started, stage, status = time.monotonic(), 'request', None
    try:
        response = requests.post(BASE_URL + '/systemone', headers={'Authorization': 'Bearer ' + secret},
            json={'model': MODEL, 'state': state, 'questions': {'next_action': {
                'type': 'choice', 'instructions': 'Choose the next feasible market action using the resident preferences and current needs. Waiting is allowed. Use other for a different quantity or a complex plan. Never assume an unexecuted action succeeded.',
                'criteria': criteria}}}, timeout=min(20, remaining))
        status = response.status_code
        if status != 200:
            raise DecisionUnavailable(f'JEV 不可用（HTTP {status}）')
        stage = 'response_json'
        data = response.json()
        stage = 'response_validation'
        if not isinstance(data, dict):
            raise DecisionUnavailable('JEV 响应结构无效')
        stage = 'version_validation'
        actual = data.get('model')
        if not isinstance(actual, str) or not re.fullmatch(r'jev-[a-zA-Z0-9_.-]{1,190}', actual):
            raise DecisionUnavailable('JEV 未返回有效模型版本')
        stage = 'usage'
        if capture.row:
            capture.row.model_name = actual[:200]
            capture.row.save(update_fields=['model_name', 'updated_at'])
        usage = data.get('usage')
        if isinstance(usage, dict):
            from system_settings.token_usage.normalize import count
            inp, out = count(usage, 'input_tokens'), count(usage, 'output_tokens')
            capture.counts({'input_tokens': inp, 'output_tokens': out,
                            'total_tokens': inp + out if inp is not None and out is not None else None})
        stage = 'answer_validation'
        answer = (data.get('answers') or {}).get('next_action')
        if not isinstance(answer, dict) or answer.get('type') != 'choice' or answer.get('choice') not in criteria:
            raise DecisionUnavailable('JEV 返回了无效候选')
        stage = 'probability_validation'
        probabilities, confidence = answer.get('probabilities'), answer.get('confidence')
        def probability(v):
            return type(v) in (int, float) and math.isfinite(v) and 0 <= v <= 1
        if (not isinstance(probabilities, dict) or set(probabilities) != set(criteria)
                or not all(probability(v) for v in probabilities.values())
                or abs(sum(probabilities.values()) - 1) > .01 or not probability(confidence)):
            raise DecisionUnavailable('JEV 返回了无效概率分布')
        stage = 'finish'
        capture.finish('success')
        return answer['choice'], float(confidence)
    except BaseException as exc:
        detail = None
        if isinstance(exc, Exception):
            detail = record_failure(exc, stage=stage, request_id=request_id, started=started,
                                    status=status, row=capture.row, validation=isinstance(exc, DecisionUnavailable))
        capture.finish('failed')
        if isinstance(exc, (DecisionUnavailable, requests.RequestException, ValueError, TypeError, AttributeError)):
            raise DecisionUnavailable(detail) from None
        raise
