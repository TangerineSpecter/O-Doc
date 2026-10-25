"""Generate -> review/revise -> re-review, with at most three model calls."""
import copy
import time
from rest_framework.exceptions import ValidationError
from utils.ai_service import AIService
from utils.token_usage import usage_scope
from quant.models import ResearchReport
from quant.feedback.evidence import for_run
from . import storage
from .contracts import decode,analysis,audit,gate
from .policy import POLICY,NAMES
from .errors import NativeReviewBudget,NativeReviewRejected


def execute(run,config:dict,complete,check,progress) -> dict:
    context=for_run(run);started=time.monotonic();calls=0;outcomes=[];source_report=None
    report=ResearchReport.objects.get(pk=run.audit_report_id) if run.audit_report_id else None
    if report:source_report={'id':report.pk,'content_hash':report.content_hash}

    def stage(name:str,ordinal:int,*,draft=None):
        nonlocal calls
        check()
        if time.monotonic()-started>=POLICY['max_seconds']:raise NativeReviewBudget('Python报告审查达到时间预算，未发布新报告')
        step=storage.start(run,name,ordinal,context,config,check,draft=draft,source_report=source_report)
        progress('stage',NAMES[name],'info',{})
        began=time.monotonic();raw=''
        try:
            if name=='native_draft' and report:
                output={'analysis':copy.deepcopy(report.data),'origin':'report_snapshot','source_report':source_report}
            else:
                if calls>=POLICY['max_model_calls']:raise NativeReviewBudget('Python报告审查达到调用预算，未发布新报告')
                text=step.input['prompt']
                if len(text)>350000:raise ValidationError('Python报告审查材料超过本次上限，原稿已保留')
                remaining=POLICY['max_seconds']-(time.monotonic()-started)
                if remaining<=0:raise NativeReviewBudget('Python报告审查达到时间预算，未发布新报告')
                calls+=1
                with usage_scope(owner_id=run.entry.anthology.user_id,record=run,purpose='quant',phase=f'native_review.{name}'):
                    raw=complete(config,text,json_output=True,max_tokens=24000,extra_body=AIService._thinking_options(config),
                        deadline_seconds=min(POLICY['per_call_seconds'],remaining),allow_retries=False)
                check()
                if time.monotonic()-started>=POLICY['max_seconds']:raise NativeReviewBudget('Python报告审查达到时间预算，未发布新报告')
                value=decode(raw)
                output={'analysis':analysis(value,context),'origin':'model','source_report':None} if name=='native_draft' else audit(value,draft,context,can_revise=name=='native_audit')
            outcome=storage.finish(step,'completed',output,raw,'',began,run,check)
            outcomes.append({'id':outcome.pk,'content_hash':outcome.content_hash})
            return output
        except Exception as error:
            # Cancellation/revocation may deliberately prevent this outcome;
            # the durable input then remains interrupted, with no adopted text.
            if not isinstance(error,InterruptedError):
                storage.finish(step,'failed',{},raw,'budget_exhausted' if isinstance(error,NativeReviewBudget) else 'invalid_model_output' if isinstance(error,ValidationError) else 'model_request_failed',began,run,check)
            raise

    draft=stage('native_draft',1)['analysis']
    reviewed=stage('native_audit',2,draft=draft)
    if reviewed['decision']=='reject':raise NativeReviewRejected('AI事实审查拒绝该解读；未发布新报告，原稿与问题已保留')
    revised=reviewed['decision']=='revise'
    if revised:
        draft=reviewed['analysis']
        final=stage('native_reaudit',3,draft=draft)
        if final['decision']!='accept':raise NativeReviewRejected('修订后仍有问题；达到一次修订上限，未发布新报告，旧报告保留')
    result=copy.deepcopy(draft)
    check()
    if time.monotonic()-started>=POLICY['max_seconds']:raise NativeReviewBudget('Python报告审查达到时间预算，未发布新报告')
    result['native_review_gate']=gate(outcomes,revised=revised,source_report=source_report)
    return result
