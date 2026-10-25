"""Explicit source-version baseline, shared by execution and sync replay."""


def cache_for(value: dict, restart_stage: str) -> dict:
    from .contracts import may_reuse
    if not may_reuse('snippets', restart_stage):
        return dict(value, output={}, outcome_id='') if value else value
    return value


def from_run(run) -> dict:
    if not run.resume_run_id:
        return {}
    from quant.models import AIRun
    previous = AIRun.objects.select_related('source', 'resolved_source').get(pk=run.resume_run_id)
    # Same-source retries retain the original cross-source baseline. Otherwise
    # even an unchanged prompt would acquire a different historical context.
    while previous.source_id == run.source_id:
        if not previous.resume_run_id:
            return {}
        previous = AIRun.objects.select_related('source', 'resolved_source').get(pk=previous.resume_run_id)
    source = previous.resolved_source or previous.source
    step = previous.workflow_steps.filter(stage='snippets').select_related('outcome').first()
    outcome = getattr(step, 'outcome', None) if step else None
    completed = bool(outcome and outcome.data['status'] == 'completed')
    return {'run_id': previous.pk, 'source_id': source.pk, 'source_hash': source.content_hash,
        'outcome_id': outcome.pk if completed else '', 'output': outcome.data['output'] if completed else {},
        'payload': source.payload, 'analysis': previous.result}


def from_rows(previous_id: str, rows: dict) -> dict:
    if not previous_id:
        return {}
    previous = rows['quant.airun'][previous_id]
    source_id = previous.get('resolved_source') or previous['source']
    source = rows['quant.sourcerevision'][source_id]
    step_id = next((key for key, item in rows.get('quant.workflowstep', {}).items()
                    if item['run'] == previous_id and item['stage'] == 'snippets'), '')
    identity, outcome = next(((key, item) for key, item in rows.get('quant.workflowoutcome', {}).items()
        if item['step'] == step_id and item['data']['status'] == 'completed'), ('', {}))
    return {'run_id': previous_id, 'source_id': source_id, 'source_hash': source['content_hash'],
        'outcome_id': identity, 'output': outcome.get('data', {}).get('output', {}),
        'payload': source['payload'], 'analysis': previous.get('result', {})}


def resolve_rows(run: dict, rows: dict) -> dict:
    identity = run.get('resume_run_id', '')
    while identity and rows['quant.airun'][identity]['source'] == run['source']:
        identity = rows['quant.airun'][identity].get('resume_run_id', '')
    return from_rows(identity, rows)
