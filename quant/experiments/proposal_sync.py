"""Reconstruct AI proposals from versioned evidence; never authorize execution."""
from quant.models import ExperimentProposal
from quant.research.contracts import digest
from .review_sync import review_evidence_from_rows
from .proposal_contract import proposal_data
from .proposals import adapted


def validate_proposals(rows: dict, fail) -> None:
    proposals = rows.get('quant.experimentproposal', {})
    runs = rows.get('quant.airun', {})
    reports = {str(fields.get('run')): identity for identity, fields in rows.get('quant.researchreport', {}).items()}
    def eligible(run):
        return run.get('status') == 'completed' and (
            (run.get('kind') == 'feedback_review' and run.get('result', {}).get('feedback_planning_version') == 1 and bool(run.get('result', {}).get('feedback_proposal')))
            or
            (run.get('kind') == 'experiment_review' and run.get('review_version') in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12) and bool(run.get('result', {}).get('proposal')))
            or (run.get('kind') == 'analyze' and run.get('result', {}).get('initial_planning_version') == 1 and bool(run.get('result', {}).get('initial_proposal'))))
    seen = set()
    for identity, fields in proposals.items():
        run_id = str(fields.get('run'))
        run = runs.get(run_id, {})
        if run_id in seen or not eligible(run) or run_id not in reports:
            fail('AI 实验方案归属、版本或状态无效')
        seen.add(run_id)
        if run['kind'] == 'feedback_review':
            from quant.feedback.planning import feedback_data
            from quant.feedback.sync import for_run_rows
            expected = feedback_data(run['result'], for_run_rows(run, rows, fail))
        elif run['kind'] == 'analyze':
            from .initial_planning import initial_data
            expected = initial_data(run['result'], reports[run_id])
        else:
            expected = proposal_data(run['result'], review_evidence_from_rows(run, rows, fail))
        if identity != digest(['experiment-proposal-v1', run_id])[:40] or fields.get('data') != expected or fields.get('content_hash') != digest(expected):
            fail('AI 实验方案与研究依据不一致')
    expected_runs = {identity for identity, run in runs.items() if eligible(run)}
    if seen != expected_runs:
        fail('已完成研究解读的实验方案记录不完整')
    parents = {}
    for request_id, request in rows.get('quant.experimentrequest', {}).items():
        plan = request['plan']
        if plan['version'] != 2:
            continue
        proposal = proposals.get(plan['proposal_id'], {})
        run = runs.get(str(proposal.get('run')), {})
        entry = rows.get('quant.entry', {}).get(str(run.get('entry')), {})
        if entry.get('anthology') != request['anthology'] or proposal.get('content_hash') != plan['proposal_hash'] or plan['proposal_adapted'] != adapted(plan, proposal['data']):
            fail('实验与 AI 提案的归属或修改标记不一致')
        # A proposal derived from a result cannot be the source of that result.
        result_id = run.get('experiment_result')
        if run.get('kind') == 'feedback_review':
            result_id = rows['quant.sourcerevision'][str(run['source'])]['payload']['experiment_result_id']
        source_result = rows.get('quant.experimentresult', {}).get(str(result_id), {})
        parents[request_id] = str(source_result.get('request'))
    visited = set()
    for identity in parents:
        path = set()
        while identity in parents and identity not in visited:
            if identity in path:
                fail('实验提案与结果的引用存在循环')
            path.add(identity)
            identity = parents[identity]
        visited.update(path)
    for local in ExperimentProposal.objects.filter(pk__in=proposals):
        fields = proposals[local.pk]
        if fields.get('run') != local.run_id or fields.get('data') != local.data or fields.get('content_hash') != local.content_hash:
            fail('已有 AI 实验方案不可覆盖')
