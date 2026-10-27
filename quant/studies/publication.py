"""Publish kept hypotheses into the existing formula library without experiment claims."""
import copy
from quant.models import FactorCandidate, FactorFormulaVersion
from quant.factors.expression import expression_hash
from quant.factors.versions.services import root_of
from quant.research.contracts import digest


def ids(generation_id, index):
    identity = digest(['ai-study-version-1', generation_id, index])[:40]
    return identity, digest(['ai-study-candidate-1', identity])[:40]


def version_data(generation_id, row, parents):
    return {'version': 1, 'origin': 'ai_study', 'generation_id': generation_id, 'index': row['index'],
        'parents': [{'id': p.pk, 'hash': p.content_hash} for p in parents],
        'definition': copy.deepcopy(row['definition']), 'reason': row['rationale']}


def candidate_data(value, identity, root_id):
    return copy.deepcopy(value['definition']) | {'evidence': [], 'formula_version': {'version': 1,
        'version_id': identity, 'root_id': root_id, 'origin': 'ai_study',
        'parent_candidate_ids': [p['id'] for p in value['parents']], 'claim': 'ai_research_hypothesis_not_empirical_validation'}}


def publish(generation, row):
    parents_by_id = {p.pk: p for p in FactorCandidate.objects.filter(pk__in=row['parents']).select_related('report__entry')}
    parents = [parents_by_id[key] for key in row['parents']]
    identity, child_id = ids(generation.pk, row['index'])
    roots = {root_of(p).pk for p in parents}
    root_id = next(iter(roots)) if len(roots) == 1 else child_id
    version = version_data(generation.pk, row, parents)
    value = candidate_data(version, identity, root_id)
    child = FactorCandidate.objects.create(id=child_id, report=parents[0].report, ordinal=0, formula_version_id=identity,
        qualification_version=1, admission_version=1, data=value, content_hash=digest(value), expression_hash=expression_hash(value))
    FactorFormulaVersion.objects.create(id=identity, root_id=root_id, candidate=child, request_key='', data=version, content_hash=digest(version))
    from quant.verification.services import qualify
    qualify(child)
    return child_id
