"""Deterministic property relationships; no vector model or AI scenario is required."""
from quant.algorithms.presentation import profile
from quant.factors.curation import curation_data

WEIGHTS = {'mechanism': 30, 'calculation': 25, 'inputs': 20, 'output': 15, 'parameters': 10}


def similarity(left, right, *, left_profile=None):
    a, b = left_profile or profile(left), profile(right)
    if not a or not b: return None
    def jaccard(x, y):
        x, y = set(x), set(y)
        return len(x & y) / len(x | y) if x | y else 0.0
    axes = {'mechanism': float(a['family'] == b['family'] and a['family'] != 'other'),
        'calculation': jaccard(a['operations'], b['operations']), 'inputs': jaccard(a['inputs'], b['inputs']),
        'output': float(left['output_type'] == right['output_type'] and left['units'] == right['units']),
        'parameters': jaccard(a['parameters'], b['parameters'])}
    return {'method': 'source-algorithm-attributes-v1', 'score': round(sum(WEIGHTS[key] * value for key, value in axes.items()) / 100, 4),
        'axes': {key: {'weight': WEIGHTS[key], 'similarity': value} for key, value in axes.items()},
        'shared': {'operations': sorted(set(a['operations']) & set(b['operations'])), 'inputs': sorted(set(a['inputs']) & set(b['inputs'])),
                   'parameters': sorted(set(a['parameters']) & set(b['parameters']))}}


def append(center, available, selected, edges, *, curations=None):
    ranked = []
    rows = list(available.exclude(pk=center.pk)[:501])
    def curated(candidate):
        values = curation_data(candidate, curations=curations)['curation']
        return {**candidate.data, 'family': values['family'], 'tags': values['tags']}
    center_data = curated(center)
    center_profile = profile(center_data)
    for other in rows[:500]:
        match = similarity(center_data, curated(other), left_profile=center_profile)
        if match and match['score'] >= .35: ranked.append((other, match))
    ranked.sort(key=lambda row: (-row[1]['score'], str(row[0].pk)))
    for other, match in ranked[:8]:
        selected[other.pk] = other
        detail = ('机制30%、计算结构25%、输入20%、输出15%、参数10%；'
            + '共同输入：' + ('、'.join(match['shared']['inputs']) or '无')
            + '；共同计算：' + ('、'.join(match['shared']['operations']) or '无'))
        edges.append({'id': f'attributes:{center.pk}:{other.pk}', 'from': f'factor:{center.pk}', 'to': f'factor:{other.pk}',
            'kind': 'attribute_similar', 'label': '算法属性相似', 'historical': False, 'similarity': match['score'], 'detail': detail,
            'attributes': match})
    return len(rows) > 500 or len(ranked) > 8
