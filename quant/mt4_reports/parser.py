"""Read MT4 tester HTML as data; never execute or render uploaded HTML."""
from html.parser import HTMLParser
import re
from .parameters import filter_report_parameters


MAX_HTML_BYTES = 20 * 1024 * 1024
MAX_ROWS = 200_000


class ReportError(ValueError):
    pass


class _Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.row = None
        self.cell = None
        self.title = []
        self.in_title = False
        self.images = []
        self.meta = {}
        self.table_stack = []
        self.next_table = 0
        self.row_table = None

    def _close_cell(self):
        if self.cell is not None and self.row is not None:
            self.row.append(' '.join(''.join(self.cell).split()))
        self.cell = None

    def _close_row(self):
        if self.row is not None:
            self._close_cell()
            self.rows.append((self.row_table, self.row))
            if len(self.rows) > MAX_ROWS:
                raise ReportError('报告交易行数超过上限')
        self.row = None
        self.row_table = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table':
            self._close_row()
            self.next_table += 1
            self.table_stack.append(self.next_table)
        elif tag == 'tr':
            self._close_row()
            self.row = []
            self.row_table = self.table_stack[-1] if self.table_stack else None
        elif tag in ('td', 'th') and self.row is not None:
            self._close_cell()
            self.cell = []
        elif tag == 'title':
            self.in_title = True
        elif tag == 'img':
            self.images.append(attrs.get('src', ''))
        elif tag == 'meta' and attrs.get('name'):
            self.meta[attrs['name'].lower()] = attrs.get('content', '')

    def handle_endtag(self, tag):
        if tag in ('td', 'th'):
            self._close_cell()
        elif tag == 'tr':
            self._close_row()
        elif tag == 'table':
            self._close_row()
            if self.table_stack:
                self.table_stack.pop()
        elif tag == 'title':
            self.in_title = False

    def handle_data(self, value):
        if self.cell is not None:
            self.cell.append(value)
        if self.in_title:
            self.title.append(value)


def _decode(data):
    if len(data) > MAX_HTML_BYTES:
        raise ReportError('HTML 文件超过 20 MB')
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        encodings = ['utf-16']
    else:
        header = data[:4096].decode('ascii', errors='ignore')
        match = re.search(r'charset\s*=\s*["\']?([\w-]+)', header, re.I)
        encodings = ([match.group(1)] if match else []) + ['utf-8-sig', 'gb18030', 'cp1252']
    for encoding in encodings:
        try:
            return data.decode(encoding)
        except (LookupError, UnicodeError):
            continue
    raise ReportError('无法识别报告编码')


def _parameters(raw):
    # Semicolons inside quoted strings are part of the value.
    tokens, start, quote, escaped = [], 0, None, False
    for index, char in enumerate(raw):
        if escaped:
            escaped = False
        elif char == '\\' and quote:
            escaped = True
        elif char in ('"', "'"):
            if quote == char:
                quote = None
            elif quote is None:
                quote = char
        elif char == ';' and quote is None:
            tokens.append(raw[start:index].strip())
            start = index + 1
    tokens.append(raw[start:].strip())
    result = []
    for token in tokens:
        if '=' in token:
            name, value = token.split('=', 1)
            result.append({'name': name.strip(), 'value': value.strip()})
        elif token:
            result.append({'name': '', 'value': token})
    return result


HEADERS = {
    'symbol': {'交易品种', 'symbol'},
    'period': {'时间周期', 'period'},
    'model': {'复盘模型', '模型', 'model'},
    'parameters': {'参数', 'inputs', 'parameters'},
}
EVENT_COLUMNS = (
    {'#'}, {'时间', 'time'}, {'类型', 'type'}, {'订单', 'order'}, {'手数', 'size', 'lots'},
    {'价格', 'price'}, {'止损', 's/l'}, {'止盈', 't/p'}, {'获利', 'profit'}, {'余额', 'balance'},
)


def normalize_metric_prefixes(metrics):
    """Remove separator colons only from recognized standalone row prefixes."""
    prefixes = {'最大', '平均', '最多', '最小', 'maximal', 'average', 'maximum'}
    normalized = []
    for row in metrics:
        cells = list(row)
        first = next((i for i, cell in enumerate(cells) if cell.strip() and cell.strip() not in ('—', '——', '--', '-')), None)
        if first is not None:
            prefix = cells[first].strip().rstrip(':：').strip()
            if prefix.casefold() in prefixes:
                cells[first] = prefix
        normalized.append(cells)
    return normalized


def parse_report(data):
    """Return source strings, grouped statistics, and chronological event rows.

    Values remain strings so display rounding, unknowns and broker-local times
    are not silently reinterpreted. An event sequence number is not an order ID.
    """
    parser = _Tables()
    parser.feed(_decode(data))
    parser.close()
    parser._close_row()
    fields, metrics, events = {}, [], []
    in_events = False
    event_table = None
    for table, row in parser.rows:
        if in_events and table != event_table:
            break
        if not row or not any(row):
            continue
        if row[0] == '#' and len(row) >= 5:
            if len(row) != len(EVENT_COLUMNS) or any(value.casefold() not in aliases for value, aliases in zip(row, EVENT_COLUMNS)):
                raise ReportError('交易明细列格式不受支持，请保留原报告并检查表头')
            in_events = True
            event_table = table
            continue
        if in_events:
            if not re.fullmatch(r'[0-9]+', row[0]):
                raise ReportError('交易明细存在无效序号，无法安全导入')
            if not 8 <= len(row) <= 10:
                raise ReportError(f'交易明细第 {row[0]} 行格式不完整，无法安全导入')
            events.append(dict(zip(
                ('sequence', 'time', 'type', 'order', 'lots', 'price', 'stop_loss', 'take_profit', 'profit', 'balance'),
                (row + ['', ''])[:10],
            )))
            continue
        label = row[0].casefold()
        key = next((key for key, names in HEADERS.items() if label in names), None)
        if key and len(row) >= 2:
            fields[key] = row[1]
        elif len(row) >= 2:
            # MT4 prefixes some rows with 最大/平均; preserve every cell to
            # avoid merging distinct statistics that share the same label.
            metrics.append(row)
    if 'symbol' not in fields or not metrics:
        raise ReportError('没有识别到 MT4 策略测试报告')
    parameters = filter_report_parameters(_parameters(fields.pop('parameters', '')))
    return {
        'title': ''.join(parser.title).strip(),
        'server': parser.meta.get('server', ''),
        'build': parser.meta.get('version', ''),
        'fields': fields,
        'parameters': parameters,
        'metrics': normalize_metric_prefixes(metrics),
        'events': events,
        'image_references': parser.images,
    }
