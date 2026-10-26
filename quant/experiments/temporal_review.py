"""Version-bound AI interpretation and score gates for all-inner evidence."""
from rest_framework import serializers
from .temporal_sensitivity import supports_score
from .window_review import WindowReview

KEY = 'temporal_parameter_stability'
FIELD = 'temporal_parameter_review'
VERSION = 'temporal_parameter_review_version'


class TemporalReview(serializers.Serializer):
    text = serializers.CharField(max_length=4000)
    evidence_refs = serializers.ListField(child=serializers.CharField(max_length=100), min_length=1, max_length=12)
    status = serializers.ChoiceField(choices=('sampled_region', 'no_supported_region', 'insufficient_comparison'))
    planned_windows = serializers.IntegerField(min_value=4, max_value=20)
    window_reviews = WindowReview(many=True, required=False, min_length=4, max_length=20)


def validate(raw: dict, result: dict, facts: dict | None) -> None:
    if VERSION in raw and (type(raw[VERSION]) is not int or raw[VERSION] not in (1, 2)):
        raise serializers.ValidationError('跨窗口参数解读版本无效')
    from .window_review import validate as validate_windows
    structured = validate_windows(raw.get(FIELD, {}), result.get(FIELD, {}), facts)
    expected_version = 2 if structured else 1
    if VERSION in raw and raw[VERSION] != expected_version:
        raise serializers.ValidationError('跨窗口参数解读版本与逐窗覆盖合同不符')
    if facts is None:
        # The JSON decoder normalizes once before the worker supplies frozen facts.
        # The second, bound validation rejects injection into an older contract.
        if VERSION in raw or FIELD in result:
            if FIELD not in result:
                raise serializers.ValidationError('跨窗口参数解读缺少正文')
            result[VERSION] = expected_version
        return
    temporal = facts.get(KEY)
    if temporal is None:
        if FIELD in raw or VERSION in raw:
            raise serializers.ValidationError('历史解读不能追加未绑定的跨窗口参数事实')
        return
    row = result.get(FIELD)
    if not row or row['status'] != temporal['status'] or row['planned_windows'] != temporal['planned_windows']:
        raise serializers.ValidationError('AI须保留全部计划内层窗口及共同区域的计算状态')
    if KEY not in row['evidence_refs'] or any(ref not in facts or facts[ref] is None for ref in row['evidence_refs']):
        raise serializers.ValidationError('跨窗口参数解读须引用实际完整窗口证据')
    score = next(row for row in result['scores'] if row['dimension'] == '参数稳定性')
    if score['score'] is not None:
        cited = set(score['evidence_refs'])
        if KEY not in cited or not supports_score(temporal, cited, stable=False):
            raise serializers.ValidationError('参数稳定性评分须引用全部窗口共同的完整对照及一窗具体尝试；缺测时保持未知')
        if score['score'] > temporal['maximum_score_without_common_region'] and not supports_score(temporal, cited, stable=True):
            raise serializers.ValidationError('没有全部窗口共同支持的区域时参数稳定性最多2分')
    result[VERSION] = expected_version


def instruction(facts: dict) -> str:
    if KEY not in facts:
        return ''
    result = ('temporal_parameter_stability按全部计划外折及内层窗口分别核对同一参数/模式，regions是共同支持的已测离散集合交集，'
        '为避免重复，逐点原始指标只出现在对应attempt_id的inner_evaluation.folds中，按number匹配inner_fold读取，不把number当数组下标；不能用顶层最后窗口metrics代替。'
        'comparison_regions仅表示每窗都有完整同组对照。它优先于只描述最后窗口的parameter_sensitivity和parameter_joint_sensitivity。'
        '必须额外返回temporal_parameter_review:{status:逐字复制根status,planned_windows:逐字复制计划窗口总数,text:解释共同区段、逐窗差异及缺测失败,evidence_refs:["temporal_parameter_stability"]}。'
        'sampled_region仅表示至少一组在全部窗口有共同候选，其他组仍可不足；必须准确命名父代、参数、固定模式及实际离散值。'
        '无共同区域时明确无支持，不能只选最后窗口、最好的窗口或平均值掩盖反例。缺失窗口保留未知，不插值，不据重叠窗口宣称独立、显著性或最优。'
        '参数稳定性非空评分额外引用temporal_parameter_stability及一窗完整具体对照（单轴至少三点或联合完整至少四点，含实际参考）。'
        '只有所有计划窗口都有同组完整对照才可评分；有对照但无共同稳定区域时最多2分，否则null。3–5分还须存在所有窗口共同支持的区域。'
        '共同区域仅用于提出新数据复核，不表示收益有效或晋级；外层测试不参与本证据计算。不输出temporal_parameter_review_version，系统写入。')
    from .window_review import instruction as window_instruction
    return result + window_instruction(facts)


def markdown(result: dict) -> list[str]:
    if result.get(VERSION) not in (1, 2):
        return []
    row = result[FIELD]
    status = {'sampled_region': '存在待复核的共同离散区域', 'no_supported_region': '没有共同支持的稳定区域',
              'insufficient_comparison': '完整跨窗口对照不足'}[row['status']]
    parts = ['', '## 跨窗口参数复核', '', f"计划{row['planned_windows']}个内层窗口 · {status}", '',
        row['text'], '', '证据：' + '、'.join(row['evidence_refs'])]
    if result.get(VERSION) == 2:
        from .window_review import markdown as window_markdown
        parts += window_markdown(row)
    return parts
