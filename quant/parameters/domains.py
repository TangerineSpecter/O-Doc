"""Bounded declarative parameter domains. No prose parsing or code execution."""
import copy
from decimal import Decimal, localcontext

from rest_framework.exceptions import ValidationError
from quant.factors.expression import finite_number, text_value

from . import conditions
from .conditions import OPERATORS, SYMBOLS

FIELDS = {'version', 'minimum', 'maximum', 'step', 'step_origin', 'choices', 'relations', 'evidence'}


def validate_domain(value: dict) -> dict:
    if (not isinstance(value, dict) or type(value.get('version')) is not int or value['version'] not in (1, 2, 3, 4, 5)
            or set(value) != FIELDS | ({'conditions'} if value['version'] >= 2 else set())):
        raise ValidationError('参数可执行约束版本或字段无效')
    if value['version'] == 5 and (value['minimum'] is None or value['maximum'] is None
            or value['step'] is not None or value['step_origin'] is not None or value['choices'] or value['relations'] or value['conditions']):
        raise ValidationError('参数表v5只支持明确上下限，不添加步长、枚举或关联规则')
    for key in ('minimum', 'maximum', 'step', 'step_origin'):
        if value[key] is not None and not finite_number(value[key]):
            raise ValidationError('参数范围与步长必须是有限数值或 null')
    if value['minimum'] is not None and value['maximum'] is not None and value['minimum'] > value['maximum']:
        raise ValidationError('参数下限不能超过上限')
    if (value['step'] is None) != (value['step_origin'] is None) or (value['step'] is not None and value['step'] <= 0):
        raise ValidationError('正步长与起点必须同时提供；未声明时均为 null')
    choices = value['choices']
    if not isinstance(choices, list) or len(choices) > 32 or any(type(item) is not bool and not finite_number(item) and not (value['version'] >= 3 and text_value(item)) for item in choices):
        raise ValidationError('参数枚举最多 32 项；字符串枚举需 v3，单项至多 200 字符且不含控制字符')
    if any(type(item) is type(other) and item == other for i, item in enumerate(choices) for other in choices[i + 1:]):
        raise ValidationError('参数枚举不能重复')
    relations = value['relations']
    if not isinstance(relations, list) or len(relations) > 8:
        raise ValidationError('每个参数最多 8 条关联约束')
    seen = set()
    for row in relations:
        if (not isinstance(row, dict) or set(row) != {'operator', 'parameter'}
                or not isinstance(row['operator'], str) or row['operator'] not in OPERATORS
                or not isinstance(row['parameter'], str) or not 1 <= len(row['parameter']) <= 200):
            raise ValidationError('参数关系只支持与另一声明参数的大小/相等比较')
        key = (row['operator'], row['parameter'])
        if key in seen:
            raise ValidationError('参数关联约束不能重复')
        seen.add(key)
    if value['version'] >= 2:
        rules = value['conditions']
        if not isinstance(rules, list) or not (0 if value['version'] >= 3 else 1) <= len(rules) <= 8:
            raise ValidationError('条件约束需包含 1–8 条规则')
        for rule in rules:
            if not isinstance(rule, dict) or set(rule) != {'when', 'require'}:
                raise ValidationError('条件规则必须同时包含 when 与 require')
            conditions.validate(rule['when'], allow_text=value['version'] >= 3, allow_arithmetic=value['version'] == 4)
            conditions.validate(rule['require'], allow_text=value['version'] >= 3, allow_arithmetic=value['version'] == 4)
    evidence = value['evidence']
    if not isinstance(evidence, list) or not 1 <= len(evidence) <= 5:
        raise ValidationError('可执行参数约束必须保留原文依据')
    for row in evidence:
        if (not isinstance(row, dict) or set(row) != {'field', 'quote'}
                or row['field'] not in (('code', 'description', 'parameters') if value['version'] == 5 else ('code', 'description', 'web_markdown'))
                or not isinstance(row['quote'], str) or not row['quote'].strip() or len(row['quote']) > 3000):
            raise ValidationError('参数约束的原文引用格式无效')
    if all(value[key] is None for key in ('minimum', 'maximum', 'step')) and not choices and not relations and not value.get('conditions'):
        raise ValidationError('没有明确约束时省略 domain，不创建空约束')
    return copy.deepcopy(value)


def kind(parameter: dict) -> str:
    return {'int': 'int', 'integer': 'int', 'float': 'number', 'double': 'number',
            'number': 'number', 'bool': 'bool', 'boolean': 'bool', 'string': 'string', 'str': 'string'}.get(parameter['type'].strip().lower(), '')


def validate_contract(parameters: list[dict]) -> None:
    """Only new domains add requirements; historical prose-only snapshots stay intact."""
    if not any('domain' in row for row in parameters):
        return
    by_name = {row['name']: row for row in parameters}
    if len(by_name) != len(parameters):
        raise ValidationError('包含可执行约束的参数名称必须唯一')
    for row in parameters:
        if 'domain' not in row:
            continue
        domain = validate_domain(row['domain'])
        category = kind(row)
        if not category:
            raise ValidationError('可执行参数约束只适用于已识别的数值、布尔及 v3 字符串类型')
        if category == 'string' and (domain['version'] < 3 or not domain['choices']):
            raise ValidationError('字符串参数必须提供 v3 声明枚举')
        if category in ('bool', 'string') and any(domain[key] is not None for key in ('minimum', 'maximum', 'step')):
            raise ValidationError('布尔和字符串参数不能声明数值范围或步长')
        for choice in domain['choices']:
            validate_type(row, choice)
            validate_scalar(row['name'], choice, domain)
        for rule in domain.get('conditions', []):
            for predicate in rule.values():
                conditions.validate(predicate, {name: kind(item) for name, item in by_name.items()},
                                    allow_text=domain['version'] >= 3, allow_arithmetic=domain['version'] == 4)
        for relation in domain['relations']:
            other = by_name.get(relation['parameter'])
            if not other or other['name'] == row['name'] or not kind(other):
                raise ValidationError('参数关联必须引用同一候选中另一已识别类型的参数')
            if ((category in ('bool', 'string') or kind(other) in ('bool', 'string'))
                    and (category != kind(other) or relation['operator'] not in ('eq', 'ne'))):
                raise ValidationError('布尔或字符串关系只支持同类型参数的相等/不等比较')


def validate_type(parameter: dict, value) -> None:
    category = kind(parameter)
    if ((category == 'int' and type(value) is not int)
            or (category == 'bool' and type(value) is not bool)
            or (category == 'string' and not text_value(value))
            or (category == 'number' and not finite_number(value))):
        raise ValidationError(f"参数 {parameter['name']} 与声明类型不一致")


def validate_scalar(name: str, value, domain: dict) -> None:
    if domain['minimum'] is not None and value < domain['minimum']:
        raise ValidationError(f'参数 {name} 小于声明下限 {domain["minimum"]}')
    if domain['maximum'] is not None and value > domain['maximum']:
        raise ValidationError(f'参数 {name} 大于声明上限 {domain["maximum"]}')
    if domain['choices'] and not any(type(value) is type(item) and value == item or
            finite_number(value) and finite_number(item) and value == item for item in domain['choices']):
        raise ValidationError(f'参数 {name} 不在声明枚举中')
    if domain['step'] is not None:
        # Decimal text avoids rejecting 0.3 on a 0.1 grid. Precision also covers
        # the full finite float exponent range without a permissive tolerance.
        with localcontext() as ctx:
            ctx.prec = 1000
            if (Decimal(str(value)) - Decimal(str(domain['step_origin']))) % Decimal(str(domain['step'])):
                raise ValidationError(f'参数 {name} 不满足声明步长 {domain["step"]}（起点 {domain["step_origin"]}）')


def validate_values(parameters: list[dict], values: dict) -> None:
    validate_contract(parameters)
    by_name = {row['name']: row for row in parameters}
    for row in parameters:
        domain = row.get('domain')
        if domain is None:
            continue
        if row['name'] not in values:
            raise ValidationError('参数约束缺少实际参数值')
        value = values[row['name']]
        validate_type(row, value)
        validate_scalar(row['name'], value, domain)
        for rule in domain.get('conditions', []):
            # Check all dependencies before short-circuit evaluation, including inactive branches.
            for name in conditions.references(rule['when']) | conditions.references(rule['require']):
                if name not in values:
                    raise ValidationError('条件约束缺少依赖参数值')
                validate_type(by_name[name], values[name])
            if domain['version'] == 4:
                for predicate in rule.values():
                    conditions.validate_values(predicate, values)
            if conditions.evaluate(rule['when'], values, exact=domain['version'] == 4) and not conditions.evaluate(rule['require'], values, exact=domain['version'] == 4):
                raise ValidationError('条件约束不满足：当 ' + conditions.describe(rule['when']) + ' 时，要求 ' + conditions.describe(rule['require']))
        for relation in domain['relations']:
            if relation['parameter'] not in values:
                raise ValidationError('参数关系缺少依赖参数值')
            other = values[relation['parameter']]
            validate_type(by_name[relation['parameter']], other)
            if not OPERATORS[relation['operator']](value, other):
                raise ValidationError(f'参数关系不满足：{row["name"]} {SYMBOLS[relation["operator"]]} {relation["parameter"]}')


def validate_evidence(parameters: list[dict], source: dict) -> None:
    for parameter in parameters:
        for evidence in parameter.get('domain', {}).get('evidence', []):
            if evidence['quote'] not in source.get(evidence['field'], ''):
                raise ValidationError('参数约束引文必须逐字存在于固定来源中')


def renamed(parameters: list[dict], mapping: dict[str, str]) -> list[dict]:
    result = copy.deepcopy(parameters)
    for row in result:
        row['name'] = mapping[row['name']]
        for rule in row.get('domain', {}).get('conditions', []):
            for key in ('when', 'require'):
                rule[key] = conditions.renamed(rule[key], mapping)
        for relation in row.get('domain', {}).get('relations', []):
            relation['parameter'] = mapping[relation['parameter']]
    return result


def describe(name: str, domain: dict) -> str:
    parts = []
    if domain['minimum'] is not None: parts.append(f'{name} ≥ {domain["minimum"]}')
    if domain['maximum'] is not None: parts.append(f'{name} ≤ {domain["maximum"]}')
    if domain['step'] is not None: parts.append(f'步长 {domain["step"]}，起点 {domain["step_origin"]}')
    if domain['choices']: parts.append('枚举：' + '、'.join(str(item) for item in domain['choices']))
    parts += [f'{name} {SYMBOLS[row["operator"]]} {row["parameter"]}' for row in domain['relations']]
    parts += ['当 ' + conditions.describe(rule['when']) + ' 时，要求 ' + conditions.describe(rule['require'])
              for rule in domain.get('conditions', [])]
    return '；'.join(parts)


def prompt() -> str:
    return '''\n参数可选增加 domain，只有原文明确声明且可表达时才提供，不得把建议范围改写成硬约束。
domain 完整格式：{version:1,minimum:数字或null,maximum:数字或null,step:数字或null,step_origin:数字或null,choices:数值或布尔数组,relations:[{operator:lt/lte/gt/gte/eq/ne,parameter:另一参数名}],evidence:[{field:code/description/web_markdown,quote:逐字原文}]}。
上下限为闭区间，step 与 step_origin 必须同时已知（否则均null）；没有枚举/关系时用[]。v1/v2 支持 int/integer/float/double/number/bool/boolean 类型，字符串枚举用 domain v3：同样完整字段并包含 conditions（没有条件时为[]），参数类型为 string/str，choices必须非空且为至多32个不含控制字符、各最多200字符的字符串；数值上下限和步长均null。字符串只允许同类型eq/ne判断，不可用于大小/算术/窗口。布尔仅支持枚举及与布尔参数eq/ne。
关系引用必须包含在本报告/同一因子的参数清单内，不能丢弃依赖参数。条件性约束使用 domain v2：保留上述全部字段，将 version 改为2，新增 conditions:[{when:条件表达式,require:条件表达式}]，1–8条，所有规则同时适用。条件表达式为 {operator:lt/lte/gt/gte/eq/ne,left:{parameter:参数名}或{value:数值或布尔（v3也允许字符串）},right:同左}；至少一侧为参数。也支持 {operator:all/any,arguments:[2–8个条件]} 和 {operator:not,argument:条件}，每个表达式最多32节点/6层。所有引用必须声明，布尔只允许eq/ne；条件为假只跳过本条 require，不取消参数基本类型或其他无条件约束。只有原文明示的逻辑才转为条件，不猜测依赖；不支持的复杂约束保留 constraints 文字并省略对应机器规则；完全没有规则时省略domain。不要从默认值或优化区间推断声明范围。
需要明确的条件算术时使用 domain v4：完整字段与v3相同，条件操作数额外支持 {operator:add/sub/mul/div,left:操作数,right:操作数} 或 {operator:neg,argument:操作数}，可递归嵌套；不支持其他函数、幂运算、赋值或代码执行。至少一侧的嵌套树须引用本清单参数；仅int/integer/float/double/number参数可参与算术，布尔/字符串仍只能同类型eq/ne。每个when或require合计最多64节点、8层，包含谓词、算术节点及参数/常量叶子；all/any仍为2–8项。数值字面和全部被引用实际数值的绝对值必须≤9007199254740991且有限，即使分支未触发也检查输入。这是安全表示限制，不是声明的经济参数范围。
完整v4示例：{version:4,minimum:null,maximum:null,step:null,step_origin:null,choices:[],relations:[],conditions:[{when:{operator:eq,left:{parameter:"enabled"},right:{value:true}},require:{operator:lte,left:{operator:add,left:{parameter:"fast"},right:{value:2}},right:{parameter:"slow"}}}],evidence:[{field:"code",quote:"当enabled启用时要求fast + 2 <= slow"}]}。enabled/fast/slow须在同一参数清单声明，quote须逐字存在于固定原文；示例不是通用交易规则，不得照搬没有该声明的源码。
v4数值条件按输入十进制文本的精确有理数计算和比较，不使用浮点容差；例如0.1+0.2等于0.3。每一步分子/分母各最多4096bits且绝对值≤1.7976931348623157e308；执行到除零或越界时报错，不能当作false。require仅when为真时求值，all/any短路；所有分支的结构、类型及引用仍先校验。单位语义没有被自动证明，只把原文明示的数值规则作为有界断言；无法确认的算术、单位换算或复杂平台规则继续保留文字，不补造机器约束。v1–v3仍不允许算术，不升级或改写旧合同。
首轮和后续所有参数方案必须满足 domain；默认值与声明冲突时报告问题，initial_proposal=null，不能偷偷修改默认值。引文存在仅表示可追溯，不证明AI语义提取正确。\n'''
