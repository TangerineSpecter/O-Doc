"""Quoted model findings and exact machine acknowledgments; no code execution."""
import copy
import json
import re
from rest_framework import serializers
from quant.research.contracts import digest
from .policy import POLICY,POLICIES

MAX_RAW=150000


def decode(raw:str) -> dict:
    if not isinstance(raw,str) or len(raw)>MAX_RAW:raise serializers.ValidationError('审查模型结果超过上限')
    text=raw.strip()
    if text.startswith('```') and text.endswith('```'):text=re.sub(r'^```(?:json)?\s*','',text,count=1).rsplit('```',1)[0].strip()
    def pairs(values):
        value={}
        for key,item in values:
            if key in value:raise ValueError('duplicate key')
            value[key]=item
        return value
    try:value=json.loads(text,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('nonfinite')))
    except (ValueError,TypeError,RecursionError) as error:raise serializers.ValidationError('审查模型须返回完整且无重复键的JSON') from error
    if not isinstance(value,dict):raise serializers.ValidationError('审查结果须为对象')
    return value


def acknowledgment(native:dict) -> dict:
    value={'comparison_roles':{'left':'portable_expression','right':'original_python_function'},
        'comparison_rule':{'rule':'abs_plus_rel_max',**copy.deepcopy(native['policy'])},'native_result_id':native['id']}
    if 'alignment' in native:
        from .alignment import acknowledgment as alignment_ack
        value['alignment_ack']=alignment_ack(native['alignment'])
    return value


def facts(context:dict) -> dict:
    native=context['native_check']
    value={'native:sides':acknowledgment(native)['comparison_roles'],
        'native:review_policy':copy.deepcopy(context['native_review_policy']),
        'native:tolerance':acknowledgment(native)['comparison_rule'],
        'native:configuration':{key:native[key] for key in ('parameters','bindings','native')},
        'native:comparison':{key:native[key] for key in ('status','reason','verdict','comparison')},
        'native:scope':{key:native[key] for key in ('source','dataset','claim','independent_validation','platform_equivalence','economic_effectiveness')},
        'source:code':context['target_source'],'candidate:definition':context['factor']}
    memory=context.get('research_memory',{})
    value.update({f"history:{row['id']}":row for row in memory.get('history',[])})
    value.update({f"memory:{row['kind']}:{row['id']}":row for row in memory.get('library_memory',{}).get('items',[])})
    if 'alignment' in native:value['native:alignment']=native['alignment']
    if 'native_history_statistics' in context:value['native:history_statistics']=context['native_history_statistics']
    return copy.deepcopy(value)


def pointer(value:dict,path:str):
    if path=='/':return json.dumps(value,ensure_ascii=False,sort_keys=True,allow_nan=False)
    if not isinstance(path,str) or not path.startswith('/') or len(path)>500:raise serializers.ValidationError('审查问题缺少JSON字段路径')
    parts=path[1:].split('/')
    if parts[0] in ('native_review_facts','native_review_gate','evidence_hash','native_markdown_version','native_review_version'):
        raise serializers.ValidationError('系统固定事实不能作为模型原稿问题文本')
    try:
        current=value
        for key in parts:
            key=key.replace('~1','/').replace('~0','~')
            current=current[int(key)] if isinstance(current,list) and key.isdecimal() else current[key]
    except (KeyError,TypeError,IndexError,ValueError) as error:raise serializers.ValidationError('审查问题路径不存在') from error
    if not isinstance(current,str):raise serializers.ValidationError('审查问题须定位模型原稿中的文字')
    return current


def analysis(value:dict,context:dict,*,markdown_version=5) -> dict:
    from quant.feedback.contracts import validate_analysis
    result=validate_analysis(value,context,model_output=True)
    if result.get('native_review_version')==3:result['native_markdown_version']=markdown_version
    return result


def audit(value:dict,draft:dict,context:dict,*,can_revise:bool,max_issues=24,allow_encoded_analysis=False,use_text_spans=False,markdown_version=5) -> dict:
    class Finding(serializers.Serializer):
        code=serializers.ChoiceField(choices=['side_inversion','tolerance_rule','actual_parameter','fact_contradiction','unsupported_inference','unresolved_scope','protocol_upgrade'])
        path=serializers.CharField(max_length=500)
        quote=serializers.CharField(max_length=3000,trim_whitespace=False,required=not use_text_spans)
        text_ref=serializers.CharField(max_length=600,required=use_text_spans)
        evidence_refs=serializers.ListField(child=serializers.CharField(max_length=120),min_length=1,max_length=8)
        explanation=serializers.CharField(max_length=3000)
    class Review(serializers.Serializer):
        decision=serializers.ChoiceField(choices=['accept','revise','reject'])
        issues=Finding(many=True,max_length=max_issues)
        analysis=serializers.JSONField(allow_null=True)
    if not isinstance(value,dict) or set(value)!={'decision','issues','analysis'}:raise serializers.ValidationError('事实审查字段无效')
    form=Review(data=value);form.is_valid(raise_exception=True);result=dict(form.validated_data)
    issues=result['issues'];decision=result['decision'];references=set(facts(context))
    if (decision=='accept')!=(not bool(issues)) or decision=='revise' and not can_revise:
        raise serializers.ValidationError('审查判断与问题/修订预算不一致')
    seen=set()
    for issue in issues:
        if use_text_spans:
            from .text_spans import select
            try:issue.update(select(draft,issue['text_ref'],issue['path']))
            except ValueError as error:raise serializers.ValidationError('审查区间不属于当前原稿字段') from error
        text=pointer(draft,issue['path']);key=(issue['path'],issue['quote'])
        expected_version=3 if context.get('native_review_policy',{}).get('version')==2 else 2
        if issue['path']=='/' and (issue['code']!='protocol_upgrade' or draft.get('native_review_version')==expected_version):
            raise serializers.ValidationError('根路径仅用于旧稿审查合同升级')
        if not issue['quote'].strip() or issue['quote'] not in text or set(issue['evidence_refs'])-references or key in seen:
            raise serializers.ValidationError('审查问题必须逐字定位原稿并引用已提供事实')
        seen.add(key)
    if decision=='revise':
        if allow_encoded_analysis and isinstance(result['analysis'],str):
            result['analysis']=decode(result['analysis'])
            result['normalizations']=['decoded_complete_analysis_json_string']
        if not isinstance(result['analysis'],dict):raise serializers.ValidationError('修订须返回完整的新分析')
        revised=analysis(result['analysis'],context,markdown_version=markdown_version)
        for row in issues:
            try:replacement=pointer(revised,row['path'])
            except serializers.ValidationError:
                # A valid complete analysis may remove an unsupported list item.
                # The original quote/path was already checked against the draft.
                continue
            if replacement==pointer(draft,row['path']):raise serializers.ValidationError('修订没有修改所标问题字段')
        result['analysis']=revised
    elif result['analysis'] is not None:raise serializers.ValidationError('接受或拒绝不能夹带另一份分析')
    if decision=='accept':
        from quant.feedback.contracts import validate_analysis
        if validate_analysis(draft,context)!=draft:raise serializers.ValidationError('原稿尚未满足本次事实确认合同')
    return result


def model_context(context:dict) -> dict:
    value=copy.deepcopy(context)
    # One authoritative structured native fact projection, not a second copy
    # inside a machine-generated JSON document. Full validation keeps the source.
    feedback=value['feedback'];feedback['document_hash']=digest(feedback['document']);feedback['document']=''
    payload=value['target_source']['payload']
    value['target_source']['payload']={key:payload[key] for key in ('code','language','language_version','platform','description','dependencies','parameters','note') if key in payload}
    # Runtime hashes remain in immutable facts for replay/UI, not model prose.
    environment=value['native_check']['environment']
    value['native_check']['environment']={'runtime':{key:environment['runtime'][key] for key in ('python','numpy','pandas','machine')},'limits':environment['limits']}
    if value.get('native_review_policy',{}).get('version')==2 and value.get('research_memory',{}).get('library_memory'):
        from .history import model_memory
        value['research_memory']['library_memory']=model_memory(value['research_memory']['library_memory'])
    return value


def draft_projection(draft:dict) -> dict:
    return {key:copy.deepcopy(value) for key,value in draft.items() if key not in ('native_review_facts','native_review_gate','evidence_hash')}


def gate(outcomes:list,*,revised:bool,source_report:dict|None,policy=None) -> dict:
    return {'version':1,'status':'revised_audited' if revised else 'audited','reviewer_independent':False,
        'source_report':source_report,'outcomes':outcomes,'policy':copy.deepcopy(POLICY if policy is None else policy)}


def validate_gate(value:dict) -> None:
    keys={'version','status','reviewer_independent','source_report','outcomes','policy'}
    if (not isinstance(value,dict) or set(value)!=keys or type(value['version']) is not int or value['version']!=1
            or value['status'] not in ('audited','revised_audited') or value['reviewer_independent'] is not False
            or digest(value['policy']) not in {digest(item) for item in POLICIES.values()} or not isinstance(value['outcomes'],list)
            or len(value['outcomes'])!=(3 if value['status']=='revised_audited' else 2)):
        raise serializers.ValidationError('原始Python报告审查记录无效')
    for index,ref in enumerate([*value['outcomes'],*([value['source_report']] if value['source_report'] is not None else [])]):
        if (not isinstance(ref,dict) or set(ref)!={'id','content_hash'} or not isinstance(ref['id'],str)
                or (not re.fullmatch(r'[0-9a-f]{40}',ref['id']) if index<len(value['outcomes']) else not 0<len(ref['id'])<=40)
                or not isinstance(ref['content_hash'],str) or not re.fullmatch(r'[0-9a-f]{64}',ref['content_hash'])):
            raise serializers.ValidationError('报告审查引用或哈希无效')
