"""Select an immutable evaluated expression and its ACTUAL parameters, not defaults."""
import copy
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.exports.series import flatten
from quant.strategies.policy import validate_policy

VERSION = 'quant-mt4-strategy-export-1'
LIMITATIONS = [
    '候选EA仅允许单次MT4策略测试器运行；禁止实盘、模拟账户运行和原生优化器。生成和归档不会启动任何终端或交易。',
    '信号取上一已收盘柱，在新柱首个实际tick决策；附加后的第一柱跳过。原生Bid/Ask、点差、tick路径与时间不是本机固定开盘撮合。',
    '止损止盈为每tick软件检查，基于真实入场价；没有服务器保护单。原生tick成交不能复现本机同柱止损优先及保守跳空止盈。',
    '按账户净值比例和线性tick价值代理换算手数，向下取整、低于最小手数不交易；合约、货币换算、保证金与经纪商限制须原生核验，非分数数量等价。',
    '本机fee_bps、slippage_bps、逐柱借券费仅保留作对照；EA使用测试器点差、实际手续费/Swap及独立最大偏离点数，不伪造扣费或把偏离点数当已实现滑点。',
    '程序只管理当前标的及唯一Magic的单一市价仓位，失败不抹去：平仓失败禁止新仓并逐tick重试；编译、合约、行情及终端错误须检查日志。',
    'JSON只记录完整已平仓交易、实际输入与期末状态，不是信号等价证明；时区、tick模型、额外费用和现金流完整性保持未知，未平仓数量明确保留。',
    '归档值已按本机声明检查；MT4修改输入后不继承本次实验结果。窗口、文字枚举和策略范围可检查，复杂参数依赖约束仍需对照清单核验。',
    '信号最多使用最近20000根OHLC历史并全量重算；真实成交量尚无明确映射，使用volume的表达式拒绝导出，不能用tick_volume替代。',
]
REFERENCES = ['https://docs.mql4.com/check/istesting', 'https://docs.mql4.com/series/copyrates',
    'https://docs.mql4.com/trading/ordersend', 'https://docs.mql4.com/trading/orderclose',
    'https://docs.mql4.com/constants/environment_state/marketinfoconstants', 'https://docs.mql4.com/basis/function/events']


def context(request, attempt_id: str = '') -> dict:
    from django.core.exceptions import ObjectDoesNotExist
    try: result = request.result
    except ObjectDoesNotExist as exc:
        raise ValidationError('实验尚未发布结果，不能选择实际评价的公式') from exc
    return from_facts(request.plan, result.data, request.dataset.snapshot, request.pk, result.pk, result.content_hash, attempt_id)


def from_facts(plan: dict, result: dict, dataset: dict, request_id: str, result_id: str, result_hash: str, attempt_id: str = '') -> dict:
    from quant.label_studies.search import base_engine
    if base_engine(plan['engine_version']) not in ('quant-local-search-5', 'quant-local-search-6', 'quant-local-search-8') or 'strategy' not in plan['config']:
        raise ValidationError('请先创建具有明确策略执行规则的实验；指标不能直接作为EA')
    output = result.get('output') or {}
    identity = attempt_id or output.get('selected_id')
    attempt = next((row for row in output.get('attempts', []) if row['id'] == identity), None)
    if not attempt or attempt['status'] != 'evaluated' or result['status'] not in ('completed', 'partial'):
        raise ValidationError('只能导出已发布实验中实际评价通过的尝试；失败和未完成计算不转换成EA')
    spec = copy.deepcopy(attempt['recipe'])
    if any(node['op'] == 'input' and spec['bindings'][node['name']] == 'volume' for node, _ in flatten(spec['expression'])):
        raise ValidationError('此公式依赖真实成交量，MT4实量映射尚未确认，不能替换为tick_volume或静默省略')
    # The evaluated recipe uses namespaced pN symbols. Resolve declared text enums from all frozen parents.
    from quant.experiments.derivation import attempt_parameter_contracts, source_parents
    contracts = attempt_parameter_contracts(plan, output['attempts'], identity)
    spec['string_choices'] = {name: contracts[name]['domain']['choices'] for name, value in spec['parameters'].items() if isinstance(value, str)}
    spec['windows'] = sorted({node['args'][1]['name'] for node, _ in flatten(spec['expression'])
        if node['op'] in ('lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank') and node['args'][1]['op'] == 'parameter'})
    if any(type(v) is int and not -2**31 < v < 2**31 for v in spec['parameters'].values()):
        raise ValidationError('参数整数超出MQL4 int范围')
    validate_policy(plan['config']['strategy'], plan['config']['threshold'])
    return {'request_id': request_id, 'result_id': result_id, 'result_hash': result_hash,
        'attempt_id': identity, 'fold': attempt.get('fold'), 'attempt_hash': digest(attempt),
        'recipe': spec, 'config': copy.deepcopy(plan['config']), 'dataset_hash': plan['dataset_hash'],
        'market': {key: dataset.get(key) for key in ('symbol', 'timeframe', 'timezone', 'source', 'price_adjustment')},
        'parents': [{'id': row['id'], 'candidate_hash': digest(row['candidate'])} for row in plan['seeds'] if row['id'] in source_parents(plan, output['attempts'], attempt)],
        'claim': 'generated_native_strategy_hypothesis_compile_run_and_equivalence_pending'}
