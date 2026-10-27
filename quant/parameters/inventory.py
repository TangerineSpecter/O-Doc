"""Versioned parameter identities across provided files and lexical scopes."""
from collections import Counter
import copy
import hashlib
import json
import re
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.source_structure.common import source_lines
from .source_values import configured

VERSION = 'source-parameter-identities-v1'
VERSIONS = {1: VERSION, 2: 'source-parameter-identities-v2'}
MAX_CHARS = 160000


def encode(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def parts(payload: dict) -> list[dict]:
    if not payload.get('bundle_version'):
        suffix = {'python': 'py', 'mql4': 'mq4', 'pine': 'pine', 'tongdaxin': 'tdx'}.get(payload.get('language'), 'txt')
        return [{'name': '__source__.' + suffix, 'code': payload.get('code', ''), 'start_line': 1}]
    from quant.source_changes.python_bundle import file_rows
    if payload.get('language') == 'python': return file_rows(payload)
    rows, line, rendered = payload.get('files'), 1, []
    if type(payload.get('bundle_version')) is not int or payload['bundle_version'] != 1 or not isinstance(rows, list) or not 1 <= len(rows) <= 8:
        raise ValidationError('参数文件包版本或数量无效')
    names = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict) or not isinstance(row.get('name'), str) or not isinstance(row.get('code'), str):
            raise ValidationError('参数文件包缺少正文')
        name, code = row['name'], row['code']
        if name in names or any(part in ('', '.', '..') for part in name.split('/')) or '\\' in name:
            raise ValidationError('参数文件包名称不明确')
        names.add(name)
        if row.get('role') != ('primary' if index == 0 else 'dependency') or row.get('content_hash') != hashlib.sha256(code.encode()).hexdigest():
            raise ValidationError('参数文件包身份或正文哈希无效')
        if type(row.get('start_line')) is not int or type(row.get('end_line')) is not int or (row['start_line'], row['end_line']) != (line + 1, line + len(source_lines(code))):
            raise ValidationError('参数声明文件边界不一致')
        label = f'SOURCE FILE: {name} ({row["role"]}; {"from parent snapshot" if index == 0 else "user supplied"}; not executed)'
        header = '{ ' + label + ' }\n' if payload.get('language') == 'tongdaxin' else '// ' + label + '\n'
        block = header + code + '\n\n'; rendered.append(block); line += len(source_lines(block))
    if ''.join(rendered) != payload.get('code'): raise ValidationError('参数文件包与完整正文不一致')
    return rows


def declarations(code: str, language: str, version: int = 1) -> tuple[list[dict], list[str], str]:
    if language == 'python':
        from .python_inventory import declarations as python
        return python(code)
    if language == 'tongdaxin' and version == 2:
        from .tongdaxin_inventory import declarations as tongdaxin
        return tongdaxin(code)
    if language == 'pine':
        from .pine_declarations import parse
        parsed, warnings, status = parse(code)
    elif language == 'mql4':
        from .comparison import declarations as mql
        parsed, warnings, status = mql(code), ['MQL4仅定位简单input/extern，不展开宏、include或条件编译。'], 'partial'
    else:
        return [], ['该语言尚无作用域参数目录；名称、默认值及运行映射保持未定位。'], 'unsupported'
    counts = Counter(); rows = []
    for row in parsed:
        kind = row.get('binding_kind', 'exposed_input')
        scope = row.get('scope', '<module>'); counts[scope, row['name'], kind] += 1
        expected = {'double': 'float', 'long': 'int', 'uint': 'int', 'short': 'int', 'str': 'string'}.get(row['type'], row['type'])
        rows.append({'source_name': row['name'], 'scope': scope, 'kind': kind,
            'ordinal': counts[scope, row['name'], kind], 'type': expected,
            'default_raw': row['default_raw'], 'literal': copy.deepcopy(row.get('default_value')) or configured(row['default_raw'], expected, language),
            'line': row['line'], 'end_line': row['line'] + max(0, len(source_lines(row['quote'])) - 1),
            'quote': row['quote'], 'conditional': False, 'auto_match': True})
    return rows, warnings, status


def build(payload: dict, version: int = 1) -> dict:
    if type(version) is not int or version not in VERSIONS: raise ValidationError('参数目录版本无效')
    base = {'version': version, 'parser': VERSIONS[version], 'source_hash': digest(payload), 'language': payload.get('language', ''),
        'status': 'partial', 'declarations': [], 'limitations': []}
    try:
        files = parts(payload)
        if sum(len(row['code']) for row in files) > 150000: raise ValueError('参数目录正文超过上限')
        for file in files:
            rows, warnings, status = [], [], 'partial'
            if version == 2 and payload.get('language') == 'tongdaxin' and file['name'].lower().endswith(('.csv', '.tsv', '.txt')):
                from .tongdaxin_inventory import table
                rows, warnings = table(file['code'], 'code')
                if not rows and file['name'].lower().endswith(('.csv', '.tsv')):
                    raise ValueError('CSV/TSV不是完整参数表')
                for row in rows: row['scope'] = '<external_parameters:file>'
            if not rows: rows, warnings, status = declarations(file['code'], payload.get('language', ''), version)
            base['limitations'].extend(warnings)
            if status in ('limited', 'unparsed', 'unsupported'):
                base.update(status=status, declarations=[]); return base
            for row in rows:
                row.update(file=file['name'], line=row['line'] + file['start_line'] - 1,
                    end_line=row['end_line'] + file['start_line'] - 1)
                if len(row['quote']) > 6000 or len(row['default_raw']) > 8000 or row['end_line'] > 10000 or len(row['scope']) > 6000:
                    raise ValueError('单项声明超过完整事实预算')
                base['declarations'].append(row)
            if len(base['declarations']) > 300: raise ValueError('参数目录超过300项')
        if version == 2 and payload.get('language') == 'tongdaxin':
            from .tongdaxin_inventory import table
            for field in ('parameters', 'description'):
                rows, warnings = table(payload.get(field, ''), field)
                base['declarations'].extend(rows); base['limitations'].extend(warnings)
        if len(base['declarations']) > 300: raise ValueError('参数目录超过300项')
        for row in base['declarations']:
            if len(row['quote']) > 6000 or row['end_line'] > 10000: raise ValueError('声明超过完整事实预算')
            row['id'] = 'parameter-binding:' + digest([VERSIONS[version], row['file'], row['scope'], row['source_name'], row['kind'], row['ordinal']])[:24]
            if version == 2: row.update(declared_domain=row.get('declared_domain'), blocked=row.get('blocked', ''))
        rows = base['declarations']; counts = Counter(row['source_name'] for row in rows)
        if version == 2 and payload.get('language') == 'tongdaxin':
            counts = Counter(row['source_name'].casefold() for row in rows)
            for row in rows:
                if counts[row['source_name'].casefold()] > 1:
                    row.update(auto_match=False, blocked='同名或仅大小写不同的公式/参数表声明冲突，未确定原平台绑定。')
        reserved = {row['source_name'] for row in rows}; used = set()
        for row in rows:
            simple = bool(re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,79}', row['source_name']))
            key = row['source_name'].casefold() if version == 2 and payload.get('language') == 'tongdaxin' else row['source_name']
            symbol = row['source_name'] if simple and counts[key] == 1 else 'p_' + row['id'].split(':')[1]
            stem, counter = symbol, 1
            while symbol in used or symbol in reserved and symbol != row['source_name']:
                symbol = stem + '_c' + str(counter); counter += 1
            row['symbol'] = symbol; used.add(symbol)
        base['limitations'] = list(dict.fromkeys([*base['limitations'],
            '身份只定位源码声明；初始值、函数默认与公开输入不同，不证明实际配置、原平台运行或最优参数。']))
        if len(encode(base)) > MAX_CHARS: raise ValueError('参数目录超过完整事实预算')
    except (ValueError, ValidationError, RecursionError, MemoryError):
        base.update(status='limited', declarations=[], limitations=['参数目录无法完整定位或超过预算；不使用截断结果，不执行原始源码。'])
    return base


def context(value: dict) -> dict:
    return {**{key: copy.deepcopy(value[key]) for key in ('version', 'parser', 'source_hash', 'status', 'limitations')},
        'declarations': [{key: copy.deepcopy(row[key]) for key in ('id', 'symbol', 'source_name', 'file', 'scope', 'kind', 'type', 'line', 'end_line', 'default_raw', 'literal', 'conditional', 'declared_domain', 'blocked') if key in row}
            for row in value['declarations']], 'notice': '完整原文已单列；ID定位声明，symbol用于本机表达式，source_name才是源码变量。'}
