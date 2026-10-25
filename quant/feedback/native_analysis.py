"""A model interprets, but cannot replace the deterministic native verdict."""
from rest_framework import serializers
from quant.research.contracts import digest


def validate(value,context,*,model_output=False):
    native=context.get('native_check') if context is not None else None
    present=any(key in value for key in ('native_review','native_review_version','native_review_facts','native_markdown_version','native_review_gate'))
    if context is not None and native is None:
        if present:raise serializers.ValidationError('未绑定Python验证的反馈不能附加验证解读')
        return {}
    if not present and not native:return {}
    version=value.get('native_review_version',1)
    if type(version) is not int or version not in (1,2,3):raise serializers.ValidationError('Python验证解读版本无效')
    policy=context.get('native_review_policy') if context is not None else None
    expected_version=3 if policy and policy.get('version')==2 else 2 if policy else 1
    if native and version!=expected_version:
        raise serializers.ValidationError('原始Python审查版本与本次冻结策略不一致')
    class Review(serializers.Serializer):
        verdict=serializers.ChoiceField(choices=['pass','fail','inconclusive','unavailable'])
        actual_parameters=serializers.DictField(child=serializers.JSONField())
        interpretation=serializers.CharField(max_length=6000)
        parameter_assessment=serializers.CharField(max_length=6000)
        limitations=serializers.ListField(child=serializers.CharField(max_length=3000),min_length=1,max_length=30)
    class Reviewed(Review):
        comparison_roles=serializers.DictField(child=serializers.CharField())
        comparison_rule=serializers.DictField(child=serializers.JSONField())
        native_result_id=serializers.RegexField(r'^[0-9a-f]{40}$')
    class Aligned(Reviewed):
        alignment_ack=serializers.DictField(child=serializers.JSONField())
    serializer=(Aligned if version==3 else Reviewed if version==2 else Review)(data=value.get('native_review'));serializer.is_valid(raise_exception=True)
    if not model_output and (type(value.get('native_review_version')) is not int or value['native_review_version']!=version):
        raise serializers.ValidationError('Python验证解读版本无效')
    result=dict(serializer.validated_data)
    if native and (result['verdict']!=(native['verdict'] or 'unavailable') or digest(result['actual_parameters'])!=digest(native['parameters'])
            or any(value.get(key) for key in ('reported_parameters','reported_metrics','supporting_evidence','counter_evidence'))):
        raise serializers.ValidationError('模型须保留Python计算判定；输出对照不能产生收益指标')
    if version>=2:
        from quant.native_reviews.contracts import acknowledgment
        from quant.comparisons.output_compare import validate_policy
        rule=result['comparison_rule']
        if set(rule)!={'rule','version','absolute_tolerance','relative_tolerance','warmup_bars'} or rule['rule']!='abs_plus_rel_max':
            raise serializers.ValidationError('Python审查须确认复合容差公式')
        validate_policy({key:item for key,item in rule.items() if key!='rule'})
        expected=acknowledgment(native) if native else {'comparison_roles':{'left':'portable_expression','right':'original_python_function'}}
        if any(digest(result[key])!=digest(item) for key,item in expected.items()):
            raise serializers.ValidationError('Python审查的左右侧、容差或结果引用与计算事实不一致')
        if version==3:
            from quant.native_reviews.alignment import validate_ack
            try:validate_ack(result['alignment_ack'])
            except ValueError as error:raise serializers.ValidationError('Python审查缺失位置确认无效') from error
    output={'native_review_version':version,'native_review':result}
    markdown_version=5 if version==3 else 3 if version==2 else 2
    if model_output:output['native_markdown_version']=markdown_version
    elif 'native_markdown_version' in value:
        if type(value['native_markdown_version']) is not int or value['native_markdown_version'] not in ((4,5) if version==3 else (markdown_version,)):
            raise serializers.ValidationError('Python报告展示版本无效')
        output['native_markdown_version']=value['native_markdown_version']
    if native:
        facts={key:native[key] for key in ('id','content_hash','source','dataset','parameters','bindings','native','policy','environment','status','reason','verdict','comparison')}
        if version==3:facts['alignment']=native['alignment']
        if 'native_review_facts' in value and digest(value['native_review_facts'])!=digest(facts):
            raise serializers.ValidationError('Python报告核算事实不可改写')
        output['native_review_facts']=facts
    elif 'native_review_facts' in value:output['native_review_facts']=value['native_review_facts']
    if 'native_review_gate' in value:
        from quant.native_reviews.contracts import validate_gate
        if model_output or version not in (2,3):raise serializers.ValidationError('模型不能自授报告审查通过状态')
        validate_gate(value['native_review_gate'])
        if context is not None and context.get('native_review_policy')!=value['native_review_gate']['policy']:raise serializers.ValidationError('Python审查策略不匹配')
        output['native_review_gate']=value['native_review_gate']
    return output


def instruction(context):
    if not context.get('native_check'):return ''
    return ('\nnative_check 是本机记录的原始Python文本函数与受控表达式在固定样本上的计算对照，非外部平台报告，也不是回测。'
        '必须返回 native_review:{verdict:严格复制 native_check.verdict（为空用 unavailable）,actual_parameters:逐字复制native_check.parameters对象,interpretation:解释一致/不一致/失败及具体差异,'
        'parameter_assessment:逐项核对本次实际参数、函数参数映射及默认值边界，提出有条件且待验证的参数假设,limitations:[样本/单位声明/运行环境等限制]}。'
        'reported_parameters、reported_metrics、supporting_evidence、counter_evidence四个数组必须全部为空；程序核算的结构化事实由系统直接附入报告，无需重复提取引文。'
        '不要返回native_review_facts，该字段由系统填入。禁止从一致性推导收益、最优参数、平台认证或独立验证。'
        '原函数运行失败时写明缺口，不把未知记作零；建议新的对照必须提出具体可否证条件。'
        'native_check.parameters是候选表达式实际参数；原始函数入参看native.arguments，parameter映射引用该值，literal为明确常量。未映射的全局或硬编码值仍来自原文，不能声称被修改或已覆盖。'
        'document 中的 facts 为同一次计算的摘要，不能重复计为另一份独立证据；不修改原质量评分。'
        '本次聚焦语义范围、逐行差异和实际参数；原函数与候选范围不相同时先定位原因，未形成可比较定义前feedback_proposal用null并说明。'
        '报告保持简洁：summary、interpretation和parameter_assessment各不超过800字，其余文字每项不超过300字；仍须覆盖提供的历史引用。只返回一个完整闭合的JSON对象。')


def markdown(result):
    value=result.get('native_review')
    if not value:return []
    facts=result.get('native_review_facts',{})
    fixed=[]
    if facts and result.get('native_markdown_version') not in (2,3,4,5):
        import json
        fixed=['### 程序记录的实际配置',json.dumps({'实际参数':facts['parameters'],'函数参数映射':facts['native']['arguments'],
            '行情片段':facts['dataset'],'容差':facts['policy'],'运行环境':facts['environment']['runtime'],
            '比较计数':facts['comparison']['counts'] if facts['comparison'] else None,'失败原因':facts['reason']},ensure_ascii=False,indent=2)]
    elif facts:
        import json
        def cell(text):return str(text).replace('|','\\|').replace('\n',' ')
        configured=['| 候选表达式参数 | 本次实际值 |','| --- | --- |']+[f"| {cell(name)} | {cell(json.dumps(item,ensure_ascii=False))} |" for name,item in facts['parameters'].items()]
        mapped=['| 原函数参数 | 显式映射 |','| --- | --- |']
        for row in facts['native']['arguments']:
            target=('行情列 '+row['column'] if row['kind']=='series' else 'DataFrame: '+', '.join(row['columns']) if row['kind']=='dataframe'
                else '本次参数 '+row['parameter'] if row['kind']=='parameter' else json.dumps(row['value'],ensure_ascii=False))
            mapped.append(f"| {cell(row['name'])} | {cell(target)} |")
        sample=facts['dataset'];env=facts['environment']['runtime'];policy=facts['policy']
        fixed=['### 程序记录的实际配置','\n'.join(configured) if facts['parameters'] else '无可调候选参数。','\n'.join(mapped),
            f"固定样本：{sample['market'].get('symbol','')} / {sample['market'].get('timeframe','')}；{sample['start']} → {sample['end']}。偏移{sample['offset']}，{sample['row_count']}行。",
            f"共同预热{policy['warmup_bars']}行；绝对容差{policy['absolute_tolerance']}，相对容差{policy['relative_tolerance']}。",
            f"运行环境：Python {env['python']} / pandas {env['pandas']} / numpy {env['numpy']}。"]
        if facts['comparison']:
            counts=facts['comparison']['counts']
            fixed.append(f"左侧为受控表达式，右侧为原始函数：共同有效{counts['common_valid']}行，数值差异{counts['value_mismatches']}行，缺失差异{counts['missing_mismatches']}行。")
        else:fixed.append('运行未得到可比较输出；原因：'+facts['reason'])
        if result.get('native_markdown_version') in (3,4,5):
            fixed.append('数值一致条件：abs(左−右) ≤ 绝对容差 + 相对容差 × max(abs(左), abs(右))；不是两个独立阈值的“且”或“或”。')
            record=result.get('native_review_gate')
            if record:
                fixed+=['### AI事实审查记录',('经过一次修订及最终复核。' if record['status']=='revised_audited' else '本次复核未列出需修订问题。')+
                    '生成与审查使用同一模型配置，不属于独立验证或质量放行。原始解读、逐字问题与修订稿分别保留。']
        if 'alignment' in facts:
            from quant.native_reviews.alignment_markdown import markdown as alignment_markdown
            fixed+=alignment_markdown(facts['alignment'],joined=result.get('native_markdown_version')==5)
    return ['## Python原始函数固定样本验证',f"计算判定：{value['verdict']}",*fixed,value['interpretation'],
        '### 实际参数与后续假设',value['parameter_assessment'],'### 适用边界','\n'.join('- '+row for row in value['limitations'])]
