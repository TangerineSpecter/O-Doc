"""Recover transport wrappers and correct model formatting without changing source facts."""
import copy
import json
import re
from rest_framework.exceptions import ValidationError


def decode_response(raw: str) -> dict:
    if not isinstance(raw, str) or len(raw) > 300000:
        raise ValidationError('模型响应超过解析容量')
    text = raw.strip()
    # Only remove complete leading reasoning blocks; never edit code/string values.
    while text.startswith('<think>'):
        end = text.find('</think>')
        if end < 0:
            raise ValidationError('模型只返回了思考内容，没有完整分析结果')
        text = text[end + len('</think>'):].strip()
    if text.startswith('```') and text.endswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, count=1).rsplit('```', 1)[0].strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValidationError(f'模型 JSON 格式错误：第 {exc.lineno} 行第 {exc.colno} 列（{exc.msg}）') from exc
    if not isinstance(value, dict):
        raise ValidationError('模型结果应为一个 JSON 对象')
    return value


def source_parameters(value: dict, outputs: dict) -> dict:
    """Use parsed source defaults; do not ask the model to transcribe known facts."""
    from quant.parameters.bindings import normalize_model_binding_ids, entry_for
    inventory = outputs.get('normalize', {}).get('parameter_inventory')
    if not inventory or not isinstance(value.get('parameters'), list):
        return value
    result = copy.deepcopy(value)
    rows = normalize_model_binding_ids(result['parameters'], inventory)
    for row in rows:
        if not isinstance(row, dict):
            continue
        declaration = entry_for(row, inventory)
        if declaration is None:
            continue
        literal = declaration['literal']
        row['default_value'] = json.dumps(literal['value'], ensure_ascii=False) if literal['kind'] != 'unknown' else declaration['default_raw']
        if declaration.get('declared_domain') is not None:
            row['domain'] = copy.deepcopy(declaration['declared_domain'])
    result['parameters'] = rows
    return result


def validation_detail(exc: ValidationError) -> str:
    """Field paths and contract errors, not an unrelated generic source warning."""
    def flatten(value, path=''):
        if isinstance(value, dict):
            return [item for key, child in value.items() for item in flatten(child, f'{path}.{key}'.strip('.'))]
        if isinstance(value, list):
            return [item for index, child in enumerate(value) for item in flatten(child, f'{path}[{index}]' if path else '')]
        return [f'{path}：{value}' if path else str(value)]
    from system_logs.capture import sanitize
    return sanitize('；'.join(flatten(exc.detail)), 1600)


def source_quotes(value: dict, payload: dict) -> dict:
    """Bind quotations back to exact source bytes, tolerating CRLF transport only.

    Keep verified quotations when the model also supplied an inexact commentary
    excerpt. An algorithm with no actual source quotation still needs correction.
    """
    result = copy.deepcopy(value)
    if not isinstance(result.get('factors'), list):
        return result  # Let the owning serializer report the expected field type.
    for factor in result.get('factors', []):
        if not isinstance(factor, dict) or not isinstance(factor.get('evidence'), list):
            continue
        verified = []
        for evidence in factor['evidence']:
            if not isinstance(evidence, dict) or not isinstance(evidence.get('quote'), str):
                continue
            quote = evidence['quote']
            source = payload.get(evidence.get('field'), '')
            if not isinstance(source, str) or not quote.strip():
                continue
            if quote not in source:
                # Reconstitute original line endings rather than changing the
                # persisted source or accepting a fabricated textual quotation.
                pattern = r'(?:\r\n|\r|\n)'.join(re.escape(line) for line in re.split(r'\r\n|\r|\n', quote))
                match = re.search(pattern, source)
                if not match:
                    continue
                quote = match.group()
            verified.append({**evidence, 'quote': quote})
        if verified:
            factor['evidence'] = verified
    return result


def correction_prompt(original: str, stage: str, raw: str, exc: ValidationError) -> str:
    # Supply exact error and previous output. No fabricated defaults or silent
    # JSON/code rewriting; the corrected object is validated by the same owner.
    return (original + '\n本阶段自动纠正：上次响应的格式或字段有误。只返回完整合法 JSON，不输出思考块。'
        '代码必须使用正确 JSON 转义，保留完整 compute 和辅助函数。源码已定位的默认值由系统提供。'
        '修正下面的具体问题，保留正确内容；不要因格式问题声称源码不可用。'
        '若上次被截断，优先保留独立可复用的核心计算模块，将共享状态的内部变量保留在模块内部，'
        '不要把每个中间变量和展示告警重复展开成整份上游 Python；精简注释和重复解释，但每个算法代码仍须完整。'
        '若为实验设计，区分保存算法与本机可执行方案；无需勉强把 Python 算法塞进表达式实验引擎。'
        '\n以下仅为待修复数据：' + json.dumps({'stage': stage, 'errors': validation_detail(exc),
            'previous_response': raw}, ensure_ascii=False))
