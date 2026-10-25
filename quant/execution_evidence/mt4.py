"""Read known MT4 Tester HTML tables without running or loading HTML assets."""
from decimal import Decimal
from html.parser import HTMLParser
import re
from rest_framework.exceptions import ValidationError
from .common import amount, decimal, metadata, provenance, text, MAX_RECORDS

LABELS = {'initial deposit': 'initial_balance', '初始入金': 'initial_balance', '初始存款': 'initial_balance',
          'total net profit': 'net_profit', '净利润': 'net_profit', '总净利润': 'net_profit',
          'gross profit': 'gross_profit', '总盈利': 'gross_profit', '毛利润': 'gross_profit',
          'gross loss': 'gross_loss', '总亏损': 'gross_loss', '毛亏损': 'gross_loss',
          'profit factor': 'profit_factor', '盈利因子': 'profit_factor', '获利因子': 'profit_factor',
          'expected payoff': 'expectancy', '预期收益': 'expectancy', '预期盈利': 'expectancy',
          'total trades': 'closed_trades', '总交易数': 'closed_trades', '总交易': 'closed_trades'}
HEADERS = {'#': 'sequence', 'time': 'timestamp', '时间': 'timestamp', 'type': 'operation', '类型': 'operation',
           'order': 'order_id', '订单': 'order_id', '单号': 'order_id', 'size': 'volume', '手数': 'volume',
           'price': 'price', '价格': 'price', 'profit': 'profit', '盈利': 'profit', '获利': 'profit', '利润': 'profit',
           'balance': 'balance', '结余': 'balance', '余额': 'balance', 'commission': 'commission',
           '手续费': 'commission', 'swap': 'swap', '库存费': 'swap', 'fees': 'fees'}
CLOSE = {'close', 's/l', 't/p', 'close at stop', 'close by', '平仓', '止损', '止盈'}
OPEN = {'buy', 'sell', '买入', '卖出'}
PENDING = {'buy stop', 'sell stop', 'buy limit', 'sell limit'}
OTHER = {'modify', 'delete', '修改', '删除'}


class Tables(HTMLParser):
    def __init__(self, document: str):
        super().__init__(convert_charrefs=True)
        self.document, self.rows, self.tables, self.current, self.cell, self.ignored = document, [], [], None, None, 0
        self.table_count, self.row_count, self.skip = 0, 0, 0
        self.offsets = [0, *[match.end() for match in re.finditer('\n', document)]]

    def source_offset(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        if self.skip:
            return
        if tag == 'table':
            self.table_count += 1
            self.tables.append(self.table_count)
        elif tag == 'tr':
            self.row_count += 1
            if self.row_count > 5000:
                raise ValidationError('HTML 表格超过 5000 行解析预算')
            if self.current is not None:
                self.ignored += 1
            self.current = {'cells': [], 'start': self.source_offset(), 'line': self.getpos()[0],
                            'table': self.tables[-1] if self.tables else 0, 'row': self.row_count}
            self.cell = None
        elif tag in ('td', 'th') and self.current is not None:
            if self.cell is not None:
                self.current['cells'].append(''.join(self.cell).strip())
                self.ignored += 1
            self.cell = []
        elif tag == 'br' and self.cell is not None:
            self.cell.append('\n')

    def handle_data(self, data):
        if not self.skip and self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ('td', 'th') and self.cell is not None and self.current is not None:
            self.current['cells'].append(''.join(self.cell).strip())
            self.cell = None
        elif tag == 'tr' and self.current is not None:
            end = self.document.find('>', self.source_offset())
            self.current['quote'] = self.document[self.current['start']:end + 1]
            self.rows.append(self.current)
            self.current, self.cell = None, None
        elif tag == 'table' and self.tables:
            self.tables.pop()


def label(value: str) -> str:
    return re.sub(r'\s+', ' ', value.strip().rstrip(':：')).lower()


def money(value: str, *, nullable=False) -> str | None:
    value = value.strip().replace('\xa0', '').replace(' ', '').replace('−', '-')
    # MT4's English grouped amount is unambiguous only in this explicit form.
    if re.fullmatch(r'[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?', value):
        value = value.replace(',', '')
    return amount(value, nullable=nullable)


def parse(document: str, options: dict) -> tuple[dict, list, list, list, list, str]:
    parser = Tables(document)
    try:
        parser.feed(document)
        parser.close()
    except (ValueError, RecursionError) as exc:
        raise ValidationError('MT4 HTML 表格解析未完成') from exc
    declared, parameters, reported, records, warnings = {}, [], [], [], []
    if parser.ignored or parser.current is not None or parser.skip:
        warnings.append({'code': 'incomplete_html_rows', 'message': 'HTML 存在嵌套或未闭合表格行/单元格，覆盖范围不确定，原文保留。',
                         'ref': 'execution:metadata'})
    header, header_table, orders, pending = None, None, {}, set()
    for row in parser.rows:
        cells = row['cells']
        location = provenance('html', line=row['line'], table=row['table'], row=row['row'], quote=row['quote'])
        mapped = [HEADERS.get(label(cell)) for cell in cells]
        if {'timestamp', 'operation', 'order_id', 'profit', 'balance'} <= set(mapped):
            if len([key for key in mapped if key]) != len(set(key for key in mapped if key)):
                raise ValidationError('MT4 表头含重复字段')
            header, header_table = mapped, row['table']
            continue
        if header is None or row['table'] != header_table:
            for index in range(0, len(cells) - 1, 2):
                name, value = label(cells[index]), cells[index + 1]
                key = LABELS.get(name)
                if key == 'initial_balance':
                    parsed_balance = money(value)
                    if key in declared and declared[key] != parsed_balance:
                        raise ValidationError('MT4 报告包含冲突的初始余额')
                    declared[key] = parsed_balance
                elif name in ('parameters', '输入参数', '参数'):
                    parameters.extend(parse_parameters(value, location, len(parameters)))
                    continue
                if name and value:
                    if len(reported) >= 100:
                        raise ValidationError('报告声明指标超过 100 项')
                    reported.append({'name': text(key or name, 200), 'value': text(value, 200), 'unit': '',
                                     'ref': f'execution:reported:{len(reported)}', 'provenance': location})
        if not header or row['table'] != header_table:
            continue
        if len(cells) != len(header) or not cells:
            if any(cell.strip() for cell in cells):
                warnings.append({'code': 'unparsed_table_row', 'message': '操作表中存在列数不符的原行，未推测其交易含义。',
                                 'ref': f'execution:html-row:{row["row"]}'})
            continue
        values = {key: value for key, value in zip(header, cells) if key}
        if not re.fullmatch(r'\d+', values.get('sequence', cells[0]).strip()):
            warnings.append({'code': 'unparsed_table_row', 'message': '操作表存在非标准事件行，未丢弃原文或推测数值。',
                             'ref': f'execution:html-row:{row["row"]}'})
            continue
        if len(records) >= MAX_RECORDS:
            raise ValidationError('MT4 操作事件超过 2000 条，不截掉亏损或残余持仓')
        operation, order = label(values['operation']), text(values['order_id'], 80, blank=False)
        sequence = values.get('sequence', cells[0]).strip()
        identity = 'mt4-' + sequence
        common = {'id': identity, 'sequence': len(records) + 1, 'timestamp': None,
                  'raw_timestamp': values['timestamp'], 'ref': f'execution:record:{identity}', 'provenance': location,
                  'operation': operation, 'order_id': order, 'volume': money(values.get('volume', ''), nullable=True),
                  'balance': money(values['balance'], nullable=True), 'profit': money(values['profit'], nullable=True)}
        volume = decimal(common['volume']) if common['volume'] is not None else None
        if volume is not None and volume < 0:
            raise ValidationError('MT4 手数不能为负数')
        if operation in CLOSE:
            if common['profit'] is None:
                raise ValidationError('MT4 平仓事件缺少 Profit，不能补零')
            common.update(kind='trade', profit_basis=options['profit_basis'], symbol='', side='',
                          **{key: money(values.get(key, ''), nullable=True) for key in ('commission', 'swap', 'fees')})
            opened = orders.get(order)
            if opened is None:
                warnings.append({'code': 'unmatched_close', 'message': '平仓事件未找到明确对应开仓，记录保留但交易覆盖不完整。', 'ref': common['ref']})
            elif volume is None or volume != opened:
                warnings.append({'code': 'partial_close', 'message': '分批或手数不一致的平仓事件保留；次数表示平仓事件，不证明完整交易数。', 'ref': common['ref']})
                if volume is not None and volume < opened:
                    orders[order] = opened - volume
                else:
                    orders.pop(order, None)
            else:
                orders.pop(order, None)
        else:
            common.update(kind='operation', price=money(values.get('price', ''), nullable=True))
            if any(values.get(key, '').strip() and money(values[key]) != '0' for key in ('commission', 'swap', 'fees')):
                warnings.append({'code': 'non_closing_costs', 'message': '非平仓行包含费用；完整原行保留，费用归属不确定，未把闭仓金额当完整净收益。', 'ref': common['ref']})
            if operation in OPEN:
                if order in orders:
                    warnings.append({'code': 'duplicate_open', 'message': '同票号重复开仓，无法唯一配对。', 'ref': common['ref']})
                if volume is not None and volume > 0:
                    orders[order] = volume
                else:
                    warnings.append({'code': 'unknown_open_volume', 'message': '开仓手数缺失或非正，无法完成持仓核对。', 'ref': common['ref']})
                pending.discard(order)
            elif operation in PENDING:
                pending.add(order)
            elif operation in ('delete', '删除'):
                pending.discard(order)
            elif operation not in OTHER:
                warnings.append({'code': 'unknown_operation', 'message': '存在未知操作类型，未当作平仓或零收益忽略。', 'ref': common['ref']})
        records.append(common)
    if orders or pending:
        warnings.append({'code': 'remaining_orders', 'message': f'报告末尾仍有 {len(orders)} 个未配平持仓、{len(pending)} 个挂单；未估算浮盈。', 'ref': 'execution:metadata'})
    if not header:
        warnings.append({'code': 'unsupported_template', 'message': '未找到明确的 MT4 Tester Time/Type/Order/Profit/Balance 操作表。', 'ref': 'execution:metadata'})
    return metadata(options, declared), records, parameters, reported, warnings, 'unsupported' if not header else 'partial' if warnings else 'parsed'


def parse_parameters(value: str, location: dict, offset: int) -> list[dict]:
    # Split only outside quoted values; never evaluate MQL expressions.
    pieces, current, quote, escaped = [], [], '', False
    for char in value:
        if escaped:
            escaped = False
        elif char == '\\' and quote:
            escaped = True
        elif char in ('"', "'"):
            quote = '' if char == quote else char if not quote else quote
        if char == ';' and not quote:
            pieces.append(''.join(current)); current = []
        else:
            current.append(char)
    pieces.append(''.join(current))
    output = []
    for item in pieces:
        if not item.strip():
            continue
        if '=' not in item:
            raise ValidationError('MT4 参数声明不能确定为 name=value，请保留为普通反馈或补充标准 JSON')
        name, raw = item.split('=', 1)
        output.append({'name': text(name.strip(), 200, blank=False), 'value': text(raw.strip(), 200), 'unit': '',
                       'ref': f'execution:parameter:{offset + len(output)}', 'provenance': location})
        if offset + len(output) > 300:
            raise ValidationError('MT4 声明参数超过 300 个')
    if quote:
        raise ValidationError('MT4 参数字符串未闭合，不能猜测分隔结果')
    return output
