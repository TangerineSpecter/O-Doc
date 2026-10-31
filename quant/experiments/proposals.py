"""Persist AI designs separately from actual experiments and their authorization."""
from quant.admissions.services import compact_prefetch as admission_prefetch
import json
from rest_framework.exceptions import ValidationError
from quant.models import ExperimentProposal
from quant.research.contracts import digest
from .proposal_contract import proposal_data
from .review_evidence import for_run


def publish(run) -> ExperimentProposal | None:
    if run.kind == 'feedback_review' and run.result.get('feedback_proposal'):
        from quant.feedback.planning import feedback_data
        from quant.feedback.evidence import for_run as feedback_context
        data = feedback_data(run.result, feedback_context(run))
    elif run.kind == 'analyze' and run.result.get('initial_proposal'):
        from .initial_planning import initial_data
        data = initial_data(run.result, run.report.pk, run.report.factor_bindings)
    elif run.kind == 'experiment_review' and run.review_version in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) and run.result.get('proposal'):
        data = proposal_data(run.result, for_run(run))
    else:
        return None
    proposal, _ = ExperimentProposal.objects.get_or_create(id=digest(['experiment-proposal-v1', run.pk])[:40],
        defaults={'run': run, 'data': data, 'content_hash': digest(data)})
    return proposal


def presentation(proposal) -> dict:
    from quant.factors.services import candidate_data
    from quant.models import FactorCandidate
    candidates = FactorCandidate.objects.filter(pk__in=[row['id'] for row in proposal.data['seeds']],
        report__entry__is_valid=True, report__entry__anthology_id=proposal.run.entry.anthology_id).select_related(
            'report__entry', 'report__run', 'report__source').prefetch_related('revisions', 'qualifications', admission_prefetch())
    from quant.taxonomy.services import current
    vocabulary = current(proposal.run.entry.anthology_id)
    return {'id': proposal.pk, 'created_at': proposal.created_at.isoformat(), 'content_hash': proposal.content_hash,
        'data_json': json.dumps(proposal.data, ensure_ascii=False, allow_nan=False),
        'candidates': [candidate_data(row, vocabulary) for row in candidates]}


def attach(plan: dict, proposal_id: str, collection_id: str) -> None:
    if not proposal_id:
        return
    proposal = ExperimentProposal.objects.filter(pk=proposal_id, run__entry__anthology_id=collection_id).first()
    if not proposal:
        raise ValidationError('AI 实验方案不存在或不属于当前文集')
    plan.update(version=2, proposal_id=proposal.pk, proposal_hash=proposal.content_hash,
        proposal_adapted=adapted(plan, proposal.data))


def adapted(plan: dict, proposed: dict) -> bool:
    return any(digest(plan[key]) != digest(proposed[key]) for key in ('seeds', 'config', 'name'))
