"""Mutation services run under the owning collection lock and atomic transaction."""
import json
from django.db import transaction
from rest_framework.exceptions import ValidationError
from quant.models import FactorCandidate, FactorFormulaVersion, FactorFormulaSelection
from quant.research.contracts import digest
from quant.factors.expression import expression_hash
from quant.services import Conflict, touch
from .contracts import definition, authored, version_id, candidate_id, experiment_version, selection_data


def root_of(candidate: FactorCandidate) -> FactorCandidate:
    if candidate.formula_version_id:
        return FactorFormulaVersion.objects.select_related('root__report__entry').get(pk=candidate.formula_version_id).root
    return candidate


@transaction.atomic
def edit(parent: FactorCandidate, request_key: str, definition_json: str, reason: str) -> FactorCandidate:
    try:
        raw = json.loads(definition_json)
    except (ValueError, TypeError) as exc:
        raise ValidationError('公式定义不是完整 JSON') from exc
    value = definition(raw)
    from quant.factors.contracts import Candidate
    parent_definition = definition({key: parent.data[key] for key in Candidate().fields if key != 'evidence'})
    from quant.parameters.bindings import validate_inheritance
    validate_inheritance(value['parameters'], parent_definition['parameters'])
    if digest(value) == digest(parent_definition):
        raise ValidationError('公式定义没有改变，请修改定义后再保存新版本')
    root = root_of(parent)
    data = {'version': 1, 'origin': 'authored', 'parents': [{'id': parent.pk, 'hash': parent.content_hash}],
        'definition': value, 'reason': reason}
    identity = version_id(root.pk, request_key)
    previous = FactorFormulaVersion.objects.filter(pk=identity).select_related('candidate').first()
    if previous:
        if previous.data != data or previous.root_id != root.pk or previous.request_key != request_key:
            raise Conflict('请求标识已用于另一份公式修订')
        return previous.candidate
    candidate_data = authored(data, identity, root.pk)
    child = FactorCandidate.objects.create(id=candidate_id(identity), report=parent.report, ordinal=0,
        formula_version_id=identity, qualification_version=1, admission_version=1, data=candidate_data, content_hash=digest(candidate_data),
        expression_hash=expression_hash(candidate_data))
    FactorFormulaVersion.objects.create(id=identity, root=root, candidate=child, request_key=request_key,
        data=data, content_hash=digest(data))
    from quant.verification.services import qualify
    qualify(child)
    touch(parent.report.entry)
    # These are optional, local rebuildable projections. The definition itself
    # is already durable before indexing runs.
    from quant.graph.indexing import auto_index
    transaction.on_commit(lambda: auto_index(child.report_id))
    return child


@transaction.atomic
def select(candidate: FactorCandidate, request_key: str, expected_selection_id: str, reason: str) -> FactorFormulaSelection:
    root = FactorCandidate.objects.select_for_update().get(pk=root_of(candidate).pk)
    data = selection_data(candidate, reason)
    identity = digest(['factor-formula-selection-1', root.pk, request_key])[:40]
    previous = FactorFormulaSelection.objects.filter(pk=identity).first()
    if previous:
        if previous.candidate_id != candidate.pk or previous.parent_id != expected_selection_id or previous.data != data:
            raise Conflict('请求标识已用于另一份当前版本选择')
        return previous
    if root.formula_selection_id != expected_selection_id:
        raise Conflict('当前研究版本已经改变，请刷新后重新选择')
    row = FactorFormulaSelection.objects.create(id=identity, root=root, candidate=candidate, request_key=request_key,
        parent_id=expected_selection_id, data=data, content_hash=digest(data))
    root.formula_selection_id = row.pk
    root.save(update_fields=['formula_selection_id', 'updated_at'])
    touch(root.report.entry)
    return row


def register_experiment(candidate: FactorCandidate, parent_ids: list[str]) -> None:
    """Called in experiment publication, after every direct parent is durable."""
    parents_by_id = {row.pk: row for row in FactorCandidate.objects.filter(pk__in=parent_ids).select_related('report__entry')}
    parents = [parents_by_id[key] for key in parent_ids]
    roots = {root_of(row).pk for row in parents}
    root_id = next(iter(roots)) if len(roots) == 1 else candidate.pk
    data = experiment_version(candidate, parents)
    FactorFormulaVersion.objects.get_or_create(id=candidate.formula_version_id, defaults={
        'root_id': root_id, 'candidate': candidate, 'request_key': '', 'data': data, 'content_hash': digest(data)})
