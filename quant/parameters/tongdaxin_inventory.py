"""Literal formula declarations and explicitly headed external parameter tables."""
import csv
import re
from bisect import bisect_right
from collections import Counter
from .source_values import scalar, UNKNOWN
from quant.source_structure.lexical import mask
from quant.source_structure.common import source_lines

NAME = re.compile(r'[^\W\d]\w*\Z', re.UNICODE)
NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)\Z')
HEADERS = {'参数': 'name', '参数名': 'name', '名称': 'name', 'name': 'name',
    '最小': 'minimum', '最小值': 'minimum', 'min': 'minimum',
    '最大': 'maximum', '最大值': 'maximum', 'max': 'maximum',
    '缺省': 'default', '缺省值': 'default', '默认': 'default', '默认值': 'default', 'default': 'default'}


def number(text: str) -> dict:
    raw = text.strip()
    if not NUMBER.fullmatch(raw): return dict(UNKNOWN)
    try: return scalar(float(raw) if '.' in raw else int(raw))
    except (ValueError, OverflowError): return dict(UNKNOWN)


def declarations(code: str) -> tuple[list[dict], list[str], str]:
    masked, errors = mask(code, 'tongdaxin')
    if errors: return [], ['通达信注释/引用未闭合，不使用局部声明。'], 'unparsed'
    # No expression evaluation. A colon output and a computed assignment are
    # series/state, even when they have a short name commonly used for inputs.
    stack = []; rows = []; counts = Counter(); start = 0; offsets = [0]
    for line in source_lines(code): offsets.append(offsets[-1] + len(line))
    for at, char in enumerate(masked):
        if char in '([': stack.append(char)
        elif char in ')]':
            if not stack or stack.pop() != {')': '(', ']': '['}[char]:
                return [], ['通达信括号不配对，不使用局部声明。'], 'unparsed'
        elif char == ';' and not stack:
            segment = masked[start:at]
            match = re.match(r'\s*(?P<name>[^\W\d]\w*)\s*(?P<operator>:=|:)\s*', segment, re.UNICODE)
            if match:
                begin = start + match.start('name'); end = at + 1
                raw = code[start + match.end():at].strip()
                literal = number(masked[start + match.end():at].strip()) if match['operator'] == ':=' else dict(UNKNOWN)
                kind = 'module_literal' if literal['kind'] != 'unknown' else 'formula_assignment' if match['operator'] == ':=' else 'formula_output'
                name = match['name']; counts[name.casefold(), kind] += 1
                rows.append({'source_name': name, 'scope': '<formula>', 'kind': kind, 'ordinal': counts[name.casefold(), kind],
                    'type': literal['kind'], 'default_raw': raw, 'literal': literal,
                    'line': bisect_right(offsets, begin),
                    'end_line': bisect_right(offsets, end - 1), 'quote': code[begin:end],
                    'conditional': False, 'auto_match': True})
                if len(rows) > 300: return [], ['通达信声明超过300项。'], 'limited'
            start = at + 1
    if stack or masked[start:].strip(): return [], ['通达信括号或末尾分号不完整，不使用截断目录。'], 'unparsed'
    return rows, ['只读取完整语句的声明与数值字面量；:=不是公开输入，:是输出，未执行原平台。'], 'partial'


def table(text: str, field: str) -> tuple[list[dict], list[str]]:
    """Only a whole CSV/TSV/space table with four explicit column headings."""
    lines = source_lines(text)
    nonempty = [(index, line.rstrip('\r\n')) for index, line in enumerate(lines) if line.strip()]
    if not nonempty: return [], []
    _, header = nonempty[0]
    delimiter = '\t' if '\t' in header else ',' if ',' in header else None
    def cells(line):
        try: return next(csv.reader([line], delimiter=delimiter, strict=True)) if delimiter else line.split()
        except csv.Error as exc: raise ValueError('参数表引号或分隔不完整') from exc
    try: names = [HEADERS.get(value.strip().lstrip('\ufeff').casefold()) for value in cells(header)]
    except ValueError: return [], [f'{field}未识别为完整参数表，不从自由文字猜默认值。']
    if len(names) != 4 or set(names) != {'name', 'minimum', 'maximum', 'default'}:
        return [], [f'{field}未识别为完整的参数/最小/最大/缺省表，不从自由文字猜默认值。']
    if len(text) > 16000 or len(nonempty) > 301 or len(header) > 3000: raise ValueError('外部参数表超过完整读取预算')
    rows = []; counts = Counter()
    for index, line in nonempty[1:]:
        if len(line) > 3000: raise ValueError('参数表单行超过完整引用预算')
        values = cells(line)
        if len(values) != 4: raise ValueError('外部参数表行列数与表头不一致')
        item = dict(zip(names, (value.strip() for value in values))); name = item['name']
        if not NAME.fullmatch(name) or len(name) > 200: raise ValueError('外部参数名不是完整标识符')
        low, high, default = [number(item[key]) for key in ('minimum', 'maximum', 'default')]
        if any(row['kind'] == 'unknown' for row in (low, high, default)) or not low['value'] <= default['value'] <= high['value']:
            raise ValueError('外部参数表数值缺失、非有限或默认值越界')
        domain = {'version': 5, 'minimum': low['value'], 'maximum': high['value'], 'step': None, 'step_origin': None,
            'choices': [], 'relations': [], 'conditions': [], 'evidence': [{'field': field, 'quote': header}, {'field': field, 'quote': line}]}
        counts[name.casefold()] += 1
        rows.append({'source_name': name, 'scope': '<external_parameters:' + field + '>', 'kind': 'external_parameter', 'ordinal': counts[name.casefold()],
            'type': default['kind'], 'default_raw': item['default'], 'literal': default,
            'line': index + 1, 'end_line': index + 1, 'quote': line, 'conditional': False, 'auto_match': True,
            'file': '__' + field + '_parameters__.txt', 'declared_domain': domain, 'blocked': ''})
    if not rows: raise ValueError('外部参数表只有表头，没有参数行')
    return rows, ['参数表为用户提供的定义，不是实际运行配置；类型按默认字面量记录，未核实终端类型或编译。']
