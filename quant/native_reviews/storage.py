"""Append-only inputs and outcomes; execution leases stay in the local Job."""
import copy
import hashlib
import time
from django.db import transaction
from quant.locking import collection_lock
from quant.models import WorkflowStep,WorkflowOutcome,Job
from quant.research.contracts import digest
from quant.workflows.runner import model_identity
from .contracts import model_context,draft_projection,MAX_RAW
from .policy import NAMES


def input_snapshot(stage:str,ordinal:int,context:dict,requirements:str,model:dict,*,draft=None,source_report=None,version=4) -> dict:
    value={'version':version,'method':'native-report-review-v1','stage':stage,'ordinal':ordinal,
        'context_hash':digest(context),'context':model_context(context),'requirements':requirements,
        'model':copy.deepcopy(model),'draft':draft_projection(draft) if draft is not None else None,'source_report':source_report}
    if version>=2:
        from . import prompts
        prompt_version=3 if version>=4 else 2 if version>=3 else 1
        value['prompt']=None if not model else prompts.generation(context,requirements,version=prompt_version) if stage=='native_draft' else prompts.review(context,draft,requirements,can_revise=stage=='native_audit',version=prompt_version)
    return value


def start(run,stage:str,ordinal:int,context:dict,config:dict,check,*,draft=None,source_report=None):
    model={} if stage=='native_draft' and source_report else model_identity(config)
    value=input_snapshot(stage,ordinal,context,run.requirements,model,draft=draft,source_report=source_report)
    with collection_lock(run.entry.anthology_id),transaction.atomic():
        check()
        step=WorkflowStep.objects.create(id=digest(['workflow-step-1',run.pk,ordinal])[:40],run=run,
            ordinal=ordinal,stage=stage,input=value,content_hash=digest(value))
        Job.objects.filter(run=run).update(stage=NAMES[stage],preview=NAMES[stage])
    return step


def raw_capture(raw:str) -> dict:
    return {'text':raw[:MAX_RAW],'total_chars':len(raw),'sha256':hashlib.sha256(raw.encode()).hexdigest(),'truncated':len(raw)>MAX_RAW}


def usage(run_id:str,stage:str) -> dict:
    from system_settings.token_usage.models import AgentTokenUsage
    rows=list(AgentTokenUsage.objects.filter(record_key=run_id,purpose='quant',phase=f'native_review.{stage}'))
    return {'request_count':len(rows),'event_ids':[row.pk for row in rows],**{
        key:sum(getattr(row,key) for row in rows) if rows and all(getattr(row,key) is not None for row in rows) else None
        for key in ('input_tokens','output_tokens','total_tokens')}}


def finish(step,status:str,output:dict,raw:str,error:str,started:float,run,check):
    value={'version':2,'method':'native-report-review-v1','status':status,'output':output,'raw':raw_capture(raw),'error':error,
        'elapsed_ms':max(0,round((time.monotonic()-started)*1000)),'usage':usage(run.pk,step.stage) if step.input['model'] else {
            'request_count':0,'event_ids':[],'input_tokens':None,'output_tokens':None,'total_tokens':None}}
    with collection_lock(run.entry.anthology_id),transaction.atomic():
        check()
        return WorkflowOutcome.objects.create(id=digest(['workflow-outcome-1',step.pk])[:40],step=step,data=value,content_hash=digest(value))
