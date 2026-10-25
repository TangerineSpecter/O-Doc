"""Exact uploaded-ledger arithmetic, not platform authenticity verification."""
from decimal import Decimal, localcontext
from quant.research.contracts import digest
from rest_framework.exceptions import ValidationError
from .common import decimal, number_text, seal

METRICS = ('closed_trades', 'wins', 'losses', 'breakeven', 'reported_profit_sum', 'net_profit',
           'gross_profit', 'gross_loss', 'win_rate', 'profit_factor', 'expectancy', 'net_cash_flow',
           'final_reconstructed_balance', 'balance_drawdown_amount', 'balance_drawdown_fraction',
           'equity_drawdown_amount', 'equity_drawdown_fraction')


def net_value(row: dict) -> Decimal | None:
    profit = decimal(row['profit'])
    if row['profit_basis'] == 'net':
        return profit  # Costs included already: never subtract them a second time.
    if row['profit_basis'] == 'gross' and all(row[key] is not None for key in ('commission', 'swap', 'fees')):
        with localcontext() as context:
            context.prec = 256
            return profit + sum((decimal(row[key]) for key in ('commission', 'swap', 'fees')), Decimal(0))
    return None


def drawdown(values: list[Decimal]) -> tuple[Decimal | None, Decimal | None]:
    if len(values) < 2:
        return None, None
    peak, maximum, fraction, valid_denominator = values[0], Decimal(0), Decimal(0), True
    for value in values:
        peak = max(peak, value)
        loss = peak - value
        maximum = max(maximum, loss)
        if peak <= 0:
            valid_denominator = False
        else:
            fraction = max(fraction, loss / peak)
    return maximum, fraction if valid_denominator else None


def account(evidence: dict) -> dict:
    if not isinstance(evidence, dict) or evidence.get('content_hash') != digest({key: value for key, value in evidence.items() if key != 'content_hash'}):
        raise ValidationError('执行证据哈希无效，不能核算已变更的事实')
    with localcontext() as context:
        context.prec = 256
        return _account(evidence)


def _account(evidence: dict) -> dict:
    meta, records = evidence['metadata'], evidence['records']
    trades = [row for row in records if row['kind'] == 'trade']
    nets = [net_value(row) for row in trades]
    net_complete = bool(trades) and all(value is not None for value in nets)
    if any(row['code'] == 'non_closing_costs' for row in evidence['warnings']):
        net_complete = False
    reported_total = sum((decimal(row['profit']) for row in trades), Decimal(0))
    known = [value for value in nets if value is not None]
    wins, losses = sum(value > 0 for value in known), sum(value < 0 for value in known)
    positive, negative = sum((value for value in known if value > 0), Decimal(0)), sum((value for value in known if value < 0), Decimal(0))
    flows = sum((decimal(row['amount']) for row in records if row['kind'] == 'cash_flow'), Decimal(0))
    current = decimal(meta['initial_balance']) if meta['initial_balance'] is not None else None
    balance_values = [current] if current is not None else []
    equity_values, path, mismatches, anomalies = [], [], [], []
    tolerance, checked, unknown = decimal(meta['balance_tolerance']), 0, 0
    uncertain = evidence['parser_status'] != 'parsed' or meta['cash_flow_coverage'] != 'complete'
    for warning in evidence['warnings']:
        anomalies.append({'code': warning['code'], 'record_id': warning['ref'], 'message': warning['message'],
                          'ref': f'accounting:anomaly:{len(anomalies)}'})
    for row in records:
        delta = Decimal(0)
        if row['kind'] == 'trade':
            value = net_value(row)
            if value is None:
                uncertain = True
                anomalies.append({'code': 'unknown_net_costs', 'record_id': row['id'],
                    'message': '净毛利润或成本不完整；余额仅按报告 Profit 列尝试对照，不把它认定为已核验净收益。',
                    'ref': f'accounting:anomaly:{len(anomalies)}'})
                delta = decimal(row['profit']) if row['profit_basis'] == 'unknown' else None
            else:
                delta = value
        elif row['kind'] == 'cash_flow':
            delta = decimal(row['amount'])
        elif row['kind'] == 'equity':
            equity_values.append(decimal(row['equity']))
        elif row.get('profit') is not None and decimal(row['profit']) != 0:
            delta, uncertain, net_complete = decimal(row['profit']), True, False
            anomalies.append({'code': 'non_closing_profit', 'record_id': row['id'],
                'message': '非平仓事件含金额，余额保留其变化，但不能混入完整平仓净收益统计。',
                'ref': f'accounting:anomaly:{len(anomalies)}'})
        current = current + delta if current is not None and delta is not None else None
        if current is not None and (row['kind'] in ('trade', 'cash_flow') or delta != 0):
            balance_values.append(current)
            path.append({'id': row['id'], 'timestamp': row['timestamp'], 'value': number_text(current), 'ref': row['ref']})
        observed = row.get('balance')
        if observed is not None:
            if current is None:
                unknown += 1
            else:
                checked += 1
                difference = decimal(observed) - current
                if abs(difference) > tolerance:
                    mismatches.append({'id': row['id'], 'expected': number_text(current), 'reported': observed,
                                       'difference': number_text(difference), 'ref': f'accounting:reconciliation:{row["id"]}'})
        elif row['kind'] in ('trade', 'cash_flow'):
            unknown += 1
    money_unit, metrics = meta['currency'] or 'unknown_currency', {}
    def put(key: str, value, unit: str, reason=''):
        metrics[key] = {'value': number_text(Decimal(value)) if value is not None else None, 'unit': unit,
            'status': 'computed' if value is not None else 'unavailable', 'reason': reason, 'ref': f'accounting:{key}'}
    put('closed_trades', len(trades), 'count', 'MT4 表示平仓事件数；分批平仓不等同独立完整交易。' if evidence['adapter'] == 'mt4-tester-html-v1' else '')
    put('reported_profit_sum', reported_total if trades else None, money_unit, '仅汇总上传的 Profit，不自行确认净毛口径或记录完整性。')
    put('net_cash_flow', flows, money_unit, '仅汇总上传现金流；覆盖声明不等于独立核实。')
    unavailable = '利润净毛口径、费用或非平仓金额不完整，不能把缺失补零。'
    for key, value, unit in (
            ('net_profit', sum(known, Decimal(0)), money_unit), ('gross_profit', positive, money_unit),
            ('gross_loss', negative, money_unit), ('wins', wins, 'count'), ('losses', losses, 'count'),
            ('breakeven', len(known) - wins - losses, 'count'),
            ('win_rate', Decimal(wins) / len(trades) if trades else None, 'fraction'),
            ('expectancy', sum(known, Decimal(0)) / len(trades) if trades else None, money_unit)):
        put(key, value if net_complete else None, unit, '' if net_complete else unavailable)
    put('profit_factor', positive / abs(negative) if net_complete and negative else None, 'ratio',
        '' if net_complete and negative else '没有已知亏损分母或净收益口径不完整，不用无穷大或零代替。')
    event_metrics = {'closed_trades', 'wins', 'losses', 'breakeven', 'win_rate', 'expectancy',
                     'profit_factor', 'gross_profit', 'gross_loss'}
    if evidence['adapter'] == 'mt4-tester-html-v1':
        for key in event_metrics:
            metrics[key]['reason'] = (metrics[key]['reason'] + ' 仅按已记录平仓事件统计，分批事件不能冒充独立完整交易。').strip()
    put('final_reconstructed_balance', current, money_unit,
        '按记录顺序和报告 Profit/现金流重建；成本或现金流覆盖未知时不证明实际账户余额。' if uncertain else '')
    balance_dd, balance_fraction = drawdown(balance_values)
    equity_dd, equity_fraction = drawdown(equity_values)
    for prefix, loss, fraction in (('balance', balance_dd, balance_fraction), ('equity', equity_dd, equity_fraction)):
        reason = ('只使用实际提供的净值采样；非采样时点风险未知。' if prefix == 'equity' else '余额采样回撤不包含持仓浮亏。')
        if flows or meta['cash_flow_coverage'] != 'complete':
            reason += '未作现金流时点净值调整，现金流可能改变该原始采样回撤。'
        put(prefix + '_drawdown_amount', loss, money_unit, reason if loss is not None else '至少需要两处有效采样，不能从余额补造净值。')
        put(prefix + '_drawdown_fraction', fraction, 'fraction', reason if fraction is not None else '缺少两处有效采样或正的峰值分母。')
    scope_uncertain = any(row['code'] in ('partial_close', 'unmatched_close', 'duplicate_open', 'unknown_operation',
        'remaining_orders', 'incomplete_html_rows', 'unparsed_table_row') for row in evidence['warnings'])
    comparison = compare_reported(evidence['reported_metrics'], metrics, tolerance, adapter=evidence['adapter'],
                                  incomparable=event_metrics if scope_uncertain else set())
    mismatch = bool(mismatches) or any(row['status'] == 'mismatch' for row in comparison)
    status = 'mismatch' if mismatch else 'insufficient' if uncertain or not checked or unknown or anomalies or not net_complete else 'reconciled'
    return seal({'version': 1, 'method': 'execution-accounting-v1', 'evidence_hash': evidence['content_hash'], 'status': status,
        'counts': {**evidence['counts'], 'known_net_trades': len(known), 'negative_net_trades': losses},
        'metrics': metrics, 'reconciliation': {'checked_rows': checked, 'unknown_rows': unknown, 'mismatches': mismatches},
        'reported_comparison': comparison, 'anomalies': anomalies, 'balance_path': path,
        'limitations': ['本机只复核上传记录的算术与声明差异，不证明平台来源、完整成交、真实资金或实盘盈利。',
                       'gross_profit/gross_loss 为正/负净交易结果分组，不是重新推断未记录的费用。',
                       '未计算 TWR、CAGR、Sharpe；缺少现金流时点净值或完整收益序列时不能可靠推算。',
                       '净值与余额回撤仅限各自采样；现金流未经时点调整，不能当作资金加权或时间加权回报。',
                       *evidence['limitations']]})


def compare_reported(reported: list[dict], metrics: dict, tolerance: Decimal, *, adapter: str,
                     incomparable: set[str]) -> list[dict]:
    output = []
    for row in reported:
        name = row['name']
        metric = metrics.get(name)
        result = {'name': name, 'reported': row['value'], 'computed': metric['value'] if metric else None,
                  'difference': None, 'status': 'unmapped' if not metric else 'unavailable', 'ref': row['ref']}
        if name in incomparable:
            result.update(computed=None, status='unavailable')
            output.append(result)
            continue
        same_unit = metric and row['unit'] == metric['unit']
        # Only the explicit MT4 canonical labels establish an implicit common
        # account/count/ratio unit. Arbitrary uploaded text does not.
        if metric and adapter == 'mt4-tester-html-v1' and not row['unit']:
            same_unit = True
        if metric and not same_unit:
            result['status'] = 'unmapped'
        elif metric and metric['value'] is not None:
            try:
                value = decimal(row['value'])
            except ValidationError:
                result['status'] = 'not_numeric'
            else:
                difference = value - Decimal(metric['value'])
                result.update(difference=number_text(difference), status='matched' if abs(difference) <= (
                    tolerance if metric['unit'] not in ('fraction', 'ratio', 'count') else Decimal(0)) else 'mismatch')
        output.append(result)
    return output
