"""Deterministic standalone MQL4 tester candidate with explicit mapping limits."""
import hashlib
import json
from pathlib import Path
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .signal_v1 import HELPERS, MQL_HELPER, calculations
from quant.exports.series import flatten
from quant.exports.categories import literal
from .spec import VERSION, LIMITATIONS, REFERENCES

PERIODS = {'1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440, '1w': 10080, '1mo': 43200}


def native_inputs(context: dict, identity: str) -> dict:
    policy, config = context['config']['strategy'], context['config']
    return {**context['recipe']['parameters'], 'QExpectedSymbol': context['market'].get('symbol') or '',
        'QExpectedPeriod': PERIODS.get(context['market'].get('timeframe', ''), 0),
        'QDirection': {'long_only': 1, 'short_only': -1, 'long_short': 0}[policy['direction']],
        'QBooleanSide': 1 if policy['boolean_side'] == 'long' else -1,
        'QLongEntry': float(config['threshold']), 'QLongExit': float(policy['long_exit_threshold']),
        'QShortEntry': float(policy['short_entry_threshold']), 'QShortExit': float(policy['short_exit_threshold']),
        'QPositionFraction': policy['position_fraction'], 'QStopLoss': policy['stop_loss_fraction'] or 0.,
        'QTakeProfit': policy['take_profit_fraction'] or 0., 'QMaxHoldingBars': policy['max_holding_bars'],
        'QCooldownBars': policy['cooldown_bars'], 'QMaxEntries': policy['max_entries'],
        'QSameOpenReversal': policy['same_open_reversal'], 'QMaxDeviationPoints': 0,
        'QMagic': int(identity[:7], 16) + 1}


def identity(context: dict) -> str:
    return digest([VERSION, context])[:40]


def bundle(context: dict) -> dict:
    artifact_id, spec = identity(context), context['recipe']
    inputs = native_inputs(context, artifact_id)
    lines = ['// O-Doc native candidate: generated source, not compiled/validated platform evidence.',
        '#property strict', '#property version "1.00"']
    for name, value in inputs.items():
        kind = 'string' if isinstance(value, str) else 'bool' if type(value) is bool else 'int' if type(value) is int else 'double'
        lines.append(f'input {kind} {name} = {literal(value)};')
    lines += [f'const string QArtifactID={literal(artifact_id)};', f'const string QRequestID={literal(context["request_id"])};',
        f'const string QExporterVersion={literal(VERSION)};',
        f'const bool QBooleanSignal={literal(spec["output_type"] == "boolean_series")};', HELPERS]
    if any(node['op'] == 'ts_rank' for node, _ in flatten(spec['expression'])): lines.append(MQL_HELPER)
    guards = [f'({name}>=1 && {name}<=2000)' for name in spec['windows']]
    guards += ['(' + ' || '.join(f'StringCompare({name},{literal(value)},true)==0' for value in values) + ')' for name, values in spec['string_choices'].items()]
    lines.append('bool QSignalInputsValid() { return ' + (' && '.join(guards) or 'true') + '; }')
    lines += ['double QClosedSignal() {', 'MqlRates rates[]; ArraySetAsSeries(rates,false);',
        'int rates_total=CopyRates(Symbol(),Period(),0,20000,rates);', 'if(rates_total<2) return EMPTY_VALUE;',
        'double open[],high[],low[],close[];',
        'ArrayResize(open,rates_total); ArrayResize(high,rates_total); ArrayResize(low,rates_total); ArrayResize(close,rates_total);',
        'for(int i=0;i<rates_total;i++) { open[i]=rates[i].open; high[i]=rates[i].high; low[i]=rates[i].low; close[i]=rates[i].close; }']
    lines += calculations(spec, invalid='EMPTY_VALUE')
    lines += [f'return v{len(flatten(spec["expression"])) - 1}[rates_total-2];', '}']
    # Audit values come from inputs at native run time, never copied from a prior local result.
    values = [f'QItem({literal(name)},' + (name if isinstance(value, str) else f'({name} ? "true" : "false")' if type(value) is bool else f'IntegerToString({name})' if type(value) is int else f'QNum({name})') + ')'
        for name, value in inputs.items()]
    lines.append('string QParameters() { return "["+' + '+","+'.join(values) + '+"]"; }')
    lines += [Path(__file__).with_name('runtime_v1.mq4').read_text(), Path(__file__).with_name('audit_v1.mq4').read_text()]
    code = '\n'.join(lines) + '\n'
    if len(code.encode()) > 200000: raise ValidationError('EA候选代码超过200KB，请减少公式复杂度')
    manifest = {'version': 1, 'exporter_version': VERSION, 'artifact_id': artifact_id, 'artifact_kind': 'mt4_tester_strategy_candidate',
        'target': 'mql4', 'verification': 'native_compile_run_and_equivalence_pending', 'source_role': 'generated_from_evaluated_portable_hypothesis_not_original_native_source',
        'context': context, 'native_inputs': inputs, 'code_sha256': hashlib.sha256(code.encode()).hexdigest(),
        'reference_only_config': {key: context['config'][key] for key in ('fee_bps', 'slippage_bps')} | {'short_borrow_bps_per_bar': context['config']['strategy']['short_borrow_bps_per_bar']},
        'parameter_mapping': spec['parameter_names'], 'limitations': LIMITATIONS,
        'required_validation': ['MetaEditor编译及警告', '已收盘OHLC与输入时点对照', '合约tick价值与账户货币/手数换算',
            '实际输入/交易/原生日志与本机配置差异', '测试器tick模型/时区/手续费及未平仓状态', '独立新数据；不得用本次留出作为新一轮独立证据'],
        'feedback_adapter': 'standard-execution-json-v1', 'native_output': 'tester/files/odoc-<artifact>-<server-time>-<tick-count>.json',
        'references': REFERENCES}
    return {'filename': f'strategy-{artifact_id}.mq4', 'code': code,
        'manifest_json': json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False)}
