"""Conservative declaration matching, independent of AI extraction or current reports."""
import re
from rest_framework.exceptions import ValidationError
from .mql_set import literal

BOUNDS = {'int': (-2**31, 2**31-1), 'uint': (0, 2**32-1), 'long': (-2**63, 2**63-1), 'ulong': (0, 2**64-1),
          'short': (-32768, 32767), 'ushort': (0, 65535), 'char': (-128, 127), 'uchar': (0, 255), 'float': (-3.402823466e38, 3.402823466e38)}


def declarations(code: str) -> list[dict]:
    # Keep offsets/newlines while masking comments and quoted strings. A comment
    # mentioning input, or a string containing ';', must not create declarations.
    masked = re.sub(r'//[^\n]*|/\*[\s\S]*?\*/|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'',
                    lambda match: ''.join('\n' if char == '\n' else ' ' for char in match[0]), code)
    pattern = r'\b(input|extern)\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:=\s*([^;]*))?;'
    found = []
    for match in re.finditer(pattern, masked):
        statement = code[match.start():match.end()]
        raw = statement.split('=', 1)[1][:-1].strip() if '=' in statement else ''
        found.append({'name': match[3], 'type': match[2], 'declaration': match[1], 'default_raw': raw,
                      'line': code.count('\n', 0, match.start()) + 1, 'quote': code[match.start():match.end()]})
        if len(found) > 300:
            raise ValidationError('源码参数声明超过 300 个，请拆分来源后对照，不能截断后判断匹配结果')
    return found


def compare(snapshot: dict, target: dict) -> dict:
    payload = target['payload']
    rows = declarations(payload.get('code', '')) if payload.get('language') == 'mql4' else []
    by_name = {}
    for row in rows:
        by_name.setdefault(row['name'], []).append(row)
    compared = []
    for item in snapshot['parameters']:
        matches = by_name.get(item['name'], [])
        declaration = matches[0] if len(matches) == 1 else None
        value = literal(item['raw_value'], declaration['type']) if declaration else literal(item['raw_value'])
        status = 'unmatched' if not matches else 'ambiguous' if len(matches) > 1 else 'unknown_type'
        default = None
        if declaration:
            expected = {'int': 'int', 'long': 'int', 'uint': 'int', 'ulong': 'int', 'short': 'int', 'ushort': 'int',
                        'char': 'int', 'uchar': 'int', 'double': 'float', 'float': 'float', 'bool': 'bool', 'string': 'string'}.get(declaration['type'])
            raw_default = declaration['default_raw']
            default = literal(raw_default, declaration['type']) if raw_default else None
            if declaration['type'] == 'string' and not re.fullmatch(r'"(?:\\.|[^"\\])*"', raw_default):
                default = None  # A macro or expression is not a literal default.
            if expected:
                status = 'type_mismatch' if value['kind'] != expected else 'default_unknown' if default is None or default['kind'] != expected else 'same' if value['value'] == default['value'] else 'different'
                bounds = BOUNDS.get(declaration['type'])
                if bounds and value['kind'] in ('int', 'float') and not bounds[0] <= value['value'] <= bounds[1]:
                    status = 'type_mismatch'
                if declaration['type'] == 'string' and (item.get('optimization') or {}).get('format') == 'inline':
                    status = 'ambiguous'
        compared.append({'name': item['name'], 'configured': value, 'declaration': declaration, 'default': default, 'status': status})
    present = {row['name'] for row in snapshot['parameters']}
    return {'version': 1, 'source_id': target['id'], 'source_hash': target['content_hash'], 'rows': compared,
            'missing': [row for row in rows if row['name'] not in present],
            'limitations': ['仅匹配当前固定源码中的 input/extern 简单声明；不展开 include、宏或条件编译。',
                '枚举、复合默认表达式、缺失依赖和无法精确表示的数值保留未知；字符串中的内联优化样式标为歧义。',
                '配置文件不是运行证明；优化起止/步长不等于运行值，也不代表经过验证的推荐范围。']}
