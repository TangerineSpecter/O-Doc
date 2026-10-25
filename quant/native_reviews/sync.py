"""Reconstruct review inputs/decisions without models, Docker or new jobs."""
import hashlib
import re
from rest_framework.exceptions import ValidationError
from quant.models import AIRun
from quant.research.contracts import digest
from quant.research_memory.contract import instant
from .contracts import MAX_RAW,decode,analysis,audit,gate
from .policy import STAGES
from .storage import input_snapshot


def usage(value:dict,fail):
    keys={'request_count','event_ids','input_tokens','output_tokens','total_tokens'}
    if (not isinstance(value,dict) or set(value)!=keys or type(value['request_count']) is not int or not 0<=value['request_count']<=1
            or not isinstance(value['event_ids'],list) or len(value['event_ids'])!=value['request_count']
            or any(not isinstance(key,str) or not 0<len(key)<=40 for key in value['event_ids'])
            or any(value[key] is not None and (type(value[key]) is not int or value[key]<0) for key in keys-{'request_count','event_ids'})):
        fail('Python报告审查用量格式无效')


def capture(value:dict,fail) -> str:
    if (not isinstance(value,dict) or set(value)!={'text','total_chars','sha256','truncated'} or not isinstance(value['text'],str)
            or type(value['total_chars']) is not int or value['total_chars']<0 or type(value['truncated']) is not bool
            or not isinstance(value['sha256'],str) or not re.fullmatch(r'[0-9a-f]{64}',value['sha256'])):fail('Python审查原始返回记录无效')
    if value['truncated']:
        if value['total_chars']<=MAX_RAW or len(value['text'])!=MAX_RAW:fail('审查返回截断标记无效')
    elif len(value['text'])!=value['total_chars'] or value['total_chars']>MAX_RAW or hashlib.sha256(value['text'].encode()).hexdigest()!=value['sha256']:
        fail('审查原始返回与哈希不一致')
    return value['text']


def validate_workflows(rows:dict,fail) -> set[str]:
    runs=rows.get('quant.airun',{});reports=rows.get('quant.researchreport',{})
    sources=rows.get('quant.sourcerevision',{});all_steps=rows.get('quant.workflowstep',{});all_outcomes=rows.get('quant.workflowoutcome',{})
    selected=set()
    for identity,run in runs.items():
        version=run.get('feedback_workflow_version',0);report_id=run.get('audit_report_id','')
        if type(version) is not int or version not in (0,1) or not isinstance(report_id,str) or len(report_id)>40:
            fail('反馈事实审查版本无效')
        if report_id and not version:fail('旧单次反馈不能追加原稿复核引用')
        if not version:continue
        if run.get('kind')!='feedback_review' or run.get('workflow_version',0) or sources.get(run.get('source'),{}).get('payload',{}).get('feedback_version')!=4:
            fail('事实审查须属于固定Python反馈')
        selected.add(identity)
        seen={identity};current=run
        while current.get('audit_report_id'):
            previous=reports.get(current['audit_report_id'],{});parent=runs.get(previous.get('run'),{})
            if (not previous or parent.get('kind')!='feedback_review' or parent.get('status')!='completed'
                    or previous.get('entry')!=run['entry'] or previous.get('source')!=run['source']
                    or not previous.get('data',{}).get('native_review') or previous.get('run') in seen
                    or instant(previous['created_at'])>instant(current['created_at'])):
                fail('原始Python报告复核引用跨来源、未来记录或循环')
            seen.add(previous['run']);current=parent
    frozen=('feedback_workflow_version','audit_report_id','entry_id','source_id','requirements','model_id','request_key','input_hash','planning_context')
    for local in AIRun.objects.filter(pk__in=runs,feedback_workflow_version=1).values('id',*frozen):
        incoming=runs[local['id']]
        if any(digest(local[key])!=digest(incoming.get(AIRun._meta.get_field(key).name)) for key in frozen):
            fail('已有Python事实审查输入不可覆盖')
    for run_id in selected:
        _validate_run(run_id,runs[run_id],rows,reports,all_steps,all_outcomes,fail)
    return selected


def _validate_run(run_id,run,rows,reports,all_steps,all_outcomes,fail):
    from quant.feedback.sync import for_run_rows
    context=for_run_rows(run,rows,fail)
    steps=sorted([(key,value) for key,value in all_steps.items() if value.get('run')==run_id],key=lambda row:row[1].get('ordinal',0))
    if len(steps)>3 or steps and run['status']=='pending':fail('Python审查阶段预算或状态无效')
    previous=None;outcome_refs=[];revised=False
    source=reports.get(run.get('audit_report_id')) if run.get('audit_report_id') else None
    source_ref={'id':run['audit_report_id'],'content_hash':source['content_hash']} if source else None
    decisions=[]
    for ordinal,(step_id,step) in enumerate(steps,1):
        stage=STAGES[ordinal-1]
        if step.get('ordinal')!=ordinal or step.get('stage')!=stage or step_id!=digest(['workflow-step-1',run_id,ordinal])[:40]:
            fail('Python审查阶段身份或顺序无效')
        if ordinal==3 and (not decisions or decisions[-1]!='revise'):fail('没有一次修订不能进入最终复核')
        if ordinal==2 and previous is None:fail('审查缺少原始解读')
        model=step.get('input',{}).get('model')
        seeded=ordinal==1 and source is not None
        if seeded:
            if model!={}:fail('读取已有原稿不能伪装为新模型调用')
        elif (not isinstance(model,dict) or set(model)!={'model_id','model_name','provider_type','configuration_hash'}
                or any(not isinstance(value,str) or len(value)>200 for value in model.values()) or model['model_id']!=run['model_id']
                or not re.fullmatch(r'[0-9a-f]{64}',model['configuration_hash'])):
            fail('Python审查模型身份无效')
        input_version=step.get('input',{}).get('version')
        if type(input_version) is not int or input_version not in (1,2,3,4):fail('Python审查固定输入版本无效')
        expected=input_snapshot(stage,ordinal,context,run['requirements'],model,draft=previous if ordinal>1 else None,source_report=source_ref,version=input_version)
        if input_version in (2,3):
            from .prompts import normalized
            actual_prompt=step.get('input',{}).get('prompt')
            if normalized(actual_prompt)!=normalized(expected['prompt']):fail('历史审查提示或材料被改写')
            expected['prompt']=actual_prompt
        if digest(step.get('input'))!=digest(expected) or step.get('content_hash')!=digest(expected):fail('Python审查固定输入被改写')
        if instant(step['created_at'])<instant(run['created_at']):fail('审查步骤早于请求')
        outcomes=[(key,value) for key,value in all_outcomes.items() if value.get('step')==step_id]
        if len(outcomes)>1:fail('Python审查阶段重复结果')
        if not outcomes:
            if ordinal!=len(steps) or run['status']=='completed':fail('未完成审查步骤存在后续成果')
            break
        identity,record=outcomes[0];data=record.get('data',{})
        fields={'version','method','status','output','raw','error','elapsed_ms','usage'}
        if (not isinstance(data,dict) or set(data)!=fields or type(data['version']) is not int or data['version']!=2
                or data['method']!='native-report-review-v1' or data['status'] not in ('completed','failed')
                or type(data['elapsed_ms']) is not int or data['elapsed_ms']<0 or not isinstance(data['output'],dict)
                or data['error'] not in ('','invalid_model_output','model_request_failed','budget_exhausted')
                or identity!=digest(['workflow-outcome-1',step_id])[:40] or record.get('content_hash')!=digest(data)
                or instant(record['created_at'])<instant(step['created_at'])):fail('Python审查结果合同或哈希无效')
        usage(data['usage'],fail);raw=capture(data['raw'],fail)
        if seeded and (raw or data['usage']['request_count'] or any(data['usage'][key] is not None for key in ('input_tokens','output_tokens','total_tokens'))):
            fail('历史原稿读取不能产生新模型返回或用量')
        if data['status']=='failed':
            if not data['error'] or data['output'] or ordinal!=len(steps) or run['status']=='completed':fail('失败审查不能发布或继续')
            break
        if data['error'] or data['raw']['truncated']:fail('已完成审查不能同时失败或缺少完整返回')
        if ordinal==1:
            output={'analysis':source['data'],'origin':'report_snapshot','source_report':source_ref} if seeded else {
                'analysis':analysis(decode(raw),context),'origin':'model','source_report':None}
            previous=output['analysis']
        else:
            output=audit(decode(raw),previous,context,can_revise=ordinal==2,max_issues=12 if input_version<4 else 24)
            decisions.append(output['decision'])
            if output['decision']=='revise':previous=output['analysis'];revised=True
            if output['decision']=='reject' and ordinal!=len(steps):fail('拒绝审查后不能继续')
        if digest(output)!=digest(data['output']):fail('Python审查原始返回与已解析记录不一致')
        outcome_refs.append({'id':identity,'content_hash':record['content_hash']})
    if run['status']=='completed':
        if not decisions or decisions[-1]!='accept' or len(outcome_refs)!=(3 if revised else 2):fail('报告缺少已通过的最终AI事实复核')
        expected={**previous,'native_review_gate':gate(outcome_refs,revised=revised,source_report=source_ref)}
        if digest(run.get('result'))!=digest(expected):fail('最终报告与已审查原稿/修订稿不一致')
