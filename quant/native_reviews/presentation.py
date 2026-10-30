"""Compact per-run status; original model inputs/outputs load only on demand."""
import json
from .policy import get_policy,STAGES,NAMES


def summary(run) -> dict|None:
    if not run.feedback_workflow_version:return None
    from django.db.models import Func, IntegerField
    from django.db import connection
    from .resume import TERMINAL
    from .alignment import acknowledgment
    length_name = 'jsonb_array_length' if connection.vendor == 'postgresql' else 'json_array_length'
    fields = ('id','stage','content_hash','outcome__id','outcome__content_hash',
        'outcome__data__status','outcome__data__output__decision','outcome__data__output__origin',
        'outcome__data__error','outcome__data__elapsed_ms','outcome__data__usage','outcome__data__reused_from')
    steps = list(run.workflow_steps.annotate(issue_count=Func('outcome__data__output__issues', function=length_name,
        output_field=IntegerField())).values(*fields,'issue_count').order_by('ordinal'))
    records=[]
    for row in steps:
        records.append({'stage':row['stage'],'name':NAMES.get(row['stage'],row['stage']),'step_id':row['id'],
            'status':row['outcome__data__status'] or ('running' if run.status=='running' else 'interrupted'),
            'decision':row['outcome__data__output__decision'],'issue_count':row['issue_count'] or 0,
            'origin':row['outcome__data__output__origin'] or 'model','outcome_id':row['outcome__id'],
            'content_hash':row['outcome__content_hash'],'error':row['outcome__data__error'] or '',
            'elapsed_ms':row['outcome__data__elapsed_ms'],'usage':row['outcome__data__usage'],
            'reused_from':row['outcome__data__reused_from']})
    prefix='input__context__native_check__alignment__'
    paths=('status','sample_row_count','compared_start_index','left__first_valid',
           'right__first_valid','compared__missing_mismatch_total',
           'compared__missing_mismatch_examples','compared__omitted_missing_mismatches')
    row=run.workflow_steps.filter(input__context__native_check__alignment__isnull=False).values(
        *(prefix+path for path in paths)).first()
    alignment=None
    if row and row[prefix+'status'] in ('available','unavailable'):
        value=lambda path:row[prefix+path]
        alignment={key:value(key) for key in paths[:3]}
        alignment.update(left={'first_valid':value('left__first_valid')},right={'first_valid':value('right__first_valid')},
            compared={key:value('compared__'+key) for key in ('missing_mismatch_total','missing_mismatch_examples','omitted_missing_mismatches')})
    gate = type(run).objects.filter(pk=run.pk).values_list('result__native_review_gate__status', flat=True).first() if run.status=='completed' else None
    return {'version':run.feedback_workflow_version,'policy':get_policy(run.feedback_workflow_version),'source_report_id':run.audit_report_id or None,'stages':records,
        'alignment_json':json.dumps(acknowledgment(alignment),ensure_ascii=False) if alignment else None,
        'gate_status':gate if run.status=='completed' else None,
        'resume_run_id':run.native_resume_run_id or None,
        'source_id':run.source_id,
        'can_resume':run.feedback_workflow_version==2 and run.status in TERMINAL and not any(row['decision']=='reject' for row in records),
        'remaining_stages':[] if run.status=='completed' else [stage for stage in STAGES if stage not in {row['stage'] for row in steps}]}


def evidence(step) -> dict:
    outcome=getattr(step,'outcome',None)
    return {'stage':step.stage,'name':NAMES[step.stage],'input_hash':step.content_hash,
        'input_json':json.dumps(step.input,ensure_ascii=False),'outcome_hash':outcome.content_hash if outcome else None,
        'outcome_json':json.dumps(outcome.data,ensure_ascii=False) if outcome else None}
