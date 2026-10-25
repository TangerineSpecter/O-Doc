"""First experiments derived from the same source-analysis call, never from guessed defaults."""
import copy
import json
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .contracts import unpack_seed
from .proposal_contract import validate_proposal, proposal_data

KEYS = {'initial_planning_version', 'initial_planning_note', 'initial_proposal'}


def context(result: dict, report_id: str = '') -> tuple[dict, dict]:
    value = result['initial_proposal']
    if not isinstance(value, dict) or set(value) != {'name', 'hypothesis', 'falsification', 'data_requirement', 'evidence_refs', 'seeds', 'config'}:
        raise ValidationError('首轮实验方案结构无效')
    if not isinstance(value['seeds'], list) or not 1 <= len(value['seeds']) <= 8:
        raise ValidationError('首轮实验需选择 1–8 个当前提取候选')
    options, proposed = [], []
    factors = result.get('factors', [])
    for row in value['seeds']:
        if not isinstance(row, dict) or set(row) != {'factor_index', 'bindings', 'variants'}:
            raise ValidationError('首轮父代需提供因子序号、明确行情列映射和参数组')
        index = row['factor_index']
        if type(index) is not int or not 0 <= index < len(factors):
            raise ValidationError('首轮父代不在本次提取候选中')
        from quant.repairs.contracts import selected_factor
        identity, candidate = selected_factor(result, index, report_id)
        if candidate['role'] not in ('factor', 'signal', 'filter'):
            raise ValidationError('首轮实验只选择因子、信号或过滤条件')
        defaults = []
        for parameter in candidate['parameters']:
            try:
                default = json.loads(parameter['default_value'])
            except (ValueError, TypeError):
                raise ValidationError('首轮参数默认值未知或无法转为明确 JSON 值；须补充材料，不能猜测基线')
            defaults.append({'name': parameter['name'], 'value': default})
        seed = unpack_seed({'candidate_id': identity, 'bindings': row['bindings'], 'parameters': defaults, 'variants': row['variants']}, candidate)
        options.append({key: copy.deepcopy(seed[key]) for key in ('id', 'candidate', 'bindings', 'parameters')})
        proposed.append({'candidate_id': identity, 'variants': row['variants']})
    facts = {f'factor:{index}': factor['evidence'] for index, factor in enumerate(factors)}
    revised = {row['factor_index']: row for row in result.get('factor_repair', {}).get('items', []) if row['status'] == 'revised'}
    facts.update({f'repair:{index}': {'summary': row['summary'], 'evidence': row['evidence'],
        'definition_hash': row['after_hash'], 'claim': 'ai_revised_hypothesis_not_source_default_or_equivalence'} for index, row in revised.items()})
    if result.get('source_memory_version')==1:
        facts.update({f"memory:{row['kind']}:{row['id']}":row for row in result['research_memory']['items']})
        if any(f"factor:{row['factor_index']}" not in value['evidence_refs'] for row in value['seeds']):
            raise ValidationError('新源码方案须同时引用当前父代的原文证据；历史观察不能替代当前定义')
    # Execution settings are proposed assumptions, not measured performance evidence.
    evidence = {'version': 'source-initial-plan-1', 'planning_options': options,
        'evidence': {**facts, 'execution': {'config': copy.deepcopy(value['config'])}}}
    proposal = {key: copy.deepcopy(item) for key, item in value.items() if key != 'config'}
    proposal['seeds'] = proposed
    proposal = validate_proposal(proposal)
    if any(ref not in facts for ref in proposal['evidence_refs']):
        raise ValidationError('首轮方案依据须引用当前提取因子的原文证据')
    if any(f'repair:{row["factor_index"]}' not in proposal['evidence_refs'] for row in value['seeds'] if row['factor_index'] in revised):
        raise ValidationError('使用 AI 修订项的首轮方案须明确引用修订假设')
    validate_proposal(proposal, evidence)
    return proposal, evidence


def validate_initial(result: dict) -> dict:
    if not KEYS.intersection(result):
        return {}
    if not KEYS <= result.keys() or type(result['initial_planning_version']) is not int or result['initial_planning_version'] != 1 or result.get('extraction_version') != 1:
        raise ValidationError('首轮规划需包含完整版本、说明和方案，且基于本次提取结果')
    note = result['initial_planning_note']
    if not isinstance(note, str) or not note.strip() or len(note) > 3000:
        raise ValidationError('首轮规划须说明可计算范围或阻碍')
    value = result['initial_proposal']
    if value is not None:
        context(result)
    return {key: copy.deepcopy(result[key]) for key in KEYS}


def initial_data(result: dict, report_id: str) -> dict:
    validate_initial(result)
    proposal, evidence = context(result, report_id)
    uses_repair = any(row['factor_index'] in {item['factor_index'] for item in result.get('factor_repair', {}).get('items', []) if item['status'] == 'revised'} for row in result['initial_proposal']['seeds'])
    return {**proposal_data({'proposal': proposal}, evidence), 'origin': 'source_analysis',
        'baseline_status': 'ai_revised_definition_defaults_not_native_or_live_settings' if uses_repair else 'source_declared_defaults_not_actual_live_settings'}


def validate_strategy_admission(result: dict, version: int) -> None:
    proposal = result.get('initial_proposal')
    if isinstance(proposal, dict) and 'strategy' in proposal.get('config', {}) and version not in (10, 11, 12, 13, 14, 15):
        raise ValidationError('旧版来源分析不得夹带新版策略执行假设')


def initial_prompt(*, strategy: bool = False) -> str:
    from quant.strategies.prompts import INITIAL
    legacy = _initial_prompt()
    if strategy:
        legacy = legacy.replace('数值序列按大于threshold做多，否则空仓；布尔序列按条件做多。', '省略strategy时数值序列按大于threshold做多，否则空仓；布尔序列按条件做多。')
    return legacy + (INITIAL if strategy else '')


def _initial_prompt() -> str:
    return '''\n基于本次 factors 同时给出首轮实验设计，无需已有回测。新增 initial_planning_version:1、initial_planning_note（可检验范围/阻碍，最多3000字）、initial_proposal（对象或null）。
仅当存在有受限表达式的 factor/signal/filter、全部参数默认值可表示为有限 JSON 数字、布尔值，或有 domain v3 声明枚举的 JSON 字符串（必须带双引号）、全部输入能明确映射到 open/high/low/close/volume 时给方案；缺少参数默认值、缺少行情映射或平台语义未知时用 null 并解释缺什么。不能编造默认值、不能把显示或下单模块拿来优化。
可选在 config 加入 evolution:{version:3,operators:["lag","smooth","zscore","ts_rank","gate","weighted_mean","residual","crossover"],windows:[3,10],weights:[0.25,0.75],max_nodes:96}，仅在明确新公式假设时使用；至少2代，给变异保留候选预算，复杂度超限会保留失败。标准化/排序改变尺度，阈值不可默认跨单位等价。ts_rank 是时序中点秩，gate 需要第二父代为布尔过滤条件；关闭时输出缺失并计入缺失信号，不能伪称数据缺失已经消除。
crossover 需要两个不同父代，只替换类型和结构单位明确匹配的内部计算片段，窗口不交叉；由引擎选择并记录 recipient_path/donor_path，不由模型编造位置。保留双方参数与约束，结构兼容不能代替实证。
可选 config.walk_forward:{version:1,mode:"expanding",folds:3,train_bars:40,validation_bars:10,test_bars:10,warmup_bars:0}。每折重做训练/验证搜索，再评价后续测试；mode 可为 rolling 固定训练长度。窗口为收益区间，folds 为2–5，训练至少20、验证/测试至少5；所有折共用总尝试/秒数预算，每折必须容纳所有基线与参数组及演化预留。声明所需数据长度；未知行情时不声称已经验证。
initial_proposal 结构：{name,hypothesis:可否证假设,falsification:失败标准,data_requirement:行情品种周期长度和口径要求,evidence_refs:["factor:0"],seeds:[{factor_index:本次factors数组从0起的序号,bindings:[{name:该因子输入名,column:"close"}],variants:[[{name:参数名,value:候选数值}]]}],config:{seed:42,max_candidates:16,generations:2,threshold:0,fee_bps:5,slippage_bps:5,gap:2,seconds:30}}。
研究多个数值参数的联动时，预算允许可提出包含基线的完整小网格（例如两轴各两个值的四种组合），不要用只改两次的对角线代替完整组合；字符串模式或开关固定分组，分别保留数值基线，所有范围仍须有原文/研究假设与约束依据。
基线由服务端直接读取所选因子的源码默认值；不是实盘运行配置。variants 每组必须包含全部参数，只改变实际参与表达式计算的 signal 参数，最多16组且不得重复或等同基线；无可调信号参数可为空。窗口参数为1–2000整数。最多8个不同父代，基线和参数组总数不超过max_candidates。
config 必须完整且显式给出；候选预算最多32、代数最多4、秒数最多60。阈值、费用、滑点与隔离间隔都是实验假设，在 initial_planning_note 中说明选择理由，费用不可假装适配实际账户。数值序列按大于threshold做多，否则空仓；布尔序列按条件做多。选择有合理阈值语义的候选，不将原始价格大于0这种无意义转换冒充有效信号。
证据仅引用本次 factor:序号 对应的逐字出处，不得杜撰测量结果。行情与计算授权由用户之后选择；此处仅生成待验证方案，不声称已运行、最优或获利。\n'''
