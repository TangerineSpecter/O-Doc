"""Versioned input to embeddings: research meaning, never provider IDs or raw code."""
import json
import math
from quant.models import FactorCandidate
from quant.factors.curation import curation_data
from quant.research.contracts import digest

PROJECTION_VERSION = 1
MAX_CHARS = 16000


def projection(candidate: FactorCandidate, *, curations: dict[str, dict] | None = None) -> tuple[str, str]:
    curated = curation_data(candidate, curations=curations)['curation']
    return projection_data(candidate.data, curated)


def projection_data(data: dict, curated: dict) -> tuple[str, str]:
    body = {'version': PROJECTION_VERSION, 'name': curated['name'], 'family': curated['family'],
        'aliases': curated['aliases'], 'tags': curated['tags'], 'note': curated['note'],
        **{key: data[key] for key in ('role', 'summary', 'formula', 'inputs', 'output_type', 'units',
            'timeframe', 'dependencies', 'limitations')},
        'parameters': [{key: row[key] for key in ('name', 'type', 'default_value', 'meaning', 'constraints')}
            for row in data['parameters']]}
    text = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    if len(text) > MAX_CHARS:
        raise ValueError('候选研究描述超过向量输入上限')
    return text, digest(body)


def cosine(left: list, right: list) -> float | None:
    if not left or len(left) != len(right) or len(left) > 8192:
        return None
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in [*left, *right]):
        return None
    a, b = math.hypot(*left), math.hypot(*right)
    if not a or not b or not math.isfinite(a) or not math.isfinite(b):
        return None
    return max(-1.0, min(1.0, math.fsum((x / a) * (y / b) for x, y in zip(left, right))))
