"""AI acknowledges every frozen observation while the program owns the numbers."""
import copy
import json
from rest_framework import serializers
from quant.research.contracts import digest
from .output_associations import PREFIX


class AssociationReview(serializers.Serializer):
    evidence_ref = serializers.CharField(max_length=100)
    baseline_scope = serializers.ChoiceField(choices=('current_baselines_match', 'historical_configuration_only'))
    text = serializers.CharField(max_length=2000)
    facts = serializers.JSONField(required=False)


def validate(result: dict, facts: dict | None) -> None:
    selected = result.get('output_association_reviews')
    if facts is not None and 'output_associations' not in facts:
        if selected is not None:
            raise serializers.ValidationError('历史解读不能追加未冻结的输出统计')
        return
    if facts is not None and selected is None:
        raise serializers.ValidationError('AI须解释全部冻结输出统计，没有记录时返回空数组')
    if selected is None:
        return
    expected = {key: value for key, value in (facts or {}).items() if key.startswith(PREFIX)}
    seen = set()
    for row in selected:
        key = row['evidence_ref']
        if key in seen or not key.startswith(PREFIX):
            raise serializers.ValidationError('输出统计解读引用重复或无效')
        seen.add(key)
        if facts is None:
            continue
        value = expected.get(key)
        if value is None or row['baseline_scope'] != value['baseline_scope']:
            raise serializers.ValidationError('输出统计的实际参数适用范围不可改变')
        if 'facts' in row and digest(row['facts']) != digest(value):
            raise serializers.ValidationError('输出统计的系数、参数及指纹事实不可改写')
        row['facts'] = copy.deepcopy(value)
    if facts is not None and seen != set(expected):
        raise serializers.ValidationError('输出统计解读遗漏记录或引用未提供的观察')
    selected.sort(key=lambda row: row['evidence_ref'])


def instruction(facts: dict) -> str:
    if 'output_associations' not in facts:
        return ''
    return ('output_associations为已冻结的历史完整样本统计，不是本轮各训练/验证窗口的新计算；它可能覆盖已查看留出。'
        '必须返回output_association_reviews数组，逐项覆盖每个output_association:关系ID；没有观察时返回空数组。'
        '每项{evidence_ref:完整证据键,baseline_scope:复制该记录的baseline_scope,text:最多2000字中文解释}。'
        '结合原两侧参数、输入列、预热、覆盖率、有效行数和Pearson/Spearman解释正负相关及未知。'
        'historical_configuration_only表示至少一侧与当前规划基线不同，不得将系数移用到新参数；'
        'current_baselines_match也仅说明参数和输入映射相同，不证明本轮子窗口、变体或衍生公式具有该相关性。'
        '相同comparison_id可能也出现在research_memory的comparison记录中，属于同一次对照，不能当两份独立证据累计。'
        'null保持未知，不能当0；不提供p值、独立样本量或收益判断。低相关不证明互补，高相关不证明等价。'
        '不要与语义检索分混用，不按相关系数改写本轮已记录选优、验证等级或评分。'
        '如用于下一轮proposal，须引用真实观察键及父代，明确单独/组合对照与独立新数据需求；'
        '统计没有覆盖的参数和公式只能提出待验证假设。不要输出facts，系统绑定原始记录。')


def markdown(result: dict) -> list[str]:
    if 'output_association_reviews' not in result:
        return []
    parts = ['## 历史固定样本输出统计',
        '以下来自原完整对照样本，可能包含已查看留出；不改变本轮搜索，不代表当前各窗口、独立验证或组合互补。']
    rows = result['output_association_reviews']
    if not rows:
        return parts + ['本次未提供符合候选与行情范围的已保存观察；不能据此推断因子不相关。']
    for row in rows:
        value = row['facts']; stats = value['statistics']
        def coefficient(key):
            return '未知' if stats[key] is None else str(stats[key])
        parts += [f"### {value['comparison_name']}",
            f"原区间：{stats['start']} — {stats['end']}；共同有效{stats['counts']['common_valid']}/{stats['counts']['compared_rows']}行；覆盖率{stats['coverage']:.2%}。",
            f"Pearson {coefficient('pearson')}；Spearman {coefficient('spearman')}；预热{stats['counts']['warmup_rows']}行。",
            '范围：' + ('与当前两侧基线参数/输入一致，仍非本轮逐窗统计。' if row['baseline_scope'] == 'current_baselines_match' else '至少一侧参数或输入与当前基线不同，仅限历史配置。')]
        for side in value['sides']:
            parts += [f"{side['name']}：参数{json.dumps(side['parameters'], ensure_ascii=False)}；输入{json.dumps(side['bindings'], ensure_ascii=False)}。"]
        parts += [row['text'], '证据：' + row['evidence_ref'], '原对照：' + value['comparison_id']]
    return parts
