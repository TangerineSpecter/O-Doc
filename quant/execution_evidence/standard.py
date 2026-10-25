"""Explicit portable execution schema, with no guessed column semantics."""
import csv
import io
import json
import re
from rest_framework.exceptions import ValidationError
from .common import amount, decimal, keys, metadata, provenance, text, BASIS, MAX_RECORDS

COMMON = {'kind', 'id', 'timestamp'}
TRADE = {'profit', 'profit_basis', 'commission', 'swap', 'fees', 'balance', 'symbol', 'side', 'volume'}
FIELDS = COMMON | TRADE | {'amount', 'equity'}


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValidationError('JSON 不能含重复字段')
        result[key] = value
    return result


def parse(document: str, adapter: str, options: dict) -> tuple[dict, list, list, list, list]:
    if adapter == 'standard-execution-json-v1':
        try:
            def invalid(value):
                raise ValueError(value)
            raw = json.loads(document, object_pairs_hook=_pairs, parse_constant=invalid, parse_float=str)
        except (ValueError, RecursionError) as exc:
            raise ValidationError('标准执行 JSON 必须完整且不能包含非有限数值') from exc
        keys(raw, {'version', 'metadata', 'parameters', 'reported_metrics', 'records'}, {'version', 'records'})
        if type(raw['version']) is not int or raw['version'] != 1:
            raise ValidationError('标准执行 JSON 版本须为 1')
        meta = metadata(options, raw.get('metadata'))
        records = raw['records']
        if not isinstance(records, list):
            raise ValidationError('records 必须是完整数组')
        if len(records) > MAX_RECORDS:
            raise ValidationError('执行证据最多 2000 条记录，不截断负面成交')
        locations = [provenance('json', path=f'$.records[{index}]', raw=row) for index, row in enumerate(records)]
        parameters = declared_items(raw.get('parameters', []), 'parameters')
        reported = declared_items(raw.get('reported_metrics', []), 'reported_metrics')
    else:
        meta, records, locations, parameters, reported = metadata(options), [], [], [], []
        try:
            reader = csv.DictReader(io.StringIO(document, newline=''), strict=True)
            header = reader.fieldnames
            if (not header or len(header) != len(set(header)) or set(header) - FIELDS
                    or COMMON - set(header)):
                raise ValidationError('标准 CSV 须含 kind,id,timestamp 且不得包含未知或重复列')
            lines, previous = document.splitlines(keepends=True), reader.line_num
            for row in reader:
                if None in row or any(value is None for value in row.values()):
                    raise ValidationError('CSV 行列数与表头不一致')
                quote = ''.join(lines[previous:reader.line_num])
                locations.append(provenance('csv', line=previous + 1, row=len(records) + 1, quote=quote))
                previous = reader.line_num
                records.append({key: value for key, value in row.items() if value != ''})
                if len(records) > MAX_RECORDS:
                    raise ValidationError('执行证据最多 2000 条记录，不截断负面成交')
        except csv.Error as exc:
            raise ValidationError('标准 CSV 格式无效或单元格超过解析限制') from exc
    if len(records) > MAX_RECORDS:
        raise ValidationError('执行证据最多 2000 条记录，不截断负面成交')
    output, warnings = [], []
    for index, (row, location) in enumerate(zip(records, locations)):
        output.append(normalize_record(row, location, index, meta))
    return meta, output, parameters, reported, warnings


def declared_items(values: list, key: str) -> list[dict]:
    limit = 300 if key == 'parameters' else 100
    if not isinstance(values, list) or len(values) > limit:
        raise ValidationError('声明参数或指标超过数量上限')
    output, seen = [], set()
    for index, row in enumerate(values):
        keys(row, {'name', 'value', 'unit'}, {'name', 'value'})
        name = text(row['name'], 200, blank=False)
        if name in seen:
            raise ValidationError('声明参数或指标不能重名')
        seen.add(name)
        output.append({'name': name, 'value': text(row['value'], 200), 'unit': text(row.get('unit', ''), 100),
            'ref': f"execution:{'parameter' if key == 'parameters' else 'reported'}:{index}",
            'provenance': provenance('json', path=f'$.{key}[{index}]', raw=row)})
    return output


def normalize_record(row: dict, location: dict, index: int, meta: dict) -> dict:
    kind = row.get('kind') if isinstance(row, dict) else None
    allowed = COMMON | (TRADE if kind == 'trade' else {'amount', 'balance'} if kind == 'cash_flow'
                        else {'equity', 'balance'} if kind == 'equity' else set())
    keys(row, allowed, COMMON)
    if kind not in ('trade', 'cash_flow', 'equity'):
        raise ValidationError('标准执行记录类型只支持 trade/cash_flow/equity')
    identity = text(row['id'], 80, blank=False)
    if not re.fullmatch(r'[A-Za-z0-9_.:-]+', identity):
        raise ValidationError('执行记录 ID 仅支持字母数字及 . _ : -')
    result = {'id': identity, 'kind': kind, 'sequence': index + 1, 'timestamp': None,
              'raw_timestamp': text(row['timestamp'], 100, blank=False), 'ref': f'execution:record:{identity}',
              'provenance': location, 'balance': amount(row.get('balance'), nullable=True)}
    if kind == 'trade':
        if 'profit' not in row:
            raise ValidationError('trade 缺少 profit；未知利润不能补零')
        basis = row.get('profit_basis', meta['profit_basis'])
        if basis not in BASIS:
            raise ValidationError('利润口径只支持 net/gross/unknown')
        result.update(profit=amount(row['profit']), profit_basis=basis,
            **{key: amount(row.get(key), nullable=True) for key in ('commission', 'swap', 'fees', 'volume')},
            symbol=text(row.get('symbol', ''), 100), side=text(row.get('side', ''), 30), order_id='', operation='closed_trade')
        if result['volume'] is not None and decimal(result['volume']) <= 0:
            raise ValidationError('声明成交手数必须为正数')
    elif kind == 'cash_flow':
        result['amount'] = amount(row.get('amount'))
    else:
        result['equity'] = amount(row.get('equity'))
    return result
