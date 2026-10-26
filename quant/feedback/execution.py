"""Freeze imported execution facts and rebuild the same evidence on restore."""
import copy
import json

from rest_framework import serializers

ADAPTER_FORMATS = {'standard-execution-json-v1': 'json', 'standard-execution-csv-v1': 'csv',
                   'mt4-tester-html-v1': 'html'}
PAYLOAD_KEYS = {'execution_adapter', 'execution_options', 'execution_evidence', 'execution_accounting'}


class ExecutionPreviewInput(serializers.Serializer):
    document = serializers.CharField(max_length=1048576, trim_whitespace=False)
    execution_adapter = serializers.ChoiceField(choices=list(ADAPTER_FORMATS))
    execution_options_json = serializers.CharField(max_length=4000, required=False, default='{}', trim_whitespace=False)


def parse_options(value: str) -> dict:
    try:
        def pairs(items):
            result = {}
            for name, item in items:
                if name in result:
                    raise ValueError('duplicate key')
                result[name] = item
            return result
        options = json.loads(value, object_pairs_hook=pairs,
                             parse_constant=lambda _: (_ for _ in ()).throw(ValueError('non-finite')))
    except (ValueError, TypeError, RecursionError) as exc:
        raise serializers.ValidationError('核算选项须为完整、无重复键的 JSON 对象') from exc
    if not isinstance(options, dict):
        raise serializers.ValidationError('核算选项须为 JSON 对象')
    return options


def freeze(document: str, adapter: str, options: dict) -> dict:
    from quant.execution_evidence import normalize, account
    evidence = normalize(document, adapter, options)
    return {'execution_adapter': adapter, 'execution_options': copy.deepcopy(evidence['options']),
            'execution_evidence': evidence, 'execution_accounting': account(evidence)}


def validate_frozen(payload: dict) -> None:
    expected = freeze(payload['document'], payload['execution_adapter'], payload['execution_options'])
    if any(payload[key] != value for key, value in expected.items()):
        raise serializers.ValidationError('平台执行证据与原文、固定口径或确定性核算不一致')


def parameter_comparison(evidence: dict, target: dict, *, version=1) -> dict:
    from quant.parameters.comparison import compare
    snapshot = {'parameters': [{'name': row['name'], 'raw_value': str(row['value'])}
                               for row in evidence['parameters']]}
    if version==2:
        from quant.parameters.source_comparison import compare as compare_source
        return compare_source(snapshot,target)
    result = compare(snapshot, target)
    result['limitations'] = result['limitations'][:2] + [
        '实际参数是导入报告的声明，不证明真实运行配置；源码默认值仅作对照，不补齐缺失实际值。',
        '目前只对 MQL4 的 input/extern 简单声明作确定性对照；其他语言保留未匹配，不猜测参数映射或推荐范围。']
    return result


def summary(payload: dict) -> dict:
    from quant.execution_evidence import model_projection
    return model_projection(payload['execution_evidence'], payload['execution_accounting'])


def model_context(payload: dict, target: dict) -> dict:
    return {'execution_summary': summary(payload),
            'execution_parameter_comparison': parameter_comparison(payload['execution_evidence'], target,
                version=2 if payload['feedback_version']==5 else 1)}


def presentation(payload: dict) -> dict:
    """Opaque envelope protects literal parameter names from API key conversion."""
    if payload.get('feedback_version') not in (3,5):
        return payload
    result = {key: value for key, value in payload.items() if key not in PAYLOAD_KEYS}
    result['execution_preview_json'] = json.dumps({key: payload[key] for key in
        ('execution_evidence', 'execution_accounting')} | {'execution_summary': summary(payload)},
        ensure_ascii=False, allow_nan=False)
    return result


def analysis_presentation(result: dict) -> dict:
    if 'native_review' in result:
        # Parameter names and frozen nested maps are literal source identifiers;
        # the global camel-case renderer must not rewrite their dictionary keys.
        review=result['native_review']
        return {key:value for key,value in result.items() if key!='native_review_facts'} | {
            'native_review':{**review,'actual_parameters':[{'name':key,'value':value} for key,value in review['actual_parameters'].items()]},
            'computed_native_json':json.dumps(result.get('native_review_facts'),ensure_ascii=False,allow_nan=False)}
    if 'execution_summary' not in result:
        return result
    return {key: value for key, value in result.items()
            if key not in ('execution_summary', 'execution_parameter_comparison')} | {
        'computed_execution_json': json.dumps({key: result[key] for key in
            ('execution_summary', 'execution_parameter_comparison')}, ensure_ascii=False, allow_nan=False)}


def preview(values: dict) -> dict:
    payload = freeze(values['document'], values['execution_adapter'], parse_options(values['execution_options_json']))
    return {key: payload[key] for key in ('execution_evidence', 'execution_accounting')} | {
        'execution_summary': summary(payload)}
