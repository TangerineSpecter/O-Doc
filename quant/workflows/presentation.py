"""Compact progress for entry pages; full stage evidence is loaded on demand."""
import json
from .contracts import stages as stage_order, budget, NAMES, uses_snippets


def summary(run) -> dict | None:
    if not run.workflow_version:
        return None
    fields = ('id', 'stage', 'content_hash', 'input__model__model_name', 'input__vocabulary_ref',
              'outcome__id', 'outcome__data__status', 'outcome__data__reused_from', 'outcome__data__error',
              'outcome__data__elapsed_ms', 'outcome__data__usage')
    rows = {row['stage']: row for row in run.workflow_steps.values(*fields)}
    # Project just the two auxiliary outputs, never the large extraction bodies.
    from .optional_analysis import incomplete_reason
    incomplete = {row['stage']: incomplete_reason(row['stage'], row['outcome__data__output'] or {})
        for row in run.workflow_steps.filter(stage__in=('review', 'plan')).values('stage', 'outcome__data__output')}
    stages = []
    for stage in stage_order(run.workflow_version):
        step = rows.get(stage)
        has_outcome = bool(step and step['outcome__id'])
        value = lambda key, default=None: step.get('outcome__data__' + key, default) if step else default
        state = ('reused' if value('reused_from') else value('status')) if has_outcome else (
            'running' if run.status == 'running' else 'interrupted') if step else 'waiting'
        if incomplete.get(stage):
            state = 'partial'
        stages.append({'stage': stage, 'name': NAMES[stage], 'status': state,
            'step_id': step['id'] if step else '', 'input_hash': step['content_hash'] if step else '',
            'outcome_id': step['outcome__id'] if has_outcome else '', 'reused_from': value('reused_from') or '',
            'error': incomplete.get(stage) or value('error') or '', 'elapsed_ms': value('elapsed_ms'),
            'usage': value('usage'), 'model_name': step['input__model__model_name'] or '' if step else ''})
    max_calls, max_seconds = budget(run.workflow_version)
    local_reading = None
    if 'snippets' in rows:
        from django.db import connection
        if connection.vendor == 'postgresql':
            selected = "jsonb_array_length(input->'snippet_plan'->'units')"
            reused = "(SELECT COUNT(*) FROM jsonb_array_elements(input->'snippet_plan'->'units') u WHERE u->'reused_from' NOT IN ('{}'::jsonb, 'null'::jsonb))"
        else:
            selected = "json_array_length(input, '$.snippet_plan.units')"
            reused = "(SELECT COUNT(*) FROM json_each(input, '$.snippet_plan.units') u WHERE json_extract(u.value, '$.reused_from') NOT IN ('{}', 'null', ''))"
        plan = run.workflow_steps.filter(stage='snippets', input__snippet_plan__isnull=False).extra(
            select={'selected_count': selected, 'reused_count': reused}).values(
                'selected_count', 'reused_count', 'input__snippet_plan__omitted', 'input__snippet_plan__baseline__run_id').first()
        if plan:
            local_reading = {'selected': plan['selected_count'], 'reused': plan['reused_count'],
                'omitted': plan['input__snippet_plan__omitted'], 'baseline_run_id': plan['input__snippet_plan__baseline__run_id'] or ''}
    return {'version': run.workflow_version, 'resume_run_id': run.resume_run_id, 'restart_stage': run.restart_stage,
        **({'vocabulary_reference': rows['normalize']['input__vocabulary_ref']} if 'normalize' in rows and rows['normalize']['input__vocabulary_ref'] is not None else {}),
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
