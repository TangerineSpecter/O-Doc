"""Planned-window facts and exhaustive AI coverage, independent of score gates."""
import copy
import json
from rest_framework import serializers
from quant.research.contracts import digest

PREFIX = 'temporal_window:'


class WindowReview(serializers.Serializer):
    outer_fold = serializers.IntegerField(min_value=1, max_value=5)
    inner_fold = serializers.IntegerField(min_value=1, max_value=4)
    text = serializers.CharField(max_length=1500)
    evidence_refs = serializers.ListField(child=serializers.CharField(max_length=100), min_length=1, max_length=12)
    facts = serializers.JSONField(required=False)


def project(plan: dict, snapshot: dict, attempts: list[dict], *, canonical_pairs: bool = False) -> dict:
    from .temporal import windows
    policy = plan['config'].get('walk_forward', {})
    if policy.get('version') != 2:
        return {}
    rows, result = snapshot['rows'], {}
    for outer in windows(len(rows), policy, plan['config']['gap']):
        scoped = [row for row in attempts if row.get('fold') == outer['number']]
        for inner in outer['inner_windows']:
            number = inner['number']
            def metrics(attempt):
                return next((row['metrics'] for row in attempt.get('inner_evaluation', {}).get('folds', [])
                    if row['number'] == number), {})
            complete = sum(all(part in metrics(row) for part in ('train', 'validation')) for row in scoped)
            partial = sum(bool(metrics(row)) and not all(part in metrics(row) for part in ('train', 'validation')) for row in scoped)
            baselines = []
            for seed in plan['seeds']:
                attempt = next((row for row in scoped if row['operation'] == 'source_candidate'
                    and row['parents'] == [seed['id']]), None)
                recipe = (attempt or {}).get('recipe')
                actual = ([{'name': name, 'value': recipe['parameters'][key]} for key, name in recipe['parameter_names'].items()]
                    if recipe else None)
                planned = [{'name': name, 'value': copy.deepcopy(value)} for name, value in seed['parameters'].items()]
                if canonical_pairs:
                    planned.sort(key=lambda row:row['name'])
                    if actual is not None:actual.sort(key=lambda row:row['name'])
                baselines.append({'seed_id': seed['id'], 'planned_parameters': planned,
                    'attempt_id': attempt['id'] if attempt else None,
                    'attempt_status': attempt['status'] if attempt else 'not_run',
                    'effective_parameters': actual,
                    'complete_metrics': bool(attempt and all(part in metrics(attempt) for part in ('train', 'validation')))})
            result[f"{PREFIX}{outer['number']}:{number}"] = {
                'outer_fold': outer['number'], 'inner_fold': number,
                'ranges': {part: {'start': rows[start]['timestamp'], 'end': rows[end]['timestamp']}
                    for part, (start, end) in inner['partitions'].items()},
                'attempt_ids': [row['id'] for row in scoped], 'started_attempts': len(scoped),
                'complete_inner_attempts': complete, 'partial_inner_attempts': partial,
                'missing_inner_attempts': len(scoped) - complete - partial,
                'failed_attempts': sum(row['status'] in ('failed', 'rejected') for row in scoped),
                'baselines': baselines,
                'metric_source': 'attempt_id.inner_evaluation.folds matched by number; metrics may survive failed overall attempts'}
    return result


def validate(raw: dict, result: dict, facts: dict | None) -> bool:
    """Copy verified facts ourselves; never take model prose as a numeric record."""
    rows = result.get('window_reviews')
    expected = {key: value for key, value in (facts or {}).items() if key.startswith(PREFIX)}
    if facts is not None and not expected:
        if rows is not None:
            raise serializers.ValidationError('旧版解读不能注入逐窗分析')
        return False
    if facts is not None and rows is None:
        raise serializers.ValidationError('AI须逐个解释全部计划内层窗口，含未执行与缺测窗口')
    if rows is None:
        return False
    original = raw.get('window_reviews', [])
    seen = set()
    for row, source in zip(rows, original):
        if (not isinstance(source, dict) or type(source.get('outer_fold')) is not int
                or type(source.get('inner_fold')) is not int):
            raise serializers.ValidationError('逐窗标识须为整数')
        key = f"{PREFIX}{row['outer_fold']}:{row['inner_fold']}"
        if key in seen:
            raise serializers.ValidationError('逐窗分析不能重复窗口')
        seen.add(key)
        if facts is None:
            continue
        if key not in expected or key not in row['evidence_refs']:
            raise serializers.ValidationError('逐窗分析须绑定本窗口的真实证据')
        allowed = {key, 'temporal_parameter_stability', *expected[key]['attempt_ids']}
        if any(ref not in allowed or ref not in facts for ref in row['evidence_refs']):
            raise serializers.ValidationError('逐窗分析不能引用其他窗口或其他外折尝试')
        if 'facts' in row:
            try:
                matches = digest(row['facts']) == digest(expected[key])
            except (TypeError, ValueError, OverflowError):
                matches = False
            if not matches:
                raise serializers.ValidationError('逐窗实际参数、区间和完整性事实不可改写')
        row['facts'] = copy.deepcopy(expected[key])
    if facts is not None and seen != set(expected):
        raise serializers.ValidationError('逐窗分析遗漏计划窗口或包含不存在的窗口')
    rows.sort(key=lambda row: (row['outer_fold'], row['inner_fold']))
    return True


def instruction(facts: dict) -> str:
    if not any(key.startswith(PREFIX) for key in facts):
        return ''
    return ('temporal_parameter_review还必须包含window_reviews数组，逐个覆盖每个temporal_window:外折:内层证据键，'
        '包括未执行、失败和缺测窗口。每项{outer_fold:整数,inner_fold:整数,text:本窗实际基线/参数差异、训练验证表现及失败缺测说明,'
        'evidence_refs:[本窗完整temporal_window键,可选本窗attempt_ids]}。不能重复、遗漏或借其他窗口的尝试；'
        '具体指标从对应attempt的inner_evaluation.folds按number读取。计划参数和实际配方参数分开，缺失保持未知。'
        '每项最多1500字；总述比较各窗差异，不以简单重复模板代替解读。不输出facts或版本，系统绑定实际事实。')


def markdown(row: dict) -> list[str]:
    def parameters(values):
        if values is None:
            return '未知'
        return '、'.join(item['name']+'='+json.dumps(item['value'],ensure_ascii=False) for item in values) or '无参数'
    statuses = {'evaluated':'已评价', 'failed':'失败', 'rejected':'未通过', 'not_run':'未执行'}
    parts = []
    for window in row.get('window_reviews', []):
        facts = window['facts']
        parts += ['', f"### 外折{window['outer_fold']} · 内层{window['inner_fold']}", '',
            '验证区间：' + facts['ranges']['validation']['start'] + ' — ' + facts['ranges']['validation']['end'],
            f"已启动尝试{facts['started_attempts']}；本窗完整指标{facts['complete_inner_attempts']}，部分指标{facts['partial_inner_attempts']}，缺失指标{facts['missing_inner_attempts']}。失败/拒绝状态{facts['failed_attempts']}（可与保留指标重叠）。"]
        for index, baseline in enumerate(facts['baselines'], 1):
            parts += [f"父代{index}（按原方案顺序）：计划基线{parameters(baseline['planned_parameters'])}；实际配方{parameters(baseline['effective_parameters'])}；{statuses.get(baseline['attempt_status'], '未知状态')}。"]
        parts += ['', window['text'], '', '证据：' + '、'.join(window['evidence_refs'])]
    return parts
