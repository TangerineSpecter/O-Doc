"""Turn feedback hypotheses into bounded designs using only linked immutable parents."""
import copy
from rest_framework.exceptions import ValidationError
from quant.experiments.library_contract import option
from quant.experiments.proposal_contract import validate_proposal, proposal_data
from quant.experiments.search import validate_plan

KEYS = {'feedback_planning_version', 'feedback_planning_note', 'feedback_proposal'}


def options(context: dict) -> list[dict]:
    experiment = context.get('experiment')
    if experiment:
        # These are the recorded input baselines, not the selected variant or external settings.
        return [{key: copy.deepcopy(seed[key]) for key in ('id', 'candidate', 'bindings', 'parameters')}
                for seed in experiment['seeds']]
    factor = context.get('factor')
    if factor:
        if context.get('native_check'):
            native=context['native_check']
            return [{'id':factor['id'],'candidate':copy.deepcopy(factor['data']),
                'bindings':copy.deepcopy(native['bindings']),'parameters':copy.deepcopy(native['parameters'])}]
        try:
            return [option(factor['id'], factor['data'])]
        except (ValidationError, ValueError, TypeError, KeyError):
            return []
    return copy.deepcopy(context.get('research_memory', {}).get('options', []))


def evidence(context: dict, config: dict) -> dict:
    parents = options(context)
    validate_plan(parents[:1], config)  # Validate config; the proposal may choose a subset of options.
    if not 1 <= config['gap'] <= 2000:
        raise ValidationError('反馈方案的分区隔离须为 1–2000 根')
    summary = context.get('execution_summary')
    facts = ({ref: {'ref': ref, 'evidence_hash': summary['evidence_hash'], 'accounting_hash': summary['accounting_hash']}
              for ref in summary['refs']} | {'execution_summary': summary,
                  'execution_parameter_comparison': context['execution_parameter_comparison']} if summary else {})
    return {'version': 'feedback-plan-1', 'planning_options': parents,
            'evidence': {'feedback': context['feedback'], 'source': context['target_source'],
                         'factor': context['factor'], 'experiment': context['experiment'],
                         **{f"history:{row['id']}": row for row in context.get('research_memory', {}).get('history', [])},
                         **{f"memory:{row['kind']}:{row['id']}": row for row in context.get('research_memory', {}).get('library_memory', {}).get('items', [])},
                         **facts, **({'native_check':context['native_check']} if context.get('native_check') else {}),
                         'execution': {'config': copy.deepcopy(config)}}}


def validate_planning(value: dict, context: dict | None = None) -> dict:
    if context is not None and context.get('research_memory') and not KEYS <= value.keys():
        raise ValidationError('新反馈分析须给出实验规划，或明确说明为何不提出方案')
    if not KEYS.intersection(value):
        return {}  # Existing schema-5 reports remain immutable and readable.
    if not KEYS <= value.keys() or type(value['feedback_planning_version']) is not int or value['feedback_planning_version'] != 1:
        raise ValidationError('反馈规划须提供完整版本、说明和方案')
    note = value['feedback_planning_note']
    if not isinstance(note, str) or not note.strip() or len(note) > 3000:
        raise ValidationError('反馈规划须说明研究假设与限制')
    proposed = value['feedback_proposal']
    if proposed is not None:
        if not isinstance(proposed, dict) or set(proposed) != {'name', 'hypothesis', 'falsification', 'data_requirement', 'evidence_refs', 'seeds', 'config'}:
            raise ValidationError('反馈方案结构无效')
        normalized = validate_proposal(proposed, evidence(context, proposed['config']) if context is not None else None)
        if 'feedback' not in normalized['evidence_refs']:
            raise ValidationError('反馈方案必须引用本份外部反馈')
        if {**normalized, 'config': proposed['config']} != proposed:
            raise ValidationError('反馈方案字段须规范化且不可夹带其他字段')
    return {key: copy.deepcopy(value[key]) for key in KEYS}


def feedback_data(result: dict, context: dict) -> dict:
    validate_planning(result, context)
    proposed = result['feedback_proposal']
    return {**proposal_data({'proposal': proposed}, evidence(context, proposed['config'])),
            'origin': 'external_feedback', 'feedback_evidence_hash': result['evidence_hash'],
            'baseline_status': 'native_python_actual_parameters_not_profitability' if context.get('native_check') else 'recorded_experiment_inputs' if context['experiment'] else
                'ai_revised_definition_defaults_not_native_or_live_settings' if context.get('factor_source_scope', {}).get('origin') == 'ai_revised_formula_version' else
                'authored_definition_defaults_not_actual_live_settings' if context.get('factor_source_scope') else 'source_declared_defaults_not_actual_live_settings'}


def planning_prompt(context: dict) -> str:
    import json
    from quant.research_memory.assessment import instruction
    memory = context.get('research_memory', {}).get('library_memory')
    exact_refs=['feedback','source']+[key for key in ('factor','experiment') if context.get(key)]
    exact_refs += [f"history:{row['id']}" for row in context.get('research_memory',{}).get('history',[])]
    exact_refs += [f"memory:{row['kind']}:{row['id']}" for row in (memory or {}).get('items',[])]
    exact_refs += context.get('execution_summary',{}).get('refs',[])
    if context.get('native_check'):exact_refs.append('native_check')
    memory_instruction = instruction(memory) if memory is not None else ''
    reference_instruction = ('证据引用限feedback、source、存在时的factor/experiment、history:历史记录ID，以及存在时的memory:experiment:ID或memory:feedback:ID。'
                             if memory_instruction else '证据引用仅限feedback、source、存在时的factor/experiment以及history:历史记录ID。')
    if 'execution_summary' in context:
        reference_instruction += '本次还允许 execution_summary.refs 中的精确引用；必须同时引用 feedback。参数组只能成为待验证候选，核算一致不能作为自动执行或提升质量分的依据。'
    if context.get('native_check'):
        reference_instruction += '本次固定父代基线是native_check中明确的实际参数与输入，不是源码默认值；native_check只能证明本次输出对照。'
    if memory and memory.get('version') in (2,3):
        reference_instruction += '存在时也可引用 memory:comparison:ID；仅引用本次提供的直接对照，不自行补造传递关系。'
    return memory_instruction + ('\n同时提供 feedback_planning_version:1、feedback_planning_note（最多3000字，写清成本/阈值等假设）、feedback_proposal（对象或null）。'
            '只从下方固定父代选择，不能猜测缺失映射或默认值；没有合法父代或合理实验时用null并说明缺什么。'
            + ('基线是人工公式版本声明默认值，祖先源码对照不能作为本版本参数默认或评分依据；不是外部实际配置。' if context.get('factor_source_scope') and not context.get('experiment') else '基线是已有本机实验的原始输入参数，或源码声明默认值，不是外部报告实际配置，也不一定是选中变体。') +
            '外部参数只能作为待复核候选组；不得因单份反馈称最优、有效、已验证。'
            '需要新行情，明确可否证条件、平台语义及成本差异；产生方案不代表获得执行授权。'
            'feedback_proposal={name,hypothesis,falsification,data_requirement,evidence_refs:["feedback"],'
            'seeds:[{candidate_id:固定父代ID,variants:[[{name:参数名,value:候选数值}]]}],'
            'config:{seed:42,max_candidates:16,generations:2,threshold:0,fee_bps:5,slippage_bps:5,gap:2,seconds:30}}。'
            '可在 config 加 evolution:{version:3,operators:["lag","smooth","zscore","weighted_mean","residual","crossover"],windows:[3,10],weights:[0.25,0.75],max_nodes:96}，'
            '仅用于明确的公式变化假设，至少2代并保留候选预算；失败记录保留，标准化尺度不同需解释阈值。'
            'crossover 需要两个不同父代，内部片段由引擎按类型与结构单位匹配并记录位置，窗口不交叉，不由模型编造替换位置。'
            'config值是显式实验假设，可按资料调整。最多8父代/32尝试/4代/60秒，费用滑点各0–500bps，隔离1–2000根；'
            '需要复核多参数联动时，在预算内提出包含基线的完整小网格；模式/开关分组，分别补齐数值基线，缺失组合不得插值或视作已验证。'
            '每个参数组含全部参数，只改变参与表达式的signal参数；窗口1–2000整数，不重复或等于基线，基线加变体不超尝试预算。'
            + reference_instruction +
            'evidence_refs中的每个字符串必须逐字选自以下列表；factor和source本身不能追加冒号或ID：'+json.dumps(exact_refs,ensure_ascii=False)+
            'research_memory是同来源的有界历史原文；比较成功与失败反馈，不把重复报告当独立样本，不将缺失记录解释为没有失败。'
            '历史数值只用于对照，reported_parameters/metrics仍只能提取本次document。\n固定父代：' + json.dumps(options(context), ensure_ascii=False))
