"""Versioned candidate extraction contract; quotes must occur in the bound source."""
from rest_framework import serializers
from .expression import validate_expression

ROLES = ('factor', 'signal', 'filter', 'risk', 'execution', 'display')
FAMILIES = ('momentum', 'trend', 'volatility', 'mean_reversion', 'volume', 'price_structure', 'fundamental', 'other')


class Input(serializers.Serializer):
    name = serializers.RegexField(r'^[A-Za-z_][A-Za-z0-9_]{0,79}$')
    meaning = serializers.CharField(max_length=1000)
    availability = serializers.CharField(max_length=1000)
    missing_policy = serializers.CharField(max_length=1000)


class Evidence(serializers.Serializer):
    field = serializers.ChoiceField(choices=['code', 'description', 'web_markdown'])
    quote = serializers.CharField(max_length=6000, trim_whitespace=False)


class Candidate(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    role = serializers.ChoiceField(choices=ROLES)
    family = serializers.ChoiceField(choices=FAMILIES)
    summary = serializers.CharField(max_length=3000)
    formula = serializers.CharField(max_length=6000)
    inputs = Input(many=True, min_length=1, max_length=20)
    output_type = serializers.ChoiceField(choices=['numeric_series', 'boolean_series', 'scalar', 'platform_specific'])
    units = serializers.CharField(max_length=300)
    timeframe = serializers.CharField(max_length=1000)
    # Bound at validation time to avoid analysis <-> extraction import cycles.
    parameters = serializers.ListField(child=serializers.DictField(), max_length=30)
    dependencies = serializers.ListField(child=serializers.CharField(max_length=1000), max_length=20)
    limitations = serializers.CharField(max_length=3000)
    tags = serializers.ListField(child=serializers.CharField(max_length=50), max_length=20)
    expression = serializers.JSONField(allow_null=True)
    evidence = Evidence(many=True, min_length=1, max_length=10)

    def validate(self, value):
        from quant.research.analysis import Parameter
        serializer = Parameter(data=value['parameters'], many=True)
        serializer.is_valid(raise_exception=True)
        value['parameters'] = list(serializer.validated_data)
        from quant.parameters.domains import validate_contract
        validate_contract(value['parameters'])
        for field in ('inputs', 'parameters'):
            names = [item['name'] for item in value[field]]
            if len(set(names)) != len(names):
                raise serializers.ValidationError('输入和参数的名称不得重复')
        if value['expression'] is not None:
            validate_expression(value['expression'], {v['name'] for v in value['inputs']}, {v['name'] for v in value['parameters']})
        return value


def validate_extraction(value: dict) -> dict:
    if type(value.get('extraction_version')) is not int or value['extraction_version'] != 1:
        raise serializers.ValidationError('因子提取格式版本无效')
    serializer = Candidate(data=value.get('factors'), many=True, max_length=20)
    serializer.is_valid(raise_exception=True)
    note = value.get('extraction_note')
    if not isinstance(note, str) or not note.strip() or len(note) > 3000:
        raise serializers.ValidationError('需要说明提取范围或未提取到因子的原因')
    return {'extraction_version': 1, 'extraction_note': note, 'factors': list(serializer.validated_data)}


def validate_evidence(factors: list[dict], source: dict) -> None:
    for factor in factors:
        for evidence in factor['evidence']:
            if not evidence['quote'].strip() or evidence['quote'] not in source.get(evidence['field'], ''):
                raise serializers.ValidationError('因子出处引文必须逐字存在于对应来源快照')


def extraction_prompt() -> str:
    return '''\n同时提取值得独立研究的候选，新增 extraction_version:1、extraction_note:提取范围与边界、factors:数组（最多20项）。
没有可靠可分离模块时 factors=[] 并解释原因，不为凑数编造因子。优先提取独立计算、条件、过滤模块，区分 role=factor/signal/filter/risk/execution/display，不能都称为收益因子。
role 按模块实际用途判断，不按输出是否画在图上判断。可独立复用的数值变换（例如均线偏离、平滑后的特征）可为 factor，即使同时作为指标曲线输出；factor 只表示待研究特征，不保证预测或收益。display 用于纯显示开关、样式或显示门控，不把所有指标曲线都排除在可研究特征之外；无需为同一变换重复建立显示候选。
每项字段：name, role, family(momentum/trend/volatility/mean_reversion/volume/price_structure/fundamental/other), summary, formula,
inputs:[{name:英文变量名,meaning,availability:数据何时可得,missing_policy:缺失处理未知要说明}],
inputs 必须有1–20项，仅列有原文依据的数据或运行上下文。黑箱平台函数的完整数据输入未知时，可记录原文实际引用的品种/周期/平台上下文并明确未知，不捏造 close 等行情列；若连这类输入也无法确认，则不要创建无输入候选，保留未提取原因。
output_type(numeric_series/boolean_series/scalar/platform_specific), units, timeframe(计算窗口与适用周期，未知明确说明),
parameters(与报告parameters完全相同的字段结构，只列该候选相关参数), dependencies:字符串数组,
limitations, tags:字符串数组, evidence:[{field:code/description/web_markdown,quote:来自该字段的逐字原文，不能用行号代替}], expression。
文字字段除参数 default_value 外不能为空，不适用时明确说明原因。name≤200、summary/limitations≤3000、formula≤6000、units≤300、timeframe≤1000字符；输入的 name≤80且是英文标识符，其余输入文字≤1000字符。parameters≤30项；dependencies≤20项且各≤1000字符；tags≤20项且各≤50字符；evidence 为1–10段且每段 quote≤6000字符。
expression 仅在明确能描述时提供声明式JSON，否则 null 并在 limitations 解释平台依赖或缺失语义。
逐项检查 expression 的全部叶子：每个 input.name 都须出现在本项 inputs，每个 parameter.name 都须出现在本项 parameters。
展开中间变量时须同时展开它的原始输入：例如表达式内联 sma(close,N) 就必须声明 close，不能只声明 b；若只声明 b，表达式只能引用 input b，并说明 b 的来源依赖。无法确认依赖时保留候选，expression=null，不编造可执行定义。
表达式节点仅支持 {op:"input",name}, {op:"parameter",name}, {op:"constant",value:有限数值或最多200字符的字符串}, 或 {op,args:节点数组}。
一元算子 abs/neg/log；二元 add/sub/mul/div/min/max/gt/lt/eq/and/or；窗口算子 lag/sma/sum/std/highest/lowest/ts_rank 的第二项为正整数常量或声明参数。ts_rank 是当前值在完整历史窗口内的中点秩（小于当前的个数 + 0.5×等于当前的个数）/窗口长度，不是截面排名。gate(value,condition) 的第二项必须为布尔条件；为真保留第一项，否则缺失，不能用0冒充停用。只在可保持原文语义时采用。
字符串只允许同类型 eq 比较，不可直接输出、参与算术或窗口；字符串参数必须声明带源码证据的 domain v3 枚举，default_value 保存 JSON 字符串（包括双引号）。输入/参数必须在同项声明，不支持函数调用、脚本执行、未来索引或任意算子。表达式最多128节点、深度12。
不要把 RSI/EMA 等本词汇未定义的函数冒充已支持算子，也不要为跨平台语义未知的函数编造等价公式。候选未经实测，不能声明有效、最优、编译通过或已验证。
'''
