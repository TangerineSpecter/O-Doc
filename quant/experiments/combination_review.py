"""Exhaustive AI interpretation bound to program-computed marginal facts."""
import copy
from rest_framework import serializers
from quant.research.contracts import digest
from .combination import PREFIX


class CombinationReview(serializers.Serializer):
    evidence_ref = serializers.CharField(max_length=100)
    text = serializers.CharField(max_length=2000)
    facts = serializers.JSONField(required=False)


def validate(raw: dict, result: dict, facts: dict | None) -> None:
    rows = result.get('combination_reviews')
    if facts is not None and 'combination_analysis' not in facts:
        if rows is not None:
            raise serializers.ValidationError('旧版解读不能追加组合增量结论')
        return
    if facts is not None and rows is None:
        raise serializers.ValidationError('AI须解释全部双父代组合，含失败和缺测')
    if rows is None:
        return
    expected = {key: row for key, row in (facts or {}).items() if key.startswith(PREFIX)}
    seen = set()
    for row in rows:
        key = row['evidence_ref']
        if key in seen or not key.startswith(PREFIX):
            raise serializers.ValidationError('组合解读引用无效或重复')
        seen.add(key)
        if facts is None:
            continue
        if key not in expected:
            raise serializers.ValidationError('组合解读引用不存在的对照')
        if 'facts' in row and digest(row['facts']) != digest(expected[key]):
            raise serializers.ValidationError('组合增量、实际区间与缺测事实不可改写')
        row['facts'] = copy.deepcopy(expected[key])
    if facts is not None and seen != set(expected):
        raise serializers.ValidationError('组合解读遗漏组合或失败尝试')
    rows.sort(key=lambda row: row['evidence_ref'])


def instruction(facts: dict) -> str:
    if 'combination_analysis' not in facts:
        return ''
    return ('必须返回combination_reviews数组，逐项覆盖全部combination:尝试ID证据；没有组合时返回空数组。'
        '每项{evidence_ref:完整组合证据键,text:最多2000字的中文解读}，不输出facts，由系统绑定原始数值。'
        '每项结合全部训练/验证窗口的同成本对照，比较组合与两个直接父代的收益、回撤、换手和失败缺测；'
        '说明不同窗口的差异，不得只选择有利窗口。values顺序为父代1、父代2、组合；增量为组合减父代，'
        '回撤和换手的正差意味着增加。return_over_best_parent为超过较高收益父代的差值，'
        'drawdown_over_lower_parent为相对较低回撤父代的差值；两个最佳值可能来自不同父代。'
        '标签IC与覆盖率另列，不得当作成交收益。unknown不能补0，失败状态即使有保留指标也须说明。'
        '父代本身可为组合，不将直接父代增量归因到所有叶子因子；相同样本内更好仍只是描述性观察，'
        '不证明因果互补、显著性、独立样本外或盈利。低相关和语义相似度均不能替代组合对照。')


def markdown(result: dict) -> list[str]:
    if 'combination_reviews' not in result:
        return []
    rows = result['combination_reviews']
    parts = ['## 组合与直接父代的增量对照',
        '同一请求、相同成本的训练/验证比较；未使用最终留出，不改变原选择。正收益差表示更高，正回撤/换手差表示增加。']
    if not rows:
        return parts + ['本轮没有已记录的双父代组合，组合价值尚未知。']
    def number(value):
        return '未知' if value is None else f'{value:+.6f}'
    for row in rows:
        facts = row['facts']
        parts += [f"### {facts['attempt_id']} · {' + '.join(facts['parent_ids'])}",
            f"尝试状态：{facts['status']}；{facts['reason'] or '无额外失败说明'}。"]
        for window in facts['windows']:
            label = f"外折{facts['outer_fold'] or '—'} / 内层{window['inner_fold'] or '—'}"
            for part, title in (('train', '训练'), ('validation', '验证')):
                metric = window['parts'][part]
                delta = metric['deltas']
                span = metric['ranges'][2]
                scope = f"{span['start']} — {span['end']}" if span else '区间未知'
                parts += [f"{label} · {title}（{scope}）：" + (
                    f"收益超过较高父代 {number(delta['return_over_best_parent'])}；回撤相对较低父代 {number(delta['drawdown_over_lower_parent'])}；"
                    f"换手相对父代1/2 {number(delta['versus_parents'][0]['turnover'])} / {number(delta['versus_parents'][1]['turnover'])}。"
                    if delta else '不可比较：' + metric['reason'] + '。')]
        parts += [row['text'], '证据：' + row['evidence_ref']]
    return parts
