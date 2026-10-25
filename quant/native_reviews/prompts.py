import json
from .contracts import acknowledgment,model_context,facts,draft_projection


def concise() -> str:
    return ('\n文字只解释逻辑、限制和可否证的下一步。固定参数、计数、差异数值与历史收益明细已由系统保存，不在自由文字中重抄全部明细；不要新增手算比值、数量级区间或“多数”等统计概括。'
        '修订应依据固定事实重写简洁说明，不沿用原稿冗长、错误的数值段落。summary、comparison、interpretation、parameter_assessment、memory_note各用1至3句，hypotheses保留至多3条明确标为假设的文字；next_steps明确将要比较的完整输出公式及原函数变体，不能把均值与均值偏离信号混为一谈。'
        'warmup_bars是显式排除行数，period是窗口长度，缺失行数另见固定事实，三者不能互换。所有要求的引用评估和负面/未知仍须保留。')


def stable(value):
    return json.loads(json.dumps(value,ensure_ascii=False,sort_keys=True,allow_nan=False))


def normalized(text,*,span_order=False):
    """Legacy prompts preserve bytes; compare only embedded JSON key order."""
    if not isinstance(text,str):return text
    def pairs(items):
        value={}
        for key,item in items:
            if key in value:raise ValueError('duplicate key')
            value[key]=item
        return value
    decoder=json.JSONDecoder(object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('nonfinite')))
    result=[];position=0
    while position<len(text):
        if text[position] in '{[':
            try:
                value,length=decoder.raw_decode(text[position:])
                if isinstance(value,(dict,list)):
                    if span_order and isinstance(value,dict) and 'text_spans' in value and 'draft_structure' in value:
                        spans=value['text_spans']
                        if (not isinstance(spans,list) or any(not isinstance(row,dict) or not isinstance(row.get('ref'),str) for row in spans)
                                or len({row['ref'] for row in spans})!=len(spans)):
                            raise ValueError('invalid span registry')
                        value['text_spans']=sorted(spans,key=lambda row:row['ref'])
                    result.append(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False))
                    position+=length;continue
            except (ValueError,RecursionError):pass
        result.append(text[position]);position+=1
    return ''.join(result)


def generation(context:dict,requirements:str,*,version=8) -> str:
    from quant.feedback.contracts import prompt
    projected=model_context(context)
    if version>=4:return prompt(stable(context),requirements,material_context=stable(projected),structured_native=version>=5)+concise()+(projection_note() if version>=8 else '')+(
        '\nnative_review_version必须是最外层字段，不放进native_review对象；逐字确认字段按上面的完整输出结构填写。' if version>=5 else '')
    return prompt(stable(projected) if version>=3 else projected,requirements)+(concise() if version>=2 else '')


def review(context:dict,draft:dict,requirements:str,*,can_revise:bool,version=8) -> str:
    from quant.feedback.contracts import prompt
    if version>=7:return span_review(context,draft,requirements,can_revise=can_revise,version=version)
    if version>=4:return aligned_review(context,draft,requirements,can_revise=can_revise,structured=version>=5,object_analysis=version>=6)
    # The ordinary generation shape/planning rules remain available for a full
    # revision; the instruction below changes only this call's output envelope.
    projected=model_context(context)
    base=prompt(stable(projected) if version>=3 else projected,requirements)+(concise() if version>=2 else '')
    if version>=3:base+='\n审查问题最多24条；重复错误按原稿字段归纳，保留逐字依据，超过预算则拒绝，不能静默遗漏。'
    data={'draft':draft_projection(draft),'fact_references':list(facts(context)),'required_acknowledgment':acknowledgment(context['native_check'])}
    return (base+'\n本次角色改为事实审查员。不得执行工具。上面的分析输出结构只用于analysis修订内容；最外层必须返回以下审查对象。'
        '逐句检查summary、comparison、hypotheses、next_steps和native_review中的左右侧、原函数/候选范围、实际/默认参数、缺失及容差，不只检查native_review主段。'
        '也检查feedback_planning_note及其余所有自由文字。第一次审查就检查原稿全部问题，不要只修协议或最显眼的错误。逐项检查自算比值、百分数、数量级和“多数/整体/多为”等统计概括；无足够记录支持时删除该概括并保留未知，修订不要引入新的未复算数字。'
        '固定left=portable_expression，right=original_python_function。数值一致条件为abs(left-right) <= absolute_tolerance + relative_tolerance*max(abs(left),abs(right))；不是两个独立阈值的AND或OR。'
        '原稿提到的原始未来收益乘子、调用参数与候选定义必须对照source:code/candidate:definition核实；历史证据不等于本次实证。'
        '发现问题用issues数组，逐项{code,path,quote,evidence_refs,explanation}。path为原稿字符串字段的JSON Pointer，例如/hypotheses/0；quote须是该字段逐字片段，不能引用系统固定facts。'
        'code限side_inversion/tolerance_rule/actual_parameter/fact_contradiction/unsupported_inference/unresolved_scope/protocol_upgrade；evidence_refs只能逐字选fact_references列表。'
        + ('发现问题时decision=revise，并在analysis返回完整修订分析；只能修订一次，保留负面和未知，不用新收益计划掩盖语义错误。' if can_revise else
           '这是最终复核，不能再修订。发现任一问题用decision=reject、analysis=null。')+
        '无问题且原稿已含native_review_version=2和正确确认字段时decision=accept、issues=[]、analysis=null。拒绝也须给逐字定位的问题，analysis=null。'
        '旧原稿若缺少本次确认字段，修订时补齐合同，并同时修正实际文字错误；不得接受不满足本次合同的旧稿。'
        '仅合同升级问题可用code=protocol_upgrade、path="/"、quote为旧稿中逐字的"native_review_version": 1；引用native:review_policy。其余问题必须指向具体字符串字段。'
        '只输出一个完整闭合JSON对象：{"decision":"accept/revise/reject","issues":[],"analysis":null}。'
        '\n待审查原稿与权威引用：'+json.dumps(data,ensure_ascii=False,allow_nan=False,sort_keys=version>=3))


def aligned_review(context,draft,requirements,*,can_revise,structured=False,object_analysis=False):
    from quant.feedback.contracts import prompt
    base=prompt(stable(context),requirements,material_context=stable(model_context(context)),structured_native=structured)+concise()
    if object_analysis:base+='\nrevise时analysis字段是完整JSON对象，不是JSON字符串，也不是Markdown代码块；accept/reject时才是null。根层native_review_version:3放在analysis对象内，不放进native_review。'
    data={'draft':draft_projection(draft),'fact_references':list(facts(context)),
        'required_acknowledgment':acknowledgment(context['native_check'])}
    return (base+'\n本次改为事实审查员：逐段检查全部模型文字，包括summary、comparison、hypotheses、next_steps、native_review、feedback_planning_note、memory_note与memory_assessment。'
        '检查左右侧、实际/默认参数、完整输出公式、未来信息、组合容差及历史推断。位置和缺失以native:alignment为准；两侧首次有效相同就不能称起点不同步。原始运行失败时位置未知。'
        '历史数字有完整列名表和程序符号计数，不能把提供条目数与扫描总数、训练与验证、窗口与warmup互换。推断必须保留未验证性质，不能因措辞不同无依据拒绝合理假设。'
        '问题最多24条，每条{code,path,quote,evidence_refs,explanation}：path为原稿字符串字段JSON Pointer，quote为该字段逐字片段，evidence_refs仅选提供的fact_references。'
        'code限side_inversion/tolerance_rule/actual_parameter/fact_contradiction/unsupported_inference/unresolved_scope/protocol_upgrade。'
        '旧稿缺native_review_version:3或alignment_ack时须升级并修正文字；仅protocol_upgrade可用path="/"，quote逐字引用旧稿的"native_review_version": 1或2，依据native:review_policy。'
        + ('发现问题decision=revise，analysis给出完整简洁修订；允许删去无依据列表项，最多修订一次。' if can_revise else '最终复核不能再次修订，任何遗留问题decision=reject、analysis=null。')+
        '无遗留问题且符合本次确认字段时decision=accept、issues=[]、analysis=null；拒绝时给逐字定位的issues、analysis=null。'
        '仅返回完整JSON对象{"decision":"accept/revise/reject","issues":[],"analysis":null}，不得执行工具。'
        '\n待审查原稿与权威引用：'+json.dumps(data,ensure_ascii=False,allow_nan=False,sort_keys=True))


def span_review(context,draft,requirements,*,can_revise,version=8):
    from quant.feedback.contracts import prompt,output_shape
    from .text_spans import registry
    structure,spans=registry(draft)
    base=prompt(stable(context),requirements,material_context=stable(model_context(context)),structured_native=True)+concise()
    if version>=8:base+=projection_note()
    data={'draft_structure':structure,'text_spans':spans,'fact_references':list(facts(context)),
        'required_acknowledgment':acknowledgment(context['native_check'])}
    example_issue={'code':'fact_contradiction','path':'/summary','text_ref':'text:/summary#0',
        'evidence_refs':['native:alignment'],'explanation':'说明选中原文与固定事实的具体冲突，按实际问题填写'}
    if can_revise:
        template=output_shape(context,structured_native=True)
        if context.get('research_memory'):
            template.update(feedback_planning_version=1,feedback_planning_note='说明后续假设与缺口，没有合理方案时用null',feedback_proposal=None,
                memory_note='综合提供的历史记录，保留反例、已看数据与缺失范围',memory_assessment=[
                    {'action':'investigate','rationale':'按该条证据选择adopt/reject/investigate并写明理由，不照抄模板',
                        'evidence_refs':[f"memory:{item['kind']}:{item['id']}"]}
                    for item in context['research_memory'].get('library_memory',{}).get('items',[])])
        example={'decision':'revise','issues':[example_issue],'analysis':template}
    else:example={'decision':'reject','issues':[example_issue],'analysis':None}
    return (base+'\n本次角色是事实审查员，不执行工具。draft_structure保留原稿结构与机器字段，文字槽位只列text_refs；完整原文在text_spans中，每段含ref/path/start/end/text，不是空内容。'
        '检查所有原文区间，包括参数、缺失、容差、历史说明与假设。左右首次有效和缺失位置以native:alignment为准，不由缺失总数猜测。历史符号计数见native:history_statistics，不与当前表现混用。'
        '问题最多24条，每条只返回{code,path,text_ref,evidence_refs,explanation}。text_ref必须选text_spans里的精确ref且path相同，程序会逐字复制该区间；不要自己摘录、删词或拼接quote。'
        'code限side_inversion/tolerance_rule/actual_parameter/fact_contradiction/unsupported_inference/unresolved_scope/protocol_upgrade；evidence_refs只选fact_references。不能因措辞不同而拒绝有条件、明确未验证的合理假设。'
        '旧版本或缺本次确认字段须升级；仅protocol_upgrade可用path="/"和text:protocol_version。其余问题选具体文字字段。'
        + ('发现问题decision=revise，analysis是完整修订JSON对象，不是字符串或Markdown；包括根层native_review_version:3和全部必需分析/规划/历史评估字段，不能只返回改动项。最多一次修订，可删除无依据列表项。' if can_revise else
           '这是最终复核，不能再次修订。有遗留问题decision=reject、analysis=null。')+
        '没有遗留问题且合同完整时decision=accept、issues=[]、analysis=null。拒绝也须给出选中原文区间的问题。'
        '只返回完整JSON对象。无问题可直接用{"decision":"accept","issues":[],"analysis":null}，不要求一定挑错。以下是完整结构示例，字段文字、问题和动作须按真实证据填写，不照抄示例：'+json.dumps(example,ensure_ascii=False,sort_keys=True,allow_nan=False)+
        '\n待审查原稿区间与权威引用：'+json.dumps(data,ensure_ascii=False,sort_keys=True,allow_nan=False))


def projection_note():
    return ('\n本输入的feedback.document空串是程序为避免重复同一计算JSON而做的投影，document_hash保留原文指纹，native_check提供权威计算事实。不能写“文档为空/未提供/缺少”，也不能据此推断原始资料缺失；这是一份本机计算反馈，不是外部文档。'
        'literal函数参数只是在本次调用中固定，仍是源码函数参数，不能称其“不可调”；候选可调参数与本次原函数绑定分别说明。'
        '若两侧完整输出定义不同，先给语义对齐的具体下一步，feedback_proposal=null；在确认可比定义前不要另起金融参数方案。')
