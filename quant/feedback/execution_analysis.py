"""AI conclusions cite deterministic facts; arithmetic stays outside the model."""
import copy
import json

from rest_framework import serializers

KEYS = {'execution_assessment', 'execution_summary', 'execution_parameter_comparison'}


class ExecutionFinding(serializers.Serializer):
    kind = serializers.ChoiceField(choices=['supports', 'counters', 'limitation'])
    claim = serializers.CharField(max_length=3000)
    refs = serializers.ListField(child=serializers.CharField(max_length=160), min_length=1, max_length=12)


class ExecutionAssessment(serializers.Serializer):
    summary = serializers.CharField(max_length=5000)
    findings = ExecutionFinding(many=True, min_length=1, max_length=40)
    unknowns = serializers.ListField(child=serializers.CharField(max_length=3000), max_length=100)


def validate(value: dict, context: dict | None, *, model_output=False) -> dict:
    structured = context is not None and 'execution_summary' in context
    if not structured and context is not None:
        if KEYS.intersection(value):
            raise serializers.ValidationError('普通文本反馈不能冒充结构化平台核算')
        return {}
    if not structured and not KEYS.intersection(value):
        return {}  # Preserve historical report contracts exactly.
    if 'execution_assessment' not in value:
        raise serializers.ValidationError('结构化执行证据须给出 AI 核算解读')
    serializer = ExecutionAssessment(data=value['execution_assessment'])
    serializer.is_valid(raise_exception=True)
    assessment = dict(serializer.validated_data)
    if value['execution_assessment'] != assessment or set(value['execution_assessment']) != {'summary', 'findings', 'unknowns'}:
        raise serializers.ValidationError('核算解读含不规范或未知字段')
    for original, normalized in zip(value['execution_assessment']['findings'], assessment['findings']):
        if set(original) != {'kind', 'claim', 'refs'} or len(set(normalized['refs'])) != len(normalized['refs']):
            raise serializers.ValidationError('核算结论须使用唯一且完整的事实引用')
    if model_output and context is None and not {'execution_summary', 'execution_parameter_comparison'}.intersection(value):
        # The worker validates the parsed model response again against its
        # authoritative context before publishing anything. Restore never uses
        # this partial mode and requires the injected frozen facts.
        return {'execution_assessment': assessment}
    source = context if structured else value
    if not {'execution_summary', 'execution_parameter_comparison'} <= source.keys():
        raise serializers.ValidationError('核算解读缺少冻结的确定性证据')
    frozen = {key: copy.deepcopy(source[key]) for key in ('execution_summary', 'execution_parameter_comparison')}
    summary = frozen['execution_summary']
    if (not isinstance(summary, dict) or summary.get('method') != 'execution-evidence-summary-v1'
            or not isinstance(summary.get('refs'), list) or len(summary['refs']) > 600
            or any(not isinstance(ref, str) or len(ref) > 160 for ref in summary['refs'])
            or summary.get('status') not in ('reconciled', 'mismatch', 'insufficient')
            or not isinstance(summary.get('metrics'), dict) or not isinstance(summary.get('reported_comparison'), list)):
        raise serializers.ValidationError('核算摘要版本或引用无效')
    legal = set(summary['refs'])
    for row in summary['metrics'].values():
        if (not isinstance(row, dict) or set(row) != {'value', 'unit', 'status', 'reason', 'ref'}
                or row['status'] not in ('computed', 'unavailable') or
                any(not isinstance(row[key], str) for key in ('unit', 'reason', 'ref')) or
                row['value'] is not None and not isinstance(row['value'], str)):
            raise serializers.ValidationError('冻结核算指标结构无效')
    if any(not isinstance(row, dict) or not isinstance(row.get('ref'), str)
           or not isinstance(row.get('status'), str) for row in summary['reported_comparison']):
        raise serializers.ValidationError('冻结核算声明对照无效')
    _validate_render_snapshot(summary, frozen['execution_parameter_comparison'])
    if any(ref not in legal for row in assessment['findings'] for ref in row['refs']):
        raise serializers.ValidationError('AI 核算解读引用了未提供的事实')
    mismatch_refs = {row['ref'] for row in summary['reported_comparison'] if isinstance(row, dict)
                     and row.get('status') == 'mismatch' and isinstance(row.get('ref'), str)}
    reconciliation = summary.get('reconciliation')
    if not isinstance(reconciliation, dict) or not isinstance(reconciliation.get('examples'), list):
        raise serializers.ValidationError('冻结余额核对摘要结构无效')
    mismatch_refs |= {row['ref'] for row in reconciliation['examples'] if isinstance(row, dict)
                      and isinstance(row.get('ref'), str)}
    if summary['status'] == 'mismatch' and not any(row['kind'] == 'counters' and any(
            ref in mismatch_refs for ref in row['refs'])
            for row in assessment['findings']):
        raise serializers.ValidationError('存在核对差异时，AI 须明确引用差异作为反驳证据')
    if summary['status'] == 'insufficient' and not any(row['kind'] == 'limitation' for row in assessment['findings']):
        raise serializers.ValidationError('证据不足时，AI 须明确说明局限')
    if structured and any(key in value and value[key] != expected for key, expected in frozen.items()):
        raise serializers.ValidationError('AI 不得修改确定性核算证据')
    return {**frozen, 'execution_assessment': assessment}


def _validate_render_snapshot(summary: dict, compared: dict) -> None:
    def rows(value, fields, maximum):
        return (isinstance(value, list) and len(value) <= maximum and all(isinstance(row, dict) and
                all(isinstance(row.get(key), str) for key in fields) for row in value))
    if (not rows(summary.get('parameters'), ('name', 'value', 'unit', 'ref'), 300)
            or not rows(summary.get('reported_comparison'), ('name', 'reported', 'status', 'ref'), 100)
            or any(row.get('computed') is not None and not isinstance(row['computed'], str)
                   for row in summary['reported_comparison'])
            or not isinstance(compared, dict) or not rows(compared.get('rows'), ('name', 'status'), 300)
            or not rows(compared.get('missing'), ('name',), 300)):
        raise serializers.ValidationError('冻结核算参数或声明指标结构无效')
    if any(row.get('declaration') is not None and (not isinstance(row['declaration'], dict)
            or not isinstance(row['declaration'].get('default_raw'), str)) for row in compared['rows']):
        raise serializers.ValidationError('冻结源码参数对照结构无效')


def instruction(context: dict) -> str:
    if 'execution_summary' not in context:
        return ''
    shape = {'summary': '解释核算结果与研究价值，区分记录一致与真实性', 'findings': [
        {'kind': 'supports/counters/limitation', 'claim': '有限结论', 'refs': ['accounting:net_profit']}],
        'unknowns': ['尚未解决的口径、真实性、时间、平台机制或运行配置缺口']}
    return ('\n当前为结构化平台执行证据。原文完整归档但不进入本次模型请求；feedback.document 为空。'
        'reported_parameters、reported_metrics、supporting_evidence、counter_evidence 四个旧逐字提取数组必须全部为空；'
        '不得用源码、notes 或摘要补造原文 quote。数值、币种、费用净毛口径及完整异常计数以 execution_summary 为准；'
        '不得重算、补齐或输出 execution_summary / execution_parameter_comparison，它们由服务端固定。'
        '提供 execution_assessment=' + json.dumps(shape, ensure_ascii=False) + '。'
        'findings.kind 仅 supports、counters、limitation；每条 refs 只可选 execution_summary.refs 中的精确引用。'
        'mismatch 时须以 reconciliation.examples 或 reported_comparison 中 mismatch 项的精确 ref 提出 counters；'
        'insufficient 时必须提出 limitation。摘要保留全部异常总数，样例有省略数，不能把样例当全量。'
        '余额不是净值；导入净值只能证明给定采样点，不代表逐笔/盘中最大回撤。未知成本、现金流、时区不得默认为零或本地时间。'
        '参数对照中 configured 是报告声明值，default 是源码声明值；缺失和未匹配须保留，不能把默认值当运行参数。'
        '核对通过只表示给定记录在该口径下数值一致，不证明报告真实、源码实际执行或收益可复现。')


def markdown(result: dict) -> list[str]:
    if 'execution_assessment' not in result:
        return []
    data, summary = result['execution_assessment'], result['execution_summary']
    parts = ['## 平台执行证据核算', f"核算状态：{summary['status']} · 外部真实性尚未独立验证", data['summary']]
    for name, row in summary['metrics'].items():
        parts.append((f"- {name}：{row['value']} {row['unit']}" + (f"（{row['reason']}）" if row['reason'] else ''))
                     if row['status'] == 'computed' else f"- {name}：未知（{row['reason']}）")
    parts += ['### 报告声明的运行参数']
    parts += [f"- {row['name']}：{row['value']} {row['unit']} · {row['ref']}" for row in summary['parameters']] or ['未提供明确运行参数，不使用源码默认值补齐。']
    compared = result['execution_parameter_comparison']
    for row in compared['rows']:
        default = row['declaration']['default_raw'] if row['declaration'] else '未匹配源码声明'
        parts.append(f"- {row['name']} 与源码对照：{row['status']}；源码默认声明：{default}")
    if compared['missing']:
        parts.append('源码存在但缺少运行值：' + '、'.join(row['name'] for row in compared['missing']))
    parts += ['### 声明指标与计算值的差异']
    parts += [f"- {row['name']}：声明 {row['reported']}；计算 {row['computed']}；{row['status']} · {row['ref']}" for row in summary['reported_comparison']] or ['未提供可核对的声明指标。']
    parts += [f"- {row['kind']}：{row['claim']}\n\n事实引用：{', '.join(row['refs'])}" for row in data['findings']]
    parts += ['### 核算解读的未决问题', '\n'.join(f'- {row}' for row in data['unknowns']) or '无补充。']
    return parts
