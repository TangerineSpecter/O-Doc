"""Publish distinct AI revisions in the same authorized report transaction."""
from quant.models import FactorCandidate, FactorFormulaVersion
from quant.research.contracts import digest
from quant.factors.expression import expression_hash
from .contracts import identifiers, candidate_data


def version_data(item: dict, parent_id: str, parent_hash: str, report_id: str) -> dict:
    return {'version': 1, 'origin': 'ai_repair', 'parents': [{'id': parent_id, 'hash': parent_hash}],
        'reason': item['summary'], 'report_id': report_id, 'factor_index': item['factor_index'], 'repair_hash': digest(item)}


def publish(report) -> None:
    for item in report.data.get('factor_repair', {}).get('items', []):
        if item['status'] != 'revised': continue
        root, version, identity = identifiers(report.pk, item['factor_index'])
        parent = report.factor_candidates.get(pk=root)
        data = candidate_data(item, report.pk)
        child, _ = FactorCandidate.objects.get_or_create(pk=identity, defaults={'report': report, 'ordinal': 0,
            'formula_version_id': version, 'qualification_version': 1, 'data': data,
            'content_hash': digest(data), 'expression_hash': expression_hash(data)})
        record = version_data(item, root, parent.content_hash, report.pk)
        FactorFormulaVersion.objects.get_or_create(pk=version, defaults={'root': parent, 'candidate': child,
            'request_key': '', 'data': record, 'content_hash': digest(record)})
        from quant.verification.services import qualify
        qualify(child)
