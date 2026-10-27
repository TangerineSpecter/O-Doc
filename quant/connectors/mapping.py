"""Declarative JSON paths and field mappings; no executable scripts."""
import copy
import json
import math
import re
from rest_framework.exceptions import ValidationError

MISSING = object()


def read_path(value, path):
    if path in ('', '$'): return value
    if not isinstance(path, str): return MISSING
    if path.startswith('/'):
        keys = [p.replace('~1', '/').replace('~0', '~') for p in path[1:].split('/')]
    elif re.fullmatch(r'\$(?:\.[^\.\[\]]+|\[\d+\])*', path):
        keys = [a or b for a, b in re.findall(r'\.([^\.\[\]]+)|\[(\d+)\]', path[1:])]
    else: raise ValidationError('路径支持$.data.metrics、数组下标及JSON Pointer /data/key')
    for key in keys:
        if isinstance(value, dict): value = value.get(key, MISSING)
        elif isinstance(value, list) and key.isdigit() and int(key) < len(value): value = value[int(key)]
        else: return MISSING
    return value


def validate_mappings(rows, depth=0):
    if depth > 4 or not isinstance(rows, list) or len(rows) > 100: raise ValidationError('映射最多100项、4层数组')
    targets = set()
    for row in rows:
        if (not isinstance(row, dict) or not isinstance(row.get('target'), str)
                or not 0 < len(row['target']) <= 200 or any(not part.strip() or part in ('__proto__', 'constructor', 'prototype') for part in row['target'].split('.'))
                or row['target'] in targets or any(row['target'].startswith(t + '.') or t.startswith(row['target'] + '.') for t in targets)
                or not isinstance(row.get('source'), str) or len(row['source']) > 500
                or row.get('type', 'json') not in ('json', 'string', 'number', 'boolean', 'array')):
            raise ValidationError('映射目标、来源或类型无效；目标路径不能重复或重叠')
        read_path({}, row['source'])
        targets.add(row['target'])
        if 'scale' in row and (type(row['scale']) not in (int, float) or not math.isfinite(row['scale'])):
            raise ValidationError('缩放系数必须是有限数字')
        if row.get('type') == 'array': validate_mappings(row.get('fields', []), depth + 1)
    return rows


def map_response(value, mappings):
    validate_mappings(mappings)
    result, warnings = {}, []
    for row in mappings:
        raw = read_path(value, row['source'])
        if raw is MISSING or raw is None:
            if row.get('required'): raise ValidationError('响应缺少必需字段：' + row['source'])
            mapped = None
            warnings.append('未提供字段：' + row['source'])
        else:
            kind = row.get('type', 'json')
            if kind == 'number':
                try:
                    if type(raw) is bool: raise ValueError()
                    mapped = float(raw) * row.get('scale', 1)
                    if not math.isfinite(mapped): raise ValueError()
                except (ValueError, TypeError): raise ValidationError('数值字段无法解析：' + row['source'])
            elif kind == 'boolean':
                if raw not in (True, False, 'true', 'false') or type(raw) not in (bool, str): raise ValidationError('布尔字段须为true/false')
                mapped = raw is True or raw == 'true'
            elif kind == 'string': mapped = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
            elif kind == 'array':
                if not isinstance(raw, list): raise ValidationError('数组字段类型不符：' + row['source'])
                mapped = []
                for index, item in enumerate(raw):
                    child, notes = map_response(item, row.get('fields', [])) if row.get('fields') else (copy.deepcopy(item), [])
                    mapped.append(child); warnings += [f"{row['target']}[{index}] {note}" for note in notes]
            else: mapped = copy.deepcopy(raw)
        target = result
        keys = row['target'].split('.')
        for key in keys[:-1]: target = target.setdefault(key, {})
        target[keys[-1]] = mapped
    return result, warnings[:100]


def render(template, context, secrets=None):
    if isinstance(template, dict): return {key: render(value, context, secrets) for key, value in template.items()}
    if isinstance(template, list): return [render(value, context, secrets) for value in template]
    if not isinstance(template, str): return template
    def lookup(path):
        value = read_path(secrets or {}, '$.' + path[7:]) if path.startswith('secret.') else read_path(context, '$.' + path)
        if value is MISSING: raise ValidationError('缺少请求变量：' + path)
        return copy.deepcopy(value)
    exact = re.fullmatch(r'\{\{\s*([A-Za-z0-9_.\[\]/~-]+)\s*\}\}', template)
    if exact: return lookup(exact.group(1))
    def replace(match):
        value = lookup(match.group(1))
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return re.sub(r'\{\{\s*([A-Za-z0-9_.\[\]/~-]+)\s*\}\}', replace, template)
