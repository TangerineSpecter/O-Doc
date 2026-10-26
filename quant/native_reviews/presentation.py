"""Compact per-run status; original model inputs/outputs load only on demand."""
import json
from .policy import get_policy,STAGES,NAMES


def summary(run) -> dict|None:
    if not run.feedback_workflow_version:return None
    steps=run._native_audit_steps if hasattr(run,'_native_audit_steps') else list(run.workflow_steps.select_related('outcome').order_by('ordinal'))
    alignment=next((step.input.get('context',{}).get('native_check',{}).get('alignment') for step in steps
        if step.input.get('context',{}).get('native_check',{}).get('alignment')),None)
    from .alignment import acknowledgment
    from .resume import TERMINAL
    records=[]
    for row in steps:
        outcome=getattr(row,'outcome',None);data=outcome.data if outcome else {};output=data.get('output',{})
        records.append({'stage':row.stage,'name':NAMES.get(row.stage,row.stage),'step_id':row.pk,
            'status':data.get('status','running' if run.status=='running' else 'interrupted'),'decision':output.get('decision'),
            'issue_count':len(output.get('issues',[])),'origin':output.get('origin','model'),
            'outcome_id':outcome.pk if outcome else None,'content_hash':outcome.content_hash if outcome else None,
            'error':data.get('error',''),'elapsed_ms':data.get('elapsed_ms'),'usage':data.get('usage'),
            'reused_from':data.get('reused_from')})
    return {'version':run.feedback_workflow_version,'policy':get_policy(run.feedback_workflow_version),'source_report_id':run.audit_report_id or None,'stages':records,
        'alignment_json':json.dumps(acknowledgment(alignment),ensure_ascii=False) if alignment else None,
        'gate_status':run.result.get('native_review_gate',{}).get('status') if run.status=='completed' else None,
        'resume_run_id':run.native_resume_run_id or None,
        'source_id':run.source_id,
        'can_resume':run.feedback_workflow_version==2 and run.status in TERMINAL and not any(row['decision']=='reject' for row in records),
        'remaining_stages':[] if run.status=='completed' else [stage for stage in STAGES if stage not in {row.stage for row in steps}]}


def evidence(step) -> dict:
    outcome=getattr(step,'outcome',None)
    return {'stage':step.stage,'name':NAMES[step.stage],'input_hash':step.content_hash,
        'input_json':json.dumps(step.input,ensure_ascii=False),'outcome_hash':outcome.content_hash if outcome else None,
        'outcome_json':json.dumps(outcome.data,ensure_ascii=False) if outcome else None}
