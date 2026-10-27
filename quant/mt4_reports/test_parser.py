from io import BytesIO
import unittest
import zipfile

from .archive import read_zip
from .parser import ReportError, parse_report


HTML = '''<html><head><title>Strategy Tester: Example</title>
<meta name="server" content="Demo"></head><body><table>
<tr><td>交易品种</td><td>EURUSD</td></tr>
<tr><td>时间周期</td><td>M5</td></tr>
<tr><td>参数</td><td>label="a;b"; lot=0.01;</td></tr>
<tr><td>起始资金</td><td>10000.00</td><td>点差</td><td>6</td></tr>
</table><img src="StrategyTester.gif"><table>
<tr><td>#</td><td>时间</td><td>类型</td><td>订单</td><td>手数</td><td>价格</td><td>止损</td><td>止盈</td><td>获利</td><td>余额</td></tr>
<tr><td>1</td><td>2023.01.01 01:00</td><td>buy</td><td>4</td><td>0.01</td><td>1.00000</td><td>0</td><td>0</td><td colspan="2"></td></tr>
<tr><td>2</td><td>2023.01.01 02:00</td><td>close</td><td>4</td><td>0.01</td><td>1.00010</td><td>0</td><td>0</td><td>1.00</td><td>10001.00</td></tr>
</table></body></html>'''.encode('gb18030')


def make_zip(files):
    result = BytesIO()
    with zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, contents in files:
            archive.writestr(name, contents)
    return result.getvalue()


class MT4ReportTests(unittest.TestCase):
    def test_report_filters_annotations_and_magic_but_keeps_real_parameters(self):
        data = HTML.decode('gb18030').replace('label="a;b"; lot=0.01;',
            'comm2="Max spread:"; MaxSpread=5; Trade_Lot_Settings="Trade lot:"; '
            'start_lot=0.01; increment=0.02; tp_in_money=3; Comments="DRIVER EURUSD"; magic=999222; '
            'Magic_Number=12; commission=1.5; MagicMultiplier=2; mode="a;b"; Lot_Settings=4;')
        report = parse_report(data.encode('gb18030'))
        self.assertEqual([p['name'] for p in report['parameters']],
                         ['MaxSpread', 'start_lot', 'increment', 'tp_in_money', 'commission', 'MagicMultiplier', 'mode', 'Lot_Settings'])
        self.assertEqual(report['parameters'][-2]['value'], '"a;b"')
        self.assertNotIn('parameters', report['fields'])

    def test_metric_prefix_colons_are_normalized_without_touching_values(self):
        data = HTML.replace(b'</table><img', '<tr><td>最大:</td><td>获利交易</td><td>67.13</td><td>亏损交易</td><td>-25.23</td></tr><tr><td>平均：</td><td>连续获利</td><td>3</td><td>连续亏损</td><td>1</td></tr><tr><td>普通标签:</td><td>8 (30.17)</td></tr></table><img'.encode('gb18030'))
        metrics = parse_report(data)['metrics']
        self.assertIn(['最大', '获利交易', '67.13', '亏损交易', '-25.23'], metrics)
        self.assertIn(['平均', '连续获利', '3', '连续亏损', '1'], metrics)
        self.assertIn(['普通标签:', '8 (30.17)'], metrics)

    def test_report_preserves_events_and_parameter_strings(self):
        report = parse_report(HTML)
        self.assertEqual(report['fields']['symbol'], 'EURUSD')
        self.assertEqual(report['parameters'][0], {'name': 'label', 'value': '"a;b"'})
        self.assertEqual(report['events'][0]['profit'], '')
        self.assertEqual(report['events'][1]['balance'], '10001.00')
        self.assertEqual(report['events'][1]['order'], '4')

    def test_utf16_and_non_report(self):
        report = parse_report(HTML.decode('gb18030').encode('utf-16'))
        self.assertEqual(len(report['events']), 2)
        with self.assertRaises(ReportError):
            parse_report(b'<html>not a report</html>')

    def test_rejects_reordered_or_incomplete_trade_rows(self):
        reordered = HTML.replace('时间</td><td>类型'.encode('gb18030'), '类型</td><td>时间'.encode('gb18030'))
        with self.assertRaisesRegex(ReportError, '表头'):
            parse_report(reordered)
        incomplete = HTML.replace(b'<td>0.01</td><td>1.00010</td><td>0</td><td>0</td><td>1.00</td><td>10001.00</td>', b'<td>0.01</td>')
        with self.assertRaisesRegex(ReportError, '第 2 行'):
            parse_report(incomplete)

    def test_invalid_or_missing_sequence_never_drops_a_trade(self):
        for sequence in (b'x', b''):
            bad = HTML.replace(b'<td>2</td><td>2023.01.01 02:00', b'<td>' + sequence + b'</td><td>2023.01.01 02:00')
            with self.subTest(sequence=sequence), self.assertRaisesRegex(ReportError, '无效序号'):
                parse_report(bad)

    def test_empty_separator_and_following_unrelated_table_are_not_trades(self):
        data = HTML.replace(b'</table></body>', b'<tr><td></td></tr></table><table><tr><td>End of report</td></tr></table></body>')
        self.assertEqual(len(parse_report(data)['events']), 2)

    def test_standard_english_columns(self):
        text = HTML.decode('gb18030')
        translations = {'交易品种': 'Symbol', '时间周期': 'Period', '参数': 'Inputs', '时间': 'Time',
                        '类型': 'Type', '订单': 'Order', '手数': 'Size', '价格': 'Price',
                        '止损': 'S/L', '止盈': 'T/P', '获利': 'Profit', '余额': 'Balance'}
        for source, target in translations.items():
            text = text.replace(f'>{source}<', f'>{target}<')
        result = parse_report(text.encode('utf-8'))
        self.assertEqual(result['events'][1]['balance'], '10001.00')

    def test_zip_resolves_referenced_image_only(self):
        bundle = read_zip(make_zip([('folder/report.htm', HTML), ('folder/StrategyTester.gif', b'gif')]))
        self.assertEqual(bundle.image, b'gif')
        self.assertEqual(len(bundle.report['events']), 2)
        without_image = read_zip(make_zip([('report.htm', HTML)]))
        self.assertEqual(without_image.image, b'')

    def test_zip_rejects_traversal_and_multiple_reports(self):
        for files in ([('../report.htm', HTML)], [('a.htm', HTML), ('b.htm', HTML)]):
            with self.subTest(files=files), self.assertRaises(ReportError):
                read_zip(make_zip(files))
