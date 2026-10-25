import json
from .contracts import acknowledgment,model_context,facts,draft_projection


def concise() -> str:
    return ('\n文字只解释逻辑、限制和可否证的下一步。固定参数、计数、差异数值与历史收益明细已由系统保存，不在自由文字中重抄全部明细；不要新增手算比值、数量级区间或“多数”等统计概括。'
        '修订应依据固定事实重写简洁说明，不沿用原稿冗长、错误的数值段落。summary、comparison、interpretation、parameter_assessment、memory_note各用1至3句，hypotheses保留至多3条明确标为假设的文字；next_steps明确将要比较的完整输出公式及原函数变体，不能把均值与均值偏离信号混为一谈。'
        'warmup_bars是显式排除行数，period是窗口长度，缺失行数另见固定事实，三者不能互换。所有要求的引用评估和负面/未知仍须保留。')


def stable(value):
    return json.loads(json.dumps(value,ensure_ascii=False,sort_keys=True,allow_nan=False))


def normalized(text):
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
                    result.append(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False))
                    position+=length;continue
            except (ValueError,RecursionError):pass
        result.append(text[position]);position+=1
    return ''.join(result)


def generation(context:dict,requirements:str,*,version=3) -> str:
    from quant.feedback.contracts import prompt
    projected=model_context(context)
    return prompt(stable(projected) if version>=3 else projected,requirements)+(concise() if version>=2 else '')


def review(context:dict,draft:dict,requirements:str,*,can_revise:bool,version=3) -> str:
    from quant.feedback.contracts import prompt
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
