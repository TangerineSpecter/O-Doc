"""Parameter source facts are independent of research/derived runtime aliases."""
import copy
import json
import re
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .inventory import build, encode, MAX_CHARS, VERSIONS
from .source_values import configured, scalar

WORKFLOWS = (21, 22, 23, 24, 25, 26, 27, 28)
KEYS = {'parameter_binding_version', 'parameter_inventory_json'}
FACT_KEYS = ('id', 'file', 'scope', 'source_name', 'kind', 'ordinal', 'type', 'default_raw', 'literal', 'line', 'end_line', 'quote', 'conditional')


def resolved(row: dict, inventory: dict) -> dict:
    return {'version': 1, 'status': 'resolved', 'source_hash': inventory['source_hash'],
            **{key: copy.deepcopy(row[key]) for key in FACT_KEYS}}


def validate_origin(value: object) -> dict:
    base = {'version', 'status', 'source_hash'}
    if (not isinstance(value, dict) or type(value.get('version')) is not int or value['version'] != 1
            or not isinstance(value.get('source_hash'), str) or not re.fullmatch(r'[0-9a-f]{64}', value['source_hash'])
            or value.get('status') not in ('resolved', 'unresolved', 'hypothesis')):
        raise ValidationError('参数源码身份版本或来源哈希无效')
    if value['status'] != 'resolved':
        if set(value) != base | {'source_name', 'reason'} or not all(isinstance(value.get(key), str) and 0 < len(value[key].strip()) <= 2000 for key in ('source_name', 'reason')):
            raise ValidationError('未定位/假设参数须说明原名与原因')
        return copy.deepcopy(value)
    if (set(value) != base | set(FACT_KEYS)
            or not isinstance(value['id'], str) or not re.fullmatch(r'parameter-binding:[a-f0-9]{24}', value['id'])
            or not all(isinstance(value[key], str) and 0 < len(value[key]) <= 6000 for key in ('file', 'scope', 'source_name', 'kind', 'type', 'quote'))
            or not isinstance(value['default_raw'], str) or len(value['default_raw']) > 8000
            or type(value['conditional']) is not bool
            or not all(type(value[key]) is int and 1 <= value[key] <= 10000 for key in ('ordinal', 'line', 'end_line'))
            or value['end_line'] < value['line'] or not isinstance(value['literal'], dict)
            or set(value['literal']) != {'kind', 'value'}):
        raise ValidationError('参数源码声明事实不完整')
    literal = value['literal']
    if literal['kind'] == 'unknown':
        if literal['value'] is not None: raise ValidationError('未知默认值不得携带猜测值')
    elif scalar(literal['value']) != literal:
        raise ValidationError('参数源码字面值类型不完整或不受支持')
    return copy.deepcopy(value)


def entry_for(raw: dict, inventory: dict) -> dict | None:
    rows = inventory['declarations']; identity = raw.get('binding_id')
    if not identity and isinstance(raw.get('source_binding'), dict) and raw['source_binding'].get('status') == 'resolved':
        identity = raw['source_binding'].get('id')
    if identity:
        matches = [row for row in rows if row['id'] == identity]
        if len(matches) != 1: raise ValidationError('参数binding_id不属于本次固定来源目录')
        row = matches[0]
        if raw.get('name') not in (row['source_name'], row['symbol']):
            raise ValidationError('参数名称与所选源码声明不一致')
        return row
    matches = [row for row in rows if row['symbol'] == raw.get('name')]
    if len(matches) == 1 and (matches[0]['symbol'] != matches[0]['source_name'] or matches[0].get('auto_match', True)):
        return matches[0]
    matches = [row for row in rows if row['source_name'] == raw.get('name')]
    return matches[0] if len(matches) == 1 and matches[0].get('auto_match', True) else None


def normalize_model_binding_ids(parameters: list[dict], inventory: dict) -> list[dict]:
    """Discard a model's bad hint only when the name independently identifies one declaration."""
    result = copy.deepcopy(parameters)
    rows = {row['id']: row for row in inventory['declarations']}
    for raw in result:
        if not isinstance(raw, dict) or not raw.get('binding_id') or raw.get('source_binding') is not None:
            continue
        row = rows.get(raw['binding_id']) if isinstance(raw['binding_id'], str) else None
        if row and raw.get('name') in (row['source_name'], row['symbol']):
            continue
        without_hint = {key: value for key, value in raw.items() if key != 'binding_id'}
        if entry_for(without_hint, inventory) is not None:
            raw.pop('binding_id')
    return result


def bind(parameters: list[dict], raw: list[dict], inventory: dict) -> list[dict]:
    if len(parameters) != len(raw): raise ValidationError('参数绑定输入数量不一致')
    result, used, ids = [], set(), set()
    for index, (parameter, original) in enumerate(zip(parameters, raw)):
        row = entry_for(original, inventory)
        blocked = row if row and row.get('blocked') else None
        if blocked: row = None
        current = copy.deepcopy(parameter)
        if row:
            origin = resolved(row, inventory)
            if row['id'] in ids: raise ValidationError('同一源码参数声明不能重复生成参数行')
            ids.add(row['id']); current['name'] = row['symbol']
            if inventory['version'] == 2 and inventory['language'] == 'tongdaxin':
                if row['kind'] in ('formula_assignment', 'formula_output'): current['category'] = 'state'
                elif row['kind'] == 'module_literal': current['category'] = 'constant'
                elif row['kind'] == 'external_parameter' and current['category'] in ('constant', 'state'):
                    raise ValidationError('外部参数表定义不是常量或内部状态，请按实际用途分类')
            if row.get('declared_domain') is not None:
                if 'domain' in current and encode(current['domain']) != encode(row['declared_domain']):
                    raise ValidationError('不能改写参数表中明确声明的上下限')
                current['domain'] = copy.deepcopy(row['declared_domain'])
            elif current.get('domain', {}).get('version') == 5:
                raise ValidationError('参数表范围只能绑定已定位的外部参数表声明')
            literal = row['literal']
            if literal['kind'] != 'unknown':
                model_default = configured(parameter['default_value'], literal['kind'], inventory['language'])
                if (model_default['kind'] != literal['kind'] and {model_default['kind'], literal['kind']} - {'int', 'float'}
                        or model_default['value'] != literal['value']):
                    raise ValidationError('AI默认值与所选声明的字面值不一致，不能发布为源码默认')
                current['default_value'] = json.dumps(literal['value'], ensure_ascii=False, allow_nan=False)
                if row['type'] in ('int', 'float', 'bool', 'string'): current['type'] = row['type']
            else:
                if current['default_value'] not in ('', row['default_raw']):
                    raise ValidationError('动态或无默认值参数不能填入猜测的源码默认值')
                # A transformed Pine input can have a numeric raw argument
                # while its assigned value is unknown. Keep raw syntax only in
                # provenance; never let it become a usable baseline default.
                current['default_value'] = ''
        else:
            if 'domain' in current: raise ValidationError('未定位参数不能附带可执行约束，须先明确源码身份')
            supplied = original.get('source_binding', {})
            source_name = supplied.get('source_name', original['name']) if supplied.get('status') == 'unresolved' else original['name']
            if blocked: source_name = blocked['source_name']
            origin = {'version': 1, 'status': 'unresolved', 'source_hash': inventory['source_hash'],
                'source_name': source_name, 'reason': blocked['blocked'] if blocked else '目录中无唯一声明或作用域不完整；未按同名推断映射。'}
            if inventory['version'] == 2: current['default_value'] = ''
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,79}', current['name']) or current['name'] in used:
                current['name'] = 'u_' + digest([original['name'], original.get('evidence', ''), index])[:24]
        if original.get('source_binding') is not None and encode(original['source_binding']) != encode(origin):
            raise ValidationError('模型不能改写系统参数来源事实')
        if current['name'] in used: raise ValidationError('参数内部符号重复')
        used.add(current['name']); current['source_binding'] = validate_origin(origin); result.append(current)
    return result


def propagate(factors: list[dict], raw_factors: list[dict], parameters: list[dict]) -> list[dict]:
    """Original extracted definitions use the report's exact parameter contract."""
    names = {row['name']: row for row in parameters}
    ids = {row['source_binding'].get('id'): row for row in parameters if row['source_binding']['status'] == 'resolved'}
    result = copy.deepcopy(factors)
    for factor, raw in zip(result, raw_factors):
        selected = []
        for row in raw['parameters']:
            if not isinstance(row, dict): raise ValidationError('候选参数须为完整对象')
            parent = ids.get(row.get('binding_id')) if row.get('binding_id') else names.get(row.get('name'))
            if parent is None: raise ValidationError('候选参数须引用本报告明确的内部符号或binding_id')
            if row.get('name') not in (parent['name'], parent['source_binding']['source_name']):
                raise ValidationError('候选参数名称与所选声明不一致')
            if set(row) != {'name'}:
                for key in ('type', 'default_value', 'category', 'domain'):
                    if row.get(key) != parent.get(key): raise ValidationError('原始候选参数类型、默认、用途及约束须与参数阶段一致')
            if row.get('source_binding') is not None and encode(row['source_binding']) != encode(parent['source_binding']):
                raise ValidationError('候选不能改写参数来源')
            if factor.get('expression') is not None and parent['source_binding']['status'] == 'unresolved':
                raise ValidationError('未定位源码参数的原始候选不能冒充可执行表达式')
            selected.append(copy.deepcopy(parent))
        factor['parameters'] = selected
    return result


def extension(value: dict) -> dict:
    if not KEYS.intersection(value): return {}
    if not KEYS <= value.keys() or type(value.get('parameter_binding_version')) is not int or value['parameter_binding_version'] not in VERSIONS:
        raise ValidationError('源码参数身份扩展不完整')
    raw = value['parameter_inventory_json']
    if not isinstance(raw, str) or len(raw) > MAX_CHARS: raise ValidationError('参数目录超过完整事实预算')
    try: inventory = json.loads(raw)
    except (ValueError, TypeError, RecursionError) as exc: raise ValidationError('参数目录JSON无效') from exc
    if (not isinstance(inventory, dict) or set(inventory) != {'version', 'parser', 'source_hash', 'language', 'status', 'declarations', 'limitations'}
            or type(inventory.get('version')) is not int or inventory['version'] not in VERSIONS
            or inventory.get('parser') != VERSIONS[inventory['version']] or inventory['version'] != value['parameter_binding_version']
            or not isinstance(inventory.get('declarations'), list) or len(inventory['declarations']) > 300
            or inventory.get('status') not in ('partial', 'limited', 'unparsed', 'unsupported')
            or not isinstance(inventory.get('limitations'), list) or len(inventory['limitations']) > 40
            or not all(isinstance(item, str) and len(item) <= 3000 for item in inventory['limitations'])
            or not isinstance(inventory.get('language'), str)
            or not isinstance(inventory.get('source_hash'), str) or not re.fullmatch(r'[0-9a-f]{64}', inventory['source_hash'])):
        raise ValidationError('参数目录版本或规范化无效')
    entries, symbols = {}, set()
    for row in inventory['declarations']:
        if not isinstance(row, dict) or set(row) != set(FACT_KEYS) | {'symbol', 'auto_match'} | ({'declared_domain', 'blocked'} if inventory['version'] == 2 else set()):
            raise ValidationError('参数目录声明字段不完整')
        origin = validate_origin(resolved(row, inventory))
        identity = 'parameter-binding:' + digest([inventory['parser'], row['file'], row['scope'], row['source_name'], row['kind'], row['ordinal']])[:24]
        if inventory['version'] == 2:
            if not isinstance(row['blocked'], str) or len(row['blocked']) > 2000: raise ValidationError('声明冲突说明无效')
            if row['declared_domain'] is not None:
                from .domains import validate_domain
                if validate_domain(row['declared_domain'])['version'] != 5 or row['kind'] != 'external_parameter':
                    raise ValidationError('参数表范围必须绑定外部参数声明')
        if (identity != row['id'] or identity in entries or type(row['auto_match']) is not bool
                or not isinstance(row['symbol'], str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,79}', row['symbol']) or row['symbol'] in symbols):
            raise ValidationError('参数目录身份或内部符号无效')
        entries[identity] = origin; symbols.add(row['symbol'])
    if encode(inventory) != raw: raise ValidationError('参数目录JSON不是规范原件')
    names, bindings = set(), set()
    for parameter in value['parameters']:
        origin = validate_origin(parameter.get('source_binding'))
        if origin['source_hash'] != inventory['source_hash'] or origin['status'] == 'hypothesis':
            raise ValidationError('原始报告参数不能改换来源或伪装新增假设')
        if origin['status'] == 'resolved' and encode(origin) != encode(entries.get(origin['id'])):
            raise ValidationError('参数来源不属于冻结声明目录')
        if parameter['name'] in names: raise ValidationError('源码参数内部符号不得重复')
        names.add(parameter['name'])
        if origin['status'] == 'resolved':
            entry = next(row for row in inventory['declarations'] if row['id'] == origin['id'])
            if parameter['name'] != entry['symbol'] or origin['id'] in bindings:
                raise ValidationError('源码参数内部符号与唯一声明不一致')
            bindings.add(origin['id'])
    return {'parameter_binding_version': inventory['version'], 'parameter_inventory_json': raw}


def validate_source(value: dict, payload: dict) -> None:
    if not KEYS.intersection(value): return
    extension(value)
    inventory = build(payload, value['parameter_binding_version'])
    if value['parameter_inventory_json'] != encode(inventory):
        raise ValidationError('参数目录与来源原文不一致')
    if bind(value['parameters'], value['parameters'], inventory) != value['parameters']:
        raise ValidationError('原始报告参数默认值或绑定不一致')
    parent = {row['name']: row for row in value['parameters']}
    for factor in value.get('factors', []):
        for parameter in factor['parameters']:
            if parent.get(parameter['name']) != parameter:
                raise ValidationError('原始候选参数与报告绑定不一致')
    if 'factor_repair' in value and repair_origins(value['factor_repair'], value.get('factors', []), digest(payload)) != value['factor_repair']:
        raise ValidationError('修订参数的来源事实不完整')


def validate_inheritance(parameters: list[dict], parents: list[dict]) -> None:
    allowed = [row['source_binding'] for row in parents if 'source_binding' in row]
    for row in parameters:
        origin = row.get('source_binding')
        if origin is not None and origin not in allowed:
            raise ValidationError('人工修订只能保留父代参数的来源事实；新增参数不冒充源码声明')


def validate_admission(value: dict, version: int) -> None:
    if value and bool(KEYS.intersection(value)) != (version in WORKFLOWS):
        raise ValidationError('参数身份须绑定支持的参数身份工作流，历史报告不能追加')
    if value and version in WORKFLOWS: extension(value)
    if value and version in WORKFLOWS and value.get('parameter_binding_version') != (2 if version in (25, 26, 27, 28) else 1):
        raise ValidationError('参数目录版本与工作流不一致')
    elif value and version not in WORKFLOWS and any('source_binding' in parameter for parameter in [*value.get('parameters', []),
            *(row for factor in value.get('factors', []) for row in factor['parameters']),
            *(row for item in value.get('factor_repair', {}).get('items', []) for row in (item.get('definition') or {}).get('parameters', []))]):
        raise ValidationError('旧源码报告不能追加未冻结的参数身份')
    if value and version not in (25, 26, 27, 28) and any(parameter.get('domain', {}).get('version') == 5 for parameter in [
            *value.get('parameters', []), *(row for factor in value.get('factors', []) for row in factor['parameters']),
            *(row for item in value.get('factor_repair', {}).get('items', []) for row in (item.get('definition') or {}).get('parameters', []))]):
        raise ValidationError('参数表范围v5须绑定工作流25/26/27，旧报告不追加新合同')


def describe(parameter: dict) -> str:
    origin = parameter['source_binding']
    if origin['status'] != 'resolved':
        return f"参数来源：{origin['source_name']}（{'新增实验假设' if origin['status'] == 'hypothesis' else '未定位'}）；{origin['reason']}"
    label = '参数表定义' if origin['kind'] == 'external_parameter' else '源码声明'
    return (f"{label}：`{origin['file']}` · `{origin['scope']}` · `{origin['source_name']}`，行{origin['line']}–{origin['end_line']}；"
        f"声明类别：{origin['kind']}。仅定位声明，不代表实际运行值或最优参数。\n\n原始默认表达式：\n\n"
        + fenced(origin['default_raw'] or '无默认值')
        + ('\n\n变量默认值未能静态确定；上面仅保留原输入或声明片段。' if origin['literal']['kind'] == 'unknown' else ''))


def fenced(text: str) -> str:
    fence = '`' * max(3, max((len(row) + 1 for row in re.findall(r'`+', text)), default=0))
    return fence + 'text\n' + text + '\n' + fence


def heading(parameter: dict) -> str:
    origin = parameter.get('source_binding')
    if not origin: return parameter['name']
    if origin['status'] == 'resolved': return f"`{origin['file']}` · `{origin['scope']}` · `{origin['source_name']}`"
    return f"{origin['source_name']} · {'实验假设' if origin['status'] == 'hypothesis' else '未定位'}"


def repair_origins(value: dict, factors: list[dict], source_hash: str) -> dict:
    """Preserve original facts while allowing explicitly new hypothesis knobs."""
    if not isinstance(value, dict) or not isinstance(value.get('items'), list) or any(not isinstance(row, dict) for row in value['items']):
        raise ValidationError('AI修订须为完整的items对象数组')
    result = copy.deepcopy(value)
    for item in result.get('items', []):
        definition = item.get('definition')
        if not isinstance(definition, dict): continue
        index = item.get('factor_index')
        if type(index) is not int or not 0 <= index < len(factors): continue
        parents = {row['name']: row for row in factors[index]['parameters']}
        parameters = definition.get('parameters', [])
        if not isinstance(parameters, list) or any(not isinstance(row, dict) for row in parameters):
            raise ValidationError('修订参数须为完整对象数组')
        for parameter in parameters:
            parent = parents.get(parameter.get('name'))
            if parent and 'evidence' not in parameter:
                parameter['evidence'] = parent['evidence']
            origin = (parent or {}).get('source_binding') or {'version': 1, 'status': 'hypothesis', 'source_hash': source_hash,
                'source_name': parameter.get('name', ''), 'reason': 'AI修订新增的实验参数，不是已定位的原始源码输入。'}
            if parameter.get('source_binding') is not None and encode(parameter['source_binding']) != encode(origin):
                raise ValidationError('AI修订不得更改参数的原始来源事实')
            parameter['source_binding'] = validate_origin(origin)
    return result


INSTRUCTION = '''
本次parameter_inventory是系统声明目录，不是实际运行参数。返回parameters时优先列相关公开输入、函数参数和初始化项，内部状态可省略。
目录的symbol是本机表达式/实验使用的唯一内部符号，source_name才是源码变量。不同文件或作用域的同名项不能合并。
可定位项请使用name=原样symbol，并在该参数对象额外提供binding_id=原样id；唯一无歧义原名可由系统匹配。
保留源码字面默认值，不用实际配置/候选建议替换。动态默认或无默认值的default_value留空；原表达式由系统保留，不求值、不猜造。
用途、建议、约束仍由你解释；模块/局部赋值仅是源码初始声明，不是公开可调输入，修改它需新源码版本。
找不到唯一声明时保留未定位说明，不提供可执行domain或最优范围。source_binding由系统绑定，不生成或改写该对象。
所有可执行domain的关联参数使用目录symbol，不能按同名猜测；建议仍须说明用途、前提、理由和验证计划。
'''
