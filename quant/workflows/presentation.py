"""Compact progress for entry pages; full stage evidence is loaded on demand."""
import json
from .contracts import stages as stage_order, budget, NAMES, uses_snippets


def summary(run) -> dict | None:
    if not run.workflow_version:
        return None
    rows = {row.stage: row for row in run.workflow_steps.select_related('outcome')}
    stages = []
    for stage in stage_order(run.workflow_version):
        step = rows.get(stage)
        outcome = getattr(step, 'outcome', None) if step else None
        value = outcome.data if outcome else {}
        state = ('reused' if value.get('reused_from') else value['status']) if outcome else (
            'running' if run.status == 'running' else 'interrupted') if step else 'waiting'
        stages.append({'stage': stage, 'name': NAMES[stage], 'status': state,
            'step_id': step.pk if step else '', 'input_hash': step.content_hash if step else '',
            'outcome_id': outcome.pk if outcome else '', 'reused_from': value.get('reused_from', ''),
            'error': value.get('error', ''), 'elapsed_ms': value.get('elapsed_ms'),
            'usage': value.get('usage'), 'model_name': step.input.get('model', {}).get('model_name', '') if step else ''})
    max_calls, max_seconds = budget(run.workflow_version)
    snippet_step = rows.get('snippets')
    plan = snippet_step.input.get('snippet_plan') if snippet_step else None
    local_reading = ({'selected': len(plan['units']), 'reused': sum(bool(unit['reused_from']) for unit in plan['units']),
        'omitted': plan['omitted'], 'baseline_run_id': plan['baseline'].get('run_id', '')} if plan else None)
    return {'version': run.workflow_version, 'resume_run_id': run.resume_run_id, 'restart_stage': run.restart_stage,
        **({'vocabulary_reference': rows['normalize'].input['vocabulary_ref']} if 'normalize' in rows and 'vocabulary_ref' in rows['normalize'].input else {}),
        'max_model_calls': max_calls, 'max_seconds': max_seconds, 'stages': stages,
        **({'local_reading': local_reading} if uses_snippets(run.workflow_version) else {})}


def evidence(step) -> dict:
    if step.run.feedback_workflow_version:
        from quant.native_reviews.presentation import evidence as native_evidence
        return native_evidence(step)
    outcome = getattr(step, 'outcome', None)
    structure = outcome.data.get('output', {}).get('structure') if outcome and step.stage == 'normalize' else None
    source = (step.run.resolved_source or step.run.source) if structure else None
    # JSON strings preserve exact opaque snapshot keys through camel-case rendering.
    local_reading = None
    if step.stage == 'snippets' and outcome and outcome.data['status'] == 'completed':
        from .snippets import model_context
        local_reading = model_context(outcome.data['output'], step.input['snippet_plan'])
    return {'stage': step.stage, 'name': NAMES[step.stage], 'input_hash': step.content_hash,
        'structure': structure, 'source_code': source.payload.get('code', '') if source else '',
        **({'local_reading_json': json.dumps(local_reading, ensure_ascii=False)} if local_reading else {}),
        **({'model_input_json': json.dumps(step.input['model_input'], ensure_ascii=False)} if 'model_input' in step.input else {}),
        'input_json': json.dumps(step.input, ensure_ascii=False, indent=2),
        'outcome_hash': outcome.content_hash if outcome else '',
        'outcome_json': json.dumps(outcome.data, ensure_ascii=False, indent=2) if outcome else ''}
