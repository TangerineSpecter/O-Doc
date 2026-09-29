"""Extract bounded diagnostics without retaining provider messages or payloads."""
import re


def failure_details(data: dict) -> dict:
    error = data.get('error')
    error = error if isinstance(error, dict) else {}
    raw_code = error.get('code') or data.get('code') or ''
    code = str(raw_code)
    # Codes are identifiers, never arbitrary response text or credentials.
    if not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', code) or code.lower().startswith(('sk-', 'bearer', 'token')):
        code = ''
    messages = [error.get('message'), data.get('error'), data.get('failure_reason'),
                data.get('failureReason'), data.get('message')]
    text = ' '.join(value[:2000].lower() for value in messages if isinstance(value, str))
    reasons = {
        'insufficient_balance': '服务商明确返回余额不足',
        'balance_not_enough': '服务商明确返回余额不足',
        'insufficient_quota': '服务商明确返回额度不足',
        'content_policy_violation': '服务商返回内容审核未通过',
        'moderation_blocked': '服务商返回内容审核未通过',
        'invalid_parameter': '服务商返回参数校验失败',
        'invalid_request': '服务商返回请求参数无效',
        'upstream_error': '服务商返回上游处理失败',
        'timeout': '服务商返回生成超时',
    }
    reason = reasons.get(code.lower(), '')
    if not reason:
        # Report only fixed classifications; provider text may echo private prompts.
        for markers, label in (
            (('content policy', 'moderation', '内容审核', '内容违规'), '服务商失败信息涉及内容审核'),
            (('insufficient balance', '余额不足'), '服务商失败信息涉及余额不足'),
            (('insufficient quota', '额度不足'), '服务商失败信息涉及额度不足'),
            (('invalid parameter', '参数错误'), '服务商失败信息涉及参数校验'),
            (('upstream', '上游'), '服务商失败信息涉及上游处理'),
            (('timeout', 'timed out', '超时'), '服务商失败信息涉及生成超时'),
        ):
            if any(marker in text for marker in markers):
                reason = label
                break
    return {'provider_code': code,
            'reason': reason or '服务商返回失败状态，未提供可识别的具体原因；请凭服务商任务 ID 排查'}
