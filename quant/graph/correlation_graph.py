"""Statistical edges never reuse embedding similarity or imply complementarity."""
import json
from django.db.models import Q
from quant.models import FactorRelation
from .correlation import KIND


def append(collection, center, available, selected, edges):
    records = list(FactorRelation.objects.filter(Q(left=center) | Q(right=center), kind=KIND,
        left__report__entry__anthology=collection, right__report__entry__anthology=collection).order_by('-created_at', 'id')[:13])
    ids = {row.right_id if row.left_id == center.pk else row.left_id for row in records[:12]}
    neighbors = {row.pk: row for row in available.filter(pk__in=ids)}
    limited = len(records) > 12
    for record in records[:12]:
        other_id = record.right_id if record.left_id == center.pk else record.left_id
        other = neighbors.get(other_id)
        if not other: continue
        if other_id not in selected and len(selected) >= 21:
            limited = True; continue
        selected[other_id] = other
        value = record.evidence; stats = value['statistics']; counts = stats['counts']
        coefficients = f"Pearson {stats['pearson']}，Spearman {stats['spearman']}" if stats['status'] == 'completed' else '相关系数未定义或有效配对不足'
        edges.append({'id': record.pk, 'from': f'factor:{center.pk}', 'to': f'factor:{other_id}',
            'kind': 'statistical_correlation', 'label': '固定样本输出相关', 'historical': False, 'similarity': None,
            'comparison_id': value['comparison_id'], 'correlation_json': json.dumps(value, ensure_ascii=False, allow_nan=False),
            'detail': f"{stats['start']} → {stats['end']}；共同有效 {counts['common_valid']} / {counts['compared_rows']} 行；{coefficients}。仅限当时参数及对齐规则，不证明等价、互补或收益。"})
    return limited
