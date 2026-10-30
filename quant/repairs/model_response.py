"""Keep valid optional model repairs; explicitly retain original candidates otherwise."""
from collections import Counter
from rest_framework.exceptions import ValidationError
from .contracts import plan


def unresolved(index: int, reason: str) -> dict:
    return {'factor_index': index, 'status': 'unresolved', 'summary': reason,
        'definition': None, 'evidence': [],
        'remaining_unknowns': ['原候选保留，未解决的定义和平台限制仍需核对。']}


def normalize(value: object, factors: list[dict], validate_candidate, *, unavailable: bool = False) -> dict:
    """Validate each proposed repair with all other targets explicitly unresolved.

    The normal strict validator still checks the resulting complete snapshot,
    including provenance, scope, evidence and sync restoration.
    """
    selected = plan(factors)['selected']
    reason = '模型修订未完成，保留原候选。' if unavailable else '模型修订未通过检查，保留原候选。'
    fallback = {index: unresolved(index, reason) for index in selected}
    if not isinstance(value, dict) or set(value) - {'version', 'selected', 'omitted', 'items'} or not isinstance(value.get('items'), list):
        return {'items': list(fallback.values())}
    scope = plan(factors)
    if ('version' in value and (type(value['version']) is not int or value['version'] != 1)
            or any(key in value and (not isinstance(value[key], list)
                or any(type(index) is not int for index in value[key]) or value[key] != scope[key])
                for key in ('selected', 'omitted'))):
        return {'items': list(fallback.values())}
    rows = [row for row in value['items'] if isinstance(row, dict) and type(row.get('factor_index')) is int]
    counts = Counter(row['factor_index'] for row in rows)
    for row in rows:
        index = row['factor_index']
        if index not in fallback or counts[index] != 1:
            continue
        probe = {'items': [row if number == index else fallback[number] for number in selected]}
        try:
            validate_candidate(probe)
        except ValidationError:
            continue
        fallback[index] = row
    return {'items': [fallback[index] for index in selected]}
