"""Pure import/accounting: exact, bounded, causal and no uploaded execution."""
import copy
import json
from unittest.mock import patch
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError
from quant.execution_evidence import normalize, normalize_options, account, model_projection
from quant.research.contracts import digest

JSON = 'standard-execution-json-v1'
CSV = 'standard-execution-csv-v1'
MT4 = 'mt4-tester-html-v1'


class ExecutionEvidenceTests(SimpleTestCase):
    def document(self, rows, **fields):
        return json.dumps({'version': 1, 'metadata': {'currency': 'USD', 'initial_balance': '100',
            'profit_basis': 'net', 'cash_flow_coverage': 'complete'}, 'records': rows, **fields})

    def trade(self, identity='1', profit='10', **fields):
        return {'kind': 'trade', 'id': identity, 'timestamp': '2026-01-01T00:00:00Z', 'profit': profit, **fields}

    def html(self, rows, *, parameters='N=20; Mode="a;b";', initial='100.00', summary=''):
        header = '<tr><td>#</td><td>Time</td><td>Type</td><td>Order</td><td>Size</td><td>Price</td><td>S/L</td><td>T/P</td><td>Profit</td><td>Balance</td></tr>'
        body = ''.join('<tr>' + ''.join(f'<td>{value}</td>' for value in row) + '</tr>' for row in rows)
        return (f'<html><script>raise RuntimeError("never run")</script><table><tr><td>Initial deposit:</td><td>{initial}</td></tr>'
                f'<tr><td>Parameters:</td><td>{parameters}</td></tr>{summary}{header}{body}</table></html>')

    def test_net_costs_not_double_deducted_and_cash_flows_separate(self):
        rows = [self.trade(profit='10', commission='-2', swap='-1', fees='-3', balance='110'),
                {'kind': 'cash_flow', 'id': 'deposit', 'timestamp': '2026-01-01T01:00:00Z', 'amount': '50', 'balance': '160'},
                self.trade('2', '-4', timestamp='2026-01-01T02:00:00Z', balance='156')]
        evidence = normalize(self.document(rows), JSON)
        result = account(evidence)
        self.assertEqual(result['status'], 'reconciled')
        for key, value in {'net_profit': '6', 'reported_profit_sum': '6', 'net_cash_flow': '50',
                           'final_reconstructed_balance': '156', 'wins': '1', 'losses': '1'}.items():
            self.assertEqual(result['metrics'][key]['value'], value)
        self.assertEqual(result['reconciliation']['checked_rows'], 3)
        self.assertIsNone(result['metrics']['equity_drawdown_amount']['value'])
        self.assertNotIn('cagr', result['metrics'])

    def test_gross_signed_fees_and_negative_sample_priority(self):
        rows = [self.trade(str(i), '1') for i in range(12)]
        rows.append(self.trade('loss', '10', profit_basis='gross', commission='-20', swap='0', fees='0'))
        evidence = normalize(self.document(rows), JSON)
        result = account(evidence)
        self.assertEqual(result['metrics']['net_profit']['value'], '2')
        summary = model_projection(evidence, result)
        self.assertEqual(summary['sample_records'][0]['id'], 'loss')
        self.assertEqual(summary['omitted_records'], 1)

    def test_missing_gross_fee_stays_unknown_not_zero(self):
        evidence = normalize(self.document([self.trade('1', '10', profit_basis='gross', commission='-1')]), JSON)
        result = account(evidence)
        self.assertIsNone(result['metrics']['net_profit']['value'])
        self.assertIsNone(result['metrics']['final_reconstructed_balance']['value'])
        self.assertEqual(result['status'], 'insufficient')
        self.assertTrue(any(row['code'] == 'unknown_net_costs' for row in result['anomalies']))

    def test_exact_decimal_balance_and_all_mismatches_preserved(self):
        rows = [self.trade('1', '0.1', balance='100.1'), self.trade('2', '0.2', balance='101.3')]
        result = account(normalize(self.document(rows), JSON))
        self.assertEqual(result['metrics']['net_profit']['value'], '0.3')
        self.assertEqual(result['status'], 'mismatch')
        self.assertEqual(result['reconciliation']['mismatches'], [{'id': '2', 'expected': '100.3',
            'reported': '101.3', 'difference': '1', 'ref': 'accounting:reconciliation:2'}])

    def test_actual_equity_only_sampled_drawdown_and_nonpositive_denominator(self):
        rows = [{'kind': 'equity', 'id': str(i), 'timestamp': f'2026-01-01T0{i}:00:00Z', 'equity': value}
                for i, value in enumerate(('100', '80', '120', '90'))]
        result = account(normalize(self.document(rows), JSON))
        self.assertEqual(result['metrics']['equity_drawdown_amount']['value'], '30')
        self.assertEqual(result['metrics']['equity_drawdown_fraction']['value'], '0.25')
        self.assertIsNone(result['metrics']['balance_drawdown_amount']['value'])
        rows[0]['equity'] = '0'
        result = account(normalize(self.document(rows), JSON))
        self.assertIsNone(result['metrics']['equity_drawdown_fraction']['value'])

    def test_csv_multiline_provenance_and_metadata_options(self):
        document = 'kind,id,timestamp,profit,balance,symbol\ntrade,one,2026-01-01T00:00:00Z,-10,90,"A\nB"\n'
        evidence = normalize(document, CSV, {'currency': 'USD', 'initial_balance': '100', 'profit_basis': 'net'})
        row = evidence['records'][0]
        self.assertEqual(row['sequence'], 1)
        self.assertEqual(row['provenance']['line'], 2)
        self.assertEqual(row['provenance']['quote'], document.split('\n', 1)[1])
        self.assertEqual(account(evidence)['metrics']['net_profit']['value'], '-10')

    def test_reported_units_explicit_and_fraction_repeating_does_not_crash(self):
        rows = [self.trade('1', '2'), self.trade('2', '-1'), self.trade('3', '-1')]
        metrics = [{'name': 'win_rate', 'value': '0.33333333', 'unit': 'fraction'},
                   {'name': 'net_profit', 'value': '0', 'unit': 'EUR'},
                   {'name': 'closed_trades', 'value': '3', 'unit': 'count'},
                   {'name': 'win_rate_other', 'value': '33.33%', 'unit': '%'}]
        result = account(normalize(self.document(rows, reported_metrics=metrics), JSON))
        self.assertEqual(result['reported_comparison'][1]['status'], 'unmapped')
        self.assertEqual(result['reported_comparison'][2]['status'], 'matched')
        self.assertEqual(result['reported_comparison'][3]['status'], 'unmapped')

    def test_mt4_operations_are_not_all_closed_trades_and_unknown_costs(self):
        document = self.html([
            ('1', '2026.01.01 00:00', 'buy', '7', '1', '1.1', '0', '0', '', ''),
            ('2', '2026.01.01 01:00', 'modify', '7', '1', '1.1', '0', '0', '', ''),
            ('3', '2026.01.01 02:00', 's/l', '7', '1', '1.0', '0', '0', '-10', '90')])
        evidence = normalize(document, MT4, {'timezone': 'UTC'})
        self.assertEqual(evidence['counts'], {'records': 3, 'trades': 1, 'cash_flows': 0, 'equity': 0, 'operations': 2})
        self.assertEqual([row['value'] for row in evidence['parameters']], ['20', '"a;b"'])
        result = account(evidence)
        self.assertEqual(result['reconciliation']['checked_rows'], 1)
        self.assertEqual(result['metrics']['reported_profit_sum']['value'], '-10')
        self.assertIsNone(result['metrics']['net_profit']['value'])
        self.assertEqual(result['status'], 'insufficient')
        self.assertIn('<tr>', evidence['records'][2]['provenance']['quote'])

    def test_mt4_partial_unmatched_unknown_and_remaining_orders_retained(self):
        document = self.html([
            ('1', '2026.01.01 00:00', 'buy', '7', '1', '1.1', '0', '0', '', ''),
            ('2', '2026.01.01 01:00', 'close', '7', '0.5', '1.1', '0', '0', '-2', '98'),
            ('3', '2026.01.01 02:00', 'close', '8', '1', '1.0', '0', '0', '-3', '95'),
            ('4', '2026.01.01 03:00', 'mystery', '9', '1', '1.0', '0', '0', '-1', '94')])
        evidence = normalize(document, MT4)
        codes = {row['code'] for row in evidence['warnings']}
        self.assertTrue({'partial_close', 'unmatched_close', 'unknown_operation', 'remaining_orders', 'unknown_timestamp'} <= codes)
        self.assertEqual(len(evidence['records']), 4)
        self.assertEqual(account(evidence)['metrics']['reported_profit_sum']['value'], '-5')

    def test_unsupported_mt4_and_unclosed_negative_row_not_silently_complete(self):
        evidence = normalize('<html><table><tr><td>Profit 100</td></tr></table></html>', MT4)
        self.assertEqual(evidence['parser_status'], 'unsupported')
        self.assertEqual(account(evidence)['status'], 'insufficient')
        broken = self.html([]).replace('</table>', '<tr><td>9</td><td>-100</td>')
        evidence = normalize(broken, MT4)
        self.assertEqual(evidence['parser_status'], 'partial')
        self.assertTrue(any(row['code'] == 'incomplete_html_rows' for row in evidence['warnings']))

    def test_timestamp_unknown_explicit_timezone_dst_and_causal_order(self):
        rows = [self.trade(timestamp='2026-01-01 00:00:00')]
        evidence = normalize(self.document(rows), JSON)
        self.assertIsNone(evidence['records'][0]['timestamp'])
        fixed = normalize(self.document(rows), JSON, {'timezone': 'Asia/Shanghai'})
        self.assertEqual(fixed['records'][0]['timestamp'], '2025-12-31T16:00:00.000000Z')
        rows[0]['timestamp'] = '2026-11-01 01:30:00'
        ambiguous = normalize(self.document(rows), JSON, {'timezone': 'America/New_York'})
        self.assertIsNone(ambiguous['records'][0]['timestamp'])
        with self.assertRaises(ValidationError):
            normalize(self.document([self.trade('1', timestamp='2026-01-02'), self.trade('2', timestamp='2026-01-01')]), JSON)

    def test_input_shape_duplicates_options_conflicts_and_decimal_budgets(self):
        for raw in ('1e9999999999999999999999999', 'NaN', '9' * 121):
            with self.subTest(raw=raw), self.assertRaises(ValidationError):
                normalize(self.document([self.trade(profit=raw)]), JSON)
        for rows in ([self.trade(), self.trade()], [self.trade(volume='-1')]):
            with self.assertRaises(ValidationError):
                normalize(self.document(rows), JSON)
        with self.assertRaises(ValidationError):
            normalize(self.document([]), JSON, {'currency': 'EUR'})
        with self.assertRaises(ValidationError):
            normalize(self.document([]), JSON, {'unknown': 'oops'})
        value = normalize(self.document([]), JSON, normalize_options())
        self.assertEqual(value['metadata']['currency'], 'USD')
        with self.assertRaises(ValidationError):
            normalize('{"version":1,"version":1,"records":[]}', JSON)

    def test_large_html_supported_and_record_cap_no_clipping(self):
        document = self.html([]) + '<!--' + 'padding' * 20000 + '-->'
        self.assertGreater(len(document), 60000)
        self.assertEqual(normalize(document, MT4)['adapter'], MT4)
        with self.assertRaises(ValidationError):
            normalize(self.document([self.trade(str(i)) for i in range(2001)]), JSON)

    def test_no_mutation_deterministic_hashes_and_summary_refs_bound(self):
        raw = self.document([self.trade(str(i), '-1' if i % 2 else '2', balance='999') for i in range(30)])
        options = {'timezone': 'UTC'}
        evidence = normalize(raw, JSON, options)
        result = account(evidence)
        saved = copy.deepcopy((evidence, result, options))
        summary = model_projection(evidence, result)
        self.assertEqual((evidence, result, options), saved)
        self.assertEqual(normalize(raw, JSON, options), evidence)
        self.assertEqual(account(evidence), result)
        self.assertEqual(len(summary['sample_records']), 12)
        self.assertEqual(summary['reconciliation']['mismatch_count'], 30)
        self.assertEqual(summary['reconciliation']['omitted'], 18)
        self.assertNotIn('provenance', summary['sample_records'][0])
        self.assertNotIn('document', summary)
        self.assertIn('accounting:net_profit', summary['refs'])
        summary['metrics']['net_profit']['value'] = 'tamper'
        self.assertEqual((evidence, result, options), saved)
        edited = copy.deepcopy(evidence)
        edited['records'][0]['profit'] = '100'
        with self.assertRaises(ValidationError):
            account(edited)
        with self.assertRaises(ValidationError):
            model_projection(edited, result)

    def test_mt4_duplicate_parameters_and_operation_ids_rejected(self):
        with self.assertRaises(ValidationError):
            normalize(self.html([], parameters='N=20;N=30;'), MT4)
        row = ('1', '2026.01.01 00:00', 'buy', '7', '1', '1.1', '0', '0', '', '')
        with self.assertRaises(ValidationError):
            normalize(self.html([row, row]), MT4)

    def test_mt4_declared_unknown_metrics_preserved_and_duplicate_balance_conflict(self):
        document = self.html([], summary='<tr><td>Modeling quality:</td><td>25.00%</td><td>Largest loss:</td><td>-900</td></tr>')
        evidence = normalize(document, MT4)
        reported = {row['name']: row['value'] for row in evidence['reported_metrics']}
        self.assertEqual(reported['modeling quality'], '25.00%')
        self.assertEqual(reported['largest loss'], '-900')
        document = document.replace('<td>25.00%</td>', '<td>25.00%</td>').replace('</table>',
            '<tr><td>Initial deposit:</td><td>200</td></tr></table>')
        # A post-event table row remains an explicit coverage warning, never
        # a silently reinterpreted reset of account capital.
        result = normalize(document, MT4)
        self.assertEqual(result['metadata']['initial_balance'], '100')
        self.assertEqual(result['parser_status'], 'partial')

    def test_loss_example_priority_includes_net_loss_after_costs(self):
        rows = [self.trade(str(i), '1') for i in range(20)]
        rows.append(self.trade('gross_positive', '10', profit_basis='gross', commission='-20', swap='0', fees='0'))
        evidence = normalize(self.document(rows), JSON)
        result = account(evidence)
        summary = model_projection(evidence, result)
        self.assertEqual(summary['sample_records'][0]['id'], 'gross_positive')

    def test_partial_close_count_not_compared_as_whole_platform_trades(self):
        document = self.html([
            ('1', '2026.01.01 00:00', 'buy', '7', '1', '1.1', '0', '0', '', ''),
            ('2', '2026.01.01 01:00', 'close', '7', '0.5', '1.1', '0', '0', '2', '102'),
            ('3', '2026.01.01 02:00', 'close', '7', '0.5', '1.1', '0', '0', '-1', '101')],
            summary='<tr><td>Total trades:</td><td>1</td></tr>')
        result = account(normalize(document, MT4, {'timezone': 'UTC', 'profit_basis': 'net'}))
        self.assertEqual(result['metrics']['closed_trades']['value'], '2')
        comparison = next(row for row in result['reported_comparison'] if row['name'] == 'closed_trades')
        self.assertEqual(comparison['status'], 'unavailable')
        self.assertIsNone(comparison['computed'])
