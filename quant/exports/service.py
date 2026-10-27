"""Reproducible, read-only export bundles. User source is data, never executed."""
import json
from pathlib import Path
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.experiments.library_contract import option
from quant.experiments.search import recipe
from quant.experiments.expression import calculate
from .series import emit as emit_series, flatten
from .mql import emit as emit_mql
from .categories import choices, numeric_categories

TARGETS = {'python': ('py', 'Python 3.11+ / standard library'), 'pine': ('pine', 'Pine Script v6'),
           'mql4': ('mq4', 'MQL4 indicator'), 'tongdaxin': ('txt', '通达信副图指标')}


def bundle(candidate, target: str) -> dict:
    if target not in TARGETS:
        raise ValidationError('请选择 Python、Pine、MQL4 或通达信')
    try:
        seed = option(candidate.pk, candidate.data)
        spec = recipe(candidate.data, seed['bindings'], seed['parameters'])
        # Type checking traverses every node, even when windows have no output yet.
        calculate(spec['expression'], {key: [1.0, 2.0] for key in spec['bindings']}, spec['parameters'], expected=spec['output_type'])
    except (ValidationError, ValueError, TypeError, KeyError) as exc:
        raise ValidationError('此候选暂不能导出：需要可计算表达式、明确且符合声明类型的参数默认值及 OHLCV 输入映射') from exc
    spec['string_choices'] = choices(candidate.data, spec)
    windows = sorted({node['args'][1]['name'] for node, _ in flatten(spec['expression'])
                      if node['op'] in ('lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank') and node['args'][1]['op'] == 'parameter'})
    spec['windows'] = windows
    if target in ('pine', 'mql4'):
        max_int = 2**31 - 1 if target == 'mql4' else 2**63 - 1
        if any(type(value) is int and not -max_int <= value <= max_int for value in spec['parameters'].values()):
            raise ValidationError('默认整数超出目标平台输入参数范围，需先修正候选参数')
    if target == 'python':
        runtime = Path(__file__).with_name('python_runtime.py').read_text(encoding='utf-8')
        code = '# O-Doc candidate. Supply chronological CLOSED bars. No order execution.\nimport json\nSPEC = json.loads(' + repr(json.dumps(spec, ensure_ascii=True, allow_nan=False)) + ')\n' + runtime
    elif target == 'mql4': code = emit_mql(spec)
    else:
        emitted_spec, encoding = numeric_categories(spec) if target == 'tongdaxin' else (spec, None)
        code = emit_series(emitted_spec, target)
    if len(code.encode('utf-8')) > 1_000_000:
        raise ValidationError('导出公式超过 1 MB，请减少排序节点或将窗口固定为较小常量后再导出')
    manifest = {'version': 1, 'exporter_version': 'quant-indicator-export-3', 'target': target,
                'platform_version': TARGETS[target][1], 'candidate_id': candidate.pk, 'source_id': candidate.report.source_id,
                'report_id': candidate.report_id, 'candidate_hash': digest(candidate.data), 'code_hash': digest(code),
                'recipe': spec, 'artifact_kind': 'indicator_calculation_not_ea', 'verification': 'platform_compile_and_equivalence_pending',
                'parameter_status': 'source_declared_or_archived_candidate_values_not_live_settings',
                'limitations': ['仅导出受控表达式，不转换原策略的下单、仓位、风控、状态或画图逻辑。',
                    '窗口包含当前已收盘柱；要求完整窗口、缺失传播、总体标准差；布尔输出在平台图中为 1/0。',
                    '原平台语义、复权、行情、成交量单位及参数文字约束仍需核对；代码不证明收益。',
                    'Python 可从聚宽等平台提供的已收盘 OHLCV 数据调用，未绑定平台数据或交易 API。',
                    'Pine 隐藏未确认柱；MQL4/通达信隐藏最后一柱。时间戳与可见输出对齐需自行核对。',
                    'MQL4 使用真实 volume 而非 tick_volume；无真实成交量的市场不能将两者替代。',
                    '通达信参数以 P0 等赋值展示，请按 manifest 对照；VOL 为平台单位，不自动换算。',
                    'MQL4 为全量重算参考指标，最多 20000 根；正式使用前需验证性能。'],
                'references': ['https://www.tradingview.com/pine-script-docs/concepts/inputs/',
                    'https://docs.mql4.com/basis/function/events', 'https://docs.mql4.com/customind/setindexbuffer',
                    'https://help.tdx.com.cn/gspt/docs/markdown/redword/functionlist.html']}
    if candidate.data.get('formula_version'):
        manifest['formula_version'] = candidate.data['formula_version']
        manifest['source_role'] = 'ancestor_context_not_authored_formula_source'
        manifest['parameter_status'] = 'authored_candidate_values_not_source_defaults_or_live_settings'
        manifest['limitations'].append('此公式为独立人工修订；来源与报告指向祖先上下文，不是新公式的源码摘录或评分。')
        if candidate.data['formula_version']['origin'] == 'ai_study':
            manifest['source_role'] = 'ancestor_context_not_ai_study_formula_source'
            manifest['parameter_status'] = 'research_hypothesis_not_actual_runtime_configuration'
            manifest['limitations'][-1] = 'AI自动研究产生的候选；祖先源码和评分不属于该公式，没有实证表现认证。'
        if candidate.data['formula_version']['origin'] == 'ai_repair':
            manifest['source_role'] = 'ancestor_context_not_ai_revised_formula_source'
            manifest['parameter_status'] = 'ai_revised_candidate_values_not_native_defaults_or_live_settings'
            manifest['limitations'][-1] = '此公式为独立 AI 定义修订；祖先来源不是新定义的源码摘录或评分，原平台等价和实证仍待验证。'
    if target == 'tongdaxin' and encoding['values']:
        manifest['categorical_encoding'] = encoding
        manifest['limitations'].append('通达信文字枚举按 categorical_encoding 的全局整数码输入，保留区分大小写的相等语义；代码拒绝未声明的码值。不要把编码当作连续数值优化。')
    if spec['string_choices']:
        manifest['limitations'].append('Python/Pine/MQL4 保留文字枚举；仅用于相等判断。Python 与 MQL4 拒绝非法选项，Pine 使用声明选项菜单；MQL4 字符串输入不参与原生优化器枚举。')
        manifest['references'] += ['https://docs.mql4.com/strings/stringcompare', 'https://docs.mql4.com/basis/variables/inputvariables']
    if any(node['op'] in ('ts_rank', 'gate') for node, _ in flatten(spec['expression'])):
        manifest['operator_semantics'] = {'ts_rank': '(count_less + 0.5 * count_equal) / full_trailing_window',
            'gate': 'retain_left_only_when_right_is_true_else_missing'}
        manifest['limitations'] += ['排序为时序中点秩，满窗口且含当前已收盘柱；不是跨资产排序，尺度变化后须核对信号阈值。',
            '门控不成立或条件缺失时输出缺失；本机模拟器因此空仓，missing_signals也包含主动屏蔽。',
            '通达信排序用逐项历史比较展开；可调窗口覆盖1–2000，长公式须经原平台编译及性能验收。']
        manifest['references'].append('https://www.tradingview.com/pine-script-docs/language/loops/')
    if any('domain' in row for row in candidate.data['parameters']):
        from quant.parameters.domains import renamed
        mapping = {original: name for name, original in spec['parameter_names'].items()}
        manifest['parameter_domains'] = [{'name': row['name'], 'domain': row['domain']}
            for row in renamed(candidate.data['parameters'], mapping) if 'domain' in row]
        manifest['limitations'].append('导出默认值已检查声明约束；目标平台修改参数后须按 parameter_domains 重新核对，当前导出代码未实现全部约束。')
    return {'filename': f'factor-{candidate.pk}.{TARGETS[target][0]}', 'code': code,
            'manifest_json': json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False)}
