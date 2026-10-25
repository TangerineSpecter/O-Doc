"""One bounded repair call with exact source context supplied by the workflow."""
from .contracts import plan
from quant.verification.structure import qualification


def context(factors: list[dict]) -> dict:
    scope = plan(factors)
    return {**scope, 'targets': [{'factor_index': index, **{key: value for key, value in qualification(factors[index]).items()
        if key in ('checks', 'configuration', 'inputs_requiring_mapping', 'external_dependencies')}} for index in scope['selected']]}


INSTRUCTION = '''
本阶段只修订 repair_scope.selected 中的候选（最多4项），每项都返回结果；omitted 本次不处理。
仅返回 {items:[{factor_index,status:"revised"或"unresolved",summary,definition:完整定义或null,
evidence:[{field:"code"/"description"/"web_markdown",quote:逐字原文}],remaining_unknowns:[字符串]}]}。
每项 evidence 最多5段，每段 quote 最多6000字符；只选支持本次结论的必要原文，不把每个相关参数都拆成一段。
remaining_unknowns 最多8项，每项最多1000字符；summary 为1–3000字符。revised 至少1段依据，unresolved 可为空，但已有引文仍须逐字属于 source 对应原始字段。
definition 包含原候选除 evidence 之外的全部字段，采用原提取阶段相同的受控算子与参数合同；不能携带来源身份、评分、实验结论或谱系。
算子只支持 input/parameter/constant、abs/neg/log、add/sub/mul/div/min/max/gt/lt/eq/and/or/gate，及 lag/sma/sum/std/highest/lowest/ts_rank。窗口为第二项正整数常量或明确整数参数；字符串只能同类 eq，gate 第二项为布尔。最多128节点、深度12，不支持任意函数调用。
结合原文解决提取定义中的缺失计算、未声明引用、类型、窗口及默认值问题。能从所给源码明确展开的 helper 可内联；缺少模块正文、行情、参数或算子语义时用 unresolved，说明还缺什么，不能猜测或下载依赖。
revised 必须有真正的定义变化、至少1段逐字原文依据并通过结构检查。不得删除依赖或改名来掩盖未知语义；保留输入时点、单位、缺失规则和参数约束，无法核实时写入 remaining_unknowns。
新定义是 AI 修订假设，不是修复了原平台源码；声明默认值只能依据原材料，不得编造替代值。不得为了通过检查把 RSI/EMA 或外部函数换成不等价的简单平均。
不运行源码、不安装库、不声称编译、平台等价、回测、独立验证或盈利成立。无法解决不阻止发布原候选及缺失原因。
'''
