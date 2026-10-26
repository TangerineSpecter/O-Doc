"""Explicit continuation of an immutable, same-context review checkpoint."""
import copy
from rest_framework.exceptions import ValidationError
from quant.models import AIRun
from quant.research.contracts import digest
from .policy import STAGES

TERMINAL=('failed','cancelled','interrupted')
FROZEN=('entry_id','source_id','feedback_workflow_version','requirements','model_id','planning_context','audit_report_id')


def rejected(run):
    return run.workflow_steps.filter(outcome__data__status='completed',outcome__data__output__decision='reject').exists()


def _prefix(rows):
    result={}
    for ordinal,row in enumerate(rows,1):
        if ordinal>3 or row['stage']!=STAGES[ordinal-1]:break
        data=row.get('data')
        if not isinstance(data,dict) or not isinstance(data.get('output'),dict) or not isinstance(data.get('raw'),dict):break
        output=data['output']
        if data.get('status')!='completed' or data.get('error') or data['raw'].get('truncated'):break
        if ordinal==1 and not isinstance(output.get('analysis'),dict):break
        if ordinal==2 and output.get('decision') not in ('accept','revise'):break
        if ordinal==3 and output.get('decision')!='accept':break
        result[row['stage']]={'reference':{key:row[key] for key in ('run_id','step_id','input_hash','outcome_id','content_hash')},
            'output':copy.deepcopy(output)}
        if ordinal>1 and output['decision']=='accept':break
    return result


def _merge(own,ancestor):
    result={}
    for stage in STAGES:
        if stage in own:
            if stage in ancestor and digest(own[stage]['output'])!=digest(ancestor[stage]['output']):ancestor={}
            result[stage]=own[stage]
        elif stage in ancestor:result[stage]=ancestor[stage]
        else:break
    return result


def checkpoints(run,steps=None,*,seen=None):
    seen=set() if seen is None else seen
    if run.pk in seen or len(seen)>64:raise ValidationError('阶段续作链循环或过长')
    seen.add(run.pk);rows=[]
    for step in steps if steps is not None else run.workflow_steps.select_related('outcome').order_by('ordinal'):
        outcome=getattr(step,'outcome',None)
        rows.append({'run_id':run.pk,'stage':step.stage,'step_id':step.pk,'input_hash':step.content_hash,
            'outcome_id':outcome.pk if outcome else None,'content_hash':outcome.content_hash if outcome else None,
            'data':outcome.data if outcome else None})
    parent=AIRun.objects.filter(pk=run.native_resume_run_id).first() if run.native_resume_run_id else None
    return _merge(_prefix(rows),checkpoints(parent,seen=seen) if parent else {})


def from_rows(identity,rows):
    outcomes={row['step']:(key,row) for key,row in rows.get('quant.workflowoutcome',{}).items()}
    by_run={}
    for key,row in rows.get('quant.workflowstep',{}).items():by_run.setdefault(row['run'],[]).append((key,row))
    def resolve(key,seen):
        if key in seen or len(seen)>64:raise ValidationError('阶段续作链循环或过长')
        seen={*seen,key};steps=sorted(by_run.get(key,[]),key=lambda pair:pair[1]['ordinal'])
        own=_prefix([{'run_id':key,'stage':row['stage'],'step_id':step_id,'input_hash':row['content_hash'],
            'outcome_id':outcomes.get(step_id,(None,{}))[0],'content_hash':outcomes.get(step_id,(None,{}))[1].get('content_hash'),
            'data':outcomes.get(step_id,(None,{}))[1].get('data')} for step_id,row in steps])
        parent=rows['quant.airun'][key].get('native_resume_run_id','')
        return _merge(own,resolve(parent,seen) if parent else {})
    return resolve(identity,set())


def prepare(entry,source,values,existing=None):
    identity=values.get('native_resume_run_id','')
    if not identity:return None
    from quant.worker import recover
    previous=AIRun.objects.filter(pk=identity,entry=entry,source=source,kind='feedback_review',feedback_workflow_version=2).first()
    if not previous or recover(previous).status not in TERMINAL or values.get('audit_report_id'):
        raise ValidationError('请选择同一Python反馈中已停止的事实审查任务')
    if rejected(previous):raise ValidationError('原稿已被事实审查明确拒绝，请重新生成完整AI解读；不能复用同一原稿反复申请通过')
    seen=set();ancestor=previous
    while ancestor:
        if ancestor.pk in seen or len(seen)>=64:raise ValidationError('阶段续作链已达上限，请新建完整解读')
        seen.add(ancestor.pk)
        ancestor=AIRun.objects.filter(pk=ancestor.native_resume_run_id).first() if ancestor.native_resume_run_id else None
    for key in ('requirements','model_id'):
        if values.get(key) and values[key]!=getattr(previous,key):
            raise ValidationError('阶段续作须保留原模型选择与研究要求；修改输入请新建完整解读')
        values[key]=getattr(previous,key)
    values['feedback_workflow_version']=previous.feedback_workflow_version
    if previous.audit_report_id:values['audit_report_id']=previous.audit_report_id
    if existing and existing.native_resume_run_id!=identity:
        raise ValidationError('已有请求不能替换阶段续作来源')
    return previous


def validate_links(runs,rows,fail):
    """Every retained source remains in the snapshot and is independently checked."""
    rejected_steps={row['step'] for row in rows.get('quant.workflowoutcome',{}).values() if isinstance(row.get('data'),dict)
        and row['data'].get('status')=='completed' and isinstance(row['data'].get('output'),dict) and row['data']['output'].get('decision')=='reject'}
    rejected_runs={row['run'] for key,row in rows.get('quant.workflowstep',{}).items() if key in rejected_steps}
    for identity,run in runs.items():
        parent_id=run.get('native_resume_run_id','')
        if not isinstance(parent_id,str) or len(parent_id)>40:fail('Python阶段续作身份无效')
        if not parent_id:continue
        if run.get('kind')!='feedback_review' or run.get('feedback_workflow_version')!=2 or run.get('workflow_version') or run.get('resume_run_id') or run.get('restart_stage'):
            fail('Python阶段续作不能转为其他工作流')
        seen={identity};child=run
        while parent_id:
            if not isinstance(parent_id,str) or len(parent_id)>40:fail('Python阶段续作链身份无效')
            parent=runs.get(parent_id)
            if not parent or parent_id in seen or len(seen)>64 or parent_id in rejected_runs:fail('Python阶段续作链缺失、循环、过长或原稿已被明确拒绝')
            from quant.research_memory.contract import instant
            fields={'entry_id':'entry','source_id':'source'}
            if (parent.get('kind')!='feedback_review' or parent.get('status') not in TERMINAL
                    or any(digest(parent.get(fields.get(key,key),''))!=digest(child.get(fields.get(key,key),'')) for key in FROZEN)
                    or instant(parent['created_at'])>instant(child['created_at'])):
                fail('Python阶段续作修改了来源、模型、记忆或先后顺序')
            seen.add(parent_id);child=parent;parent_id=parent.get('native_resume_run_id','')
