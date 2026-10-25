"""Bounded decimal and timestamp handling for uploaded execution records."""
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import math
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest

ADAPTERS = ('standard-execution-json-v1', 'standard-execution-csv-v1', 'mt4-tester-html-v1')
DEFAULT_OPTIONS = {'version': 1, 'timezone': '', 'currency': '', 'initial_balance': '',
                   'balance_tolerance': '0.01', 'profit_basis': 'unknown', 'cash_flow_coverage': 'unknown'}
BASIS = ('net', 'gross', 'unknown')
MAX_RECORDS = 2000


def keys(value: dict, allowed: set, required: set = frozenset()) -> None:
    if not isinstance(value, dict) or set(value) - allowed or required - set(value):
        raise ValidationError('结构化执行证据含未知字段或缺少必要字段')


def text(value, maximum=200, *, blank=True) -> str:
    if not isinstance(value, str) or len(value) > maximum or '\x00' in value or not blank and not value.strip():
        raise ValidationError('执行证据文本为空、含二进制字符或超过字段上限')
    return value


def decimal(value) -> Decimal:
    # Check text bounds before Decimal construction, including exponent size.
    if type(value) is int:
        if abs(value) > 9007199254740991:
            raise ValidationError('大整数金额须使用十进制字符串以避免 JSON 精度损失')
        raw = str(value)
    elif type(value) is float:
        if not math.isfinite(value) or abs(value) > 9007199254740991:
            raise ValidationError('数值金额必须有限且在安全精度范围内，或使用十进制字符串')
        raw = str(value)
    elif isinstance(value, (str, Decimal)):
        raw = str(value).strip()
    else:
        raise ValidationError('金额必须是有界十进制字符串或有限数值')
    if len(raw) > 120 or not re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,3})?', raw):
        raise ValidationError('金额不是有界十进制数值')
    try:
        number = Decimal(raw)
    except InvalidOperation as exc:
        raise ValidationError('金额格式无效') from exc
    if (not number.is_finite() or len(number.as_tuple().digits) > 100
            or abs(number.as_tuple().exponent) > 30 or number.copy_abs() > Decimal('1e100')):
        raise ValidationError('金额超过 100 位有效数字、30 位小数/指数或数值安全范围')
    return number


def number_text(value: Decimal) -> str:
    result = format(value, 'f')
    if '.' in result:
        result = result.rstrip('0').rstrip('.')
    return '0' if not value else result


def amount(value, *, nullable=False) -> str | None:
    return None if nullable and value in (None, '') else number_text(decimal(value))


def normalize_options(options: dict | None = None) -> dict:
    options = {} if options is None else options
    keys(options, set(DEFAULT_OPTIONS))
    result = {**DEFAULT_OPTIONS, **options}
    if type(result['version']) is not int or result['version'] != 1:
        raise ValidationError('执行证据选项版本无效')
    result['timezone'] = text(result['timezone'], 100).strip()
    if result['timezone']:
        try:
            ZoneInfo(result['timezone'])
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValidationError('请选择有效的 IANA 时区，不猜测服务器时区') from exc
    result['currency'] = text(result['currency'], 30).strip()
    result['initial_balance'] = amount(result['initial_balance'], nullable=True) or ''
    if result['initial_balance'] and decimal(result['initial_balance']) < 0:
        raise ValidationError('初始余额不能为负数')
    result['balance_tolerance'] = amount(result['balance_tolerance'])
    if not Decimal(0) <= decimal(result['balance_tolerance']) <= Decimal(1):
        raise ValidationError('余额核对容差须在 0–1 账户货币单位内')
    if result['profit_basis'] not in BASIS or result['cash_flow_coverage'] not in ('complete', 'unknown'):
        raise ValidationError('利润口径或现金流覆盖声明无效')
    return result


def metadata(options: dict, declared: dict | None = None) -> dict:
    declared = {} if declared is None else declared
    keys(declared, set(DEFAULT_OPTIONS) - {'version', 'balance_tolerance'})
    normalized = normalize_options({**options, **declared})
    for key in declared:
        if options[key] not in ('', 'unknown') and normalized[key] != options[key]:
            raise ValidationError('导入选项与文档元数据冲突，请明确选择同一口径')
    return {key: (normalized[key] or None) if key == 'initial_balance' else normalized[key]
            for key in DEFAULT_OPTIONS if key != 'version'}


def timestamp(raw: str, timezone_name: str) -> tuple[str | None, datetime, str]:
    raw = text(raw, 100, blank=False).strip()
    prepared = re.sub(r'^(\d{4})\.(\d{2})\.(\d{2})', r'\1-\2-\3', raw)
    try:
        value = datetime.fromisoformat(prepared.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValidationError('成交或净值时间格式无效') from exc
    if value.tzinfo is None:
        if not timezone_name:
            return None, value, '时间没有偏移且时区未知，保留原时钟，不生成 UTC 或年化指标。'
        zone = ZoneInfo(timezone_name)
        first, second = value.replace(tzinfo=zone, fold=0), value.replace(tzinfo=zone, fold=1)
        if first.utcoffset() != second.utcoffset() or first.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != value:
            return None, value, '本地时间落在夏令时歧义或不存在区间，UTC 未确定。'
        value = first
    utc = value.astimezone(timezone.utc)
    return utc.isoformat(timespec='microseconds').replace('+00:00', 'Z'), utc, ''


def provenance(format_name: str, *, path='', line=None, table=None, row=None, quote='', raw=None) -> dict:
    return {'format': format_name, 'path': path, 'line': line, 'table': table, 'row': row,
            'quote': quote, 'content_hash': digest(quote if quote else raw)}


def seal(value: dict) -> dict:
    value['content_hash'] = digest(value)
    return value
