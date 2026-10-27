"""Direct graph observations, bounded and scoped to the exact formula version."""
from quant.models import FactorEvidenceLink, ResearchReport
from django.db.models import OuterRef, Subquery
from quant.research.contracts import digest

LIMIT = 12
KINDS = {
    'experiment': ('experiment', '受控实验', '实验记录'),
    'feedback': ('feedback', '外部反馈', '用户观察（未核实）'),
    'fixed_validation': ('validation', '固定验证', '登记后评价'),
    'native_python': ('native', '原始Python验证', '原函数输出对照'),
    'comparison': ('comparison', '固定样本对照', '直接样本对照'),
}


def describe(kind: str, data: dict) -> str:
    if kind == 'experiment':
        attempts = data.get('attempts', [])
        evaluated = sum(row.get('status') == 'evaluated' for row in attempts)
        return f"状态 {data.get('result_status', '未知')}；直接尝试 {len(attempts)} 项，已评价 {evaluated} 项，其余失败、拒绝或未完成均保留。"
    if kind == 'feedback':
        if data.get('scope') == 'native_python_analysis_document':
            return '原始Python验证的解读材料，来自已保存的同一计算；不是另一份外部成交、独立样本或新增实证。'
        return f"{data.get('platform') or '平台未知'}；类型 {data.get('mode', 'unknown')}；用户提供，平台真实性未核实，不晋升实证等级。"
    if kind == 'fixed_validation':
        assessment = data.get('criteria_assessment', {})
        return f"状态 {data.get('result_status', 'completed')}；登记标准 {assessment.get('eligibility', '未登记或未知')}；固定实际参数，保留不满足标准的结果。"
    if kind == 'native_python':
        return f"状态 {data.get('status', '未知')}；输出对照 {data.get('verdict') or '未完成'}；仅限定函数、显式参数与固定样本。"
    return f"状态 {data.get('evaluation_status', '未知')}；对照 {data.get('verdict', '未知')}；保留不一致、证据不足和失败，不推断全局等价。"


def append(collection, center, nodes: list, edges: list) -> bool:
    latest_report = ResearchReport.objects.filter(entry=center.report.entry,
        source_id=OuterRef('target_id')).order_by('-created_at', 'id').values('id')[:1]
    records = list(FactorEvidenceLink.objects.filter(candidate=center,
        candidate__report__entry__anthology=collection, candidate__report__entry__is_valid=True,
        kind__in=KINDS).annotate(feedback_report=Subquery(latest_report)).order_by('-created_at', 'id')[:LIMIT + 1])
    fingerprint = digest(center.data)
    for record in records[:LIMIT]:
        data = record.data
        # Never attach an ancestor's observations to a revised or derived formula.
        if data.get('candidate_hash') != fingerprint:
            continue
        kind, title, label = KINDS[record.kind]
        if data.get('scope') == 'native_python_analysis_document':
            label = '同一次原函数验证的解读材料'
        identity = f'evidence:{record.pk}'
        nodes.append({'id': identity, 'kind': kind,
            'label': data.get('title') or title, 'entry_id': center.report.entry_id,
            'report_id': (record.feedback_report or '') if record.kind == 'feedback' else '',
            'evidence': {'id': record.pk, 'kind': record.kind, 'target_id': record.target_id,
                'target_hash': data['target_hash'], 'candidate_hash': fingerprint,
                'created_at': record.created_at.isoformat(timespec='milliseconds')}})
        edges.append({'id': f'observed:{record.pk}', 'from': f'factor:{center.pk}', 'to': identity,
            'kind': 'direct_observation', 'label': label, 'historical': False, 'similarity': None,
            'detail': describe(record.kind, data) + '只关联这份不可变公式与当时输入，不继承祖先收益，也不把记录存在当成有效性通过。'})
    return len(records) > LIMIT
