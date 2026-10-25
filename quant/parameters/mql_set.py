"""Read bounded MetaTrader text presets, preserving every value and optimization field."""
import math
import re
from rest_framework.exceptions import ValidationError

VERSION = 'mql-set-1'
NAME = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,127}$')


def literal(raw: str, declared: str = '') -> dict:
    text = raw.strip()
    kind, value = 'unknown', None
    if text.lower() in ('true', 'false'):
        kind, value = 'bool', text.lower() == 'true'
    elif re.fullmatch(r'[+-]?\d+', text):
        number = int(text) if len(text) <= 20 else None
        if number is not None and abs(number) <= 2**53 - 1:
            kind, value = 'int', number
    elif re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', text):
        number = float(text)
        if math.isfinite(number):
            kind, value = 'float', number
    elif len(text) >= 2 and text[0] == text[-1] == '"':
        # Keep escapes verbatim; no interpretation of code or platform enum names.
        kind, value = 'string', text[1:-1]
    if declared == 'string':
        kind, value = 'string', text[1:-1] if len(text) >= 2 and text[0] == text[-1] == '"' else text
    elif declared == 'bool' and text in ('0', '1'):
        kind, value = 'bool', text == '1'
    elif declared in ('double', 'float') and kind == 'int':
        kind, value = 'float', float(value)
    return {'kind': kind, 'value': value}


def parse(document: str) -> dict:
    if not isinstance(document, str) or not document.strip() or len(document) > 60000 or '\x00' in document:
        raise ValidationError('SET 内容为空、含二进制字符或超过 60000 字符')
    lines = document.lstrip('\ufeff').splitlines()
    if len(lines) > 2000:
        raise ValidationError('SET 最多 2000 行')
    values, metadata, warnings, seen = [], {}, [], set()
    for index, raw in enumerate(lines, 1):
        stripped = raw.strip()
        if not stripped or stripped.startswith((';', '#', '//')):
            continue
        if '=' not in stripped:
            warnings.append({'line': index, 'message': '未识别为参数赋值，原行保留'}); continue
        name, value = stripped.split('=', 1)
        name, value = name.strip(), value.strip()
        meta = re.fullmatch(r'([A-Za-z_][A-Za-z0-9_]{0,127}),([F123])', name)
        if not NAME.fullmatch(name) and not meta:
            warnings.append({'line': index, 'message': '参数名或扩展字段未知，未自动映射'}); continue
        if name in seen:
            raise ValidationError(f'SET 第 {index} 行重复定义 {name}，请先消除歧义')
        seen.add(name)
        if len(value) > 2000:
            raise ValidationError(f'SET 第 {index} 行参数值超过 2000 字符')
        if meta:
            metadata.setdefault(meta[1], {})[meta[2]] = {'raw': value, 'line': index}
            continue
        row = {'name': name, 'raw_value': value, 'line': index, 'quote': raw, 'optimization': None}
        if '||' in value:
            parts = value.split('||')
            if (len(parts) == 5 and parts[-1].strip().upper() in ('Y', 'N')
                    and all(literal(part)['kind'] in ('int', 'float', 'bool') for part in parts[:4])):
                row['raw_value'] = parts[0].strip()
                row['optimization'] = {'format': 'inline', 'enabled': parts[-1].strip().upper() == 'Y',
                    'start': parts[1].strip(), 'step': parts[2].strip(), 'stop': parts[3].strip()}
            else:
                warnings.append({'line': index, 'message': '无法判定 || 格式，整段保留为未知值，不拆成运行参数'})
        values.append(row)
        if len(values) > 300:
            raise ValidationError('SET 最多 300 个参数')
    if not values:
        raise ValidationError('SET 中没有可识别的 name=value 参数')
    for row in values:
        meta = metadata.pop(row['name'], None)
        if meta:
            if row['optimization'] is not None:
                raise ValidationError(f"{row['name']} 同时存在两种优化格式，请先消除歧义")
            row['optimization'] = {'format': 'legacy', 'enabled': {'0': False, '1': True}.get(meta.get('F', {}).get('raw')),
                'start': meta.get('1', {}).get('raw'), 'step': meta.get('2', {}).get('raw'), 'stop': meta.get('3', {}).get('raw'), 'fields': meta}
        row.update(literal(row['raw_value']))
    for name, meta in metadata.items():
        warnings.append({'line': min(item['line'] for item in meta.values()), 'message': f'{name} 仅有优化字段，没有配置值，未补造参数'})
    return {'parser_version': VERSION, 'parameters': values, 'warnings': warnings,
            'status': 'imported_configuration_not_verified_execution'}
