"""Available parent snapshots for one result, excluding curation and unrelated library."""
import copy
import json
from quant.models import FactorCandidate


def options(plan: dict, derived: list[tuple[str, dict]]) -> list[dict]:
    result = [{key: copy.deepcopy(seed[key]) for key in ('id', 'candidate', 'bindings', 'parameters')} for seed in plan['seeds']]
    known = {row['id'] for row in result}
    for identity, data in sorted(derived):
        if identity in known:
            continue
        result.append({'id': identity, 'candidate': copy.deepcopy(data),
            'bindings': {row['name']: row['name'] for row in data['inputs']},
            'parameters': {row['name']: json.loads(row['default_value']) for row in data['parameters']}})
    return result


def for_result(result) -> list[dict]:
    candidates = FactorCandidate.objects.filter(derived_checkpoint_id__in=result.request.checkpoints.values('id'))
    return options(result.request.plan, list(candidates.values_list('id', 'data')))


def from_rows(request_id: str, rows: dict) -> list[dict]:
    checkpoints = {identity for identity, fields in rows.get('quant.experimentcheckpoint', {}).items() if str(fields.get('request')) == request_id}
    candidates = [(identity, fields['data']) for identity, fields in rows.get('quant.factorcandidate', {}).items()
        if fields.get('derived_checkpoint_id') in checkpoints]
    return options(rows['quant.experimentrequest'][request_id]['plan'], candidates)
