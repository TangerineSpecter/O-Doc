"""CSV contract v1. Preserve received bytes as text; never infer missing prices."""
import csv
import hashlib
import io
import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 20000
COLUMNS = ('timestamp', 'open', 'high', 'low', 'close', 'volume')
ALIASES = {'date': 'timestamp', 'datetime': 'timestamp', 'time': 'timestamp', '日期': 'timestamp',
    '时间': 'timestamp', '开盘': 'open', '最高': 'high', '最低': 'low', '收盘': 'close', '成交量': 'volume'}
META = ('symbol', 'timeframe', 'timezone', 'price_adjustment', 'source')


def parse_csv(raw: str, metadata: dict) -> dict:
    if not isinstance(raw, str) or not raw.strip() or len(raw.encode('utf-8')) > MAX_BYTES:
        raise ValidationError('CSV 不能为空，且最多 2 MiB（UTF-8）')
    if set(metadata) != set(META) or any(not isinstance(metadata[key], str) or len(metadata[key]) > 300 for key in META):
        raise ValidationError('行情描述字段无效')
    meta = {key: metadata[key].strip() for key in META}
    if any(not meta[key] for key in ('symbol', 'timeframe', 'timezone')):
        raise ValidationError('请提供标的、K线周期和时区')
    try:
        zone = ZoneInfo(meta['timezone'])
    except (ZoneInfoNotFoundError, ValueError):
        raise ValidationError('时区须为有效 IANA 名称，例如 Asia/Shanghai 或 UTC') from None
    reader = csv.reader(io.StringIO(raw.lstrip('\ufeff')), strict=True)
    try:
        original = next(reader)
        headers = [ALIASES.get(key.strip().lower(), key.strip().lower()) for key in original]
        if len(headers) != len(set(headers)) or not set(COLUMNS[:-1]).issubset(headers):
            raise ValidationError('需要唯一的 timestamp/open/high/low/close 列，volume 可选')
        rows, previous = [], None
        for line, cells in enumerate(reader, 2):
            if not cells or not any(cell.strip() for cell in cells):
                continue
            if len(rows) >= MAX_ROWS or len(cells) != len(headers):
                raise ValidationError(f'第 {line} 行列数不一致，或行数超过 {MAX_ROWS}')
            row = dict(zip(headers, cells))
            stamp = row['timestamp'].strip()
            try:
                if len(stamp) == 10:
                    parsed = datetime.strptime(stamp, '%Y-%m-%d').replace(tzinfo=zone)
                else:
                    parsed = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
                    if parsed.tzinfo is None:
                        raise ValueError('timezone missing')
                instant = parsed.astimezone(timezone.utc)
            except (ValueError, OverflowError):
                raise ValidationError(f'第 {line} 行时间无效：使用 YYYY-MM-DD 或带时区偏移的 ISO 时间') from None
            if previous is not None and instant <= previous:
                raise ValidationError(f'第 {line} 行时间重复或未严格递增；请先核对数据顺序')
            previous = instant
            values = {'timestamp': instant.isoformat()}
            for column in COLUMNS[1:]:
                cell = row.get(column, '').strip()
                if not cell and column == 'volume':
                    values[column] = None
                    continue
                try:
                    value = float(cell)
                except (ValueError, OverflowError):
                    raise ValidationError(f'第 {line} 行 {column} 不是有效数字') from None
                if not math.isfinite(value) or value < 0 or (column != 'volume' and value == 0):
                    raise ValidationError(f'第 {line} 行 {column} 必须是有限的有效价格或成交量')
                values[column] = value
            if values['high'] < max(values['open'], values['close'], values['low']) or values['low'] > min(values['open'], values['close'], values['high']):
                raise ValidationError(f'第 {line} 行最高价/最低价与开收盘价矛盾')
            rows.append(values)
    except (csv.Error, StopIteration):
        raise ValidationError('CSV 格式不完整或引号不匹配') from None
    if len(rows) < 2:
        raise ValidationError('至少需要两根有效 K 线')
    return {'parser_version': 1, **meta, 'raw_hash': hashlib.sha256(raw.encode('utf-8')).hexdigest(),
        'timestamp_semantics': 'bar_label', 'missing_policy': 'reject_missing_prices_preserve_missing_volume',
        'discarded_columns': [original[index] for index, key in enumerate(headers) if key not in COLUMNS], 'rows': rows}


def dataset_hash(snapshot: dict) -> str:
    return digest(snapshot)
