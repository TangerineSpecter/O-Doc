"""Bounded static check facts for new AI workflow contracts only."""
import json
from .structure import qualification


def context(factors):
    rows, size = [], 0
    for index, factor in enumerate(factors):
        value = qualification(factor)
        record = {'ref': f'factor:{index}', **{key: value[key] for key in ('version', 'candidate_hash', 'scope',
            'reuse_status', 'checks', 'configuration', 'inputs_requiring_mapping', 'automatic_experiment_ready', 'external_dependencies')}}
        length = len(json.dumps(record, ensure_ascii=False))
        if size + length > 22000: continue
        rows.append(record); size += length
    return {'version': 1, 'items': rows, 'omitted': len(factors) - len(rows)}


INSTRUCTION = ('portable_qualification 是本机对受控表达式的确定性声明引用/类型检查。'
    '它不证明模型翻译与原平台等价，也不证明数据时序语义、收益或最优参数。'
    '在研究评价中明确指出阻断项，区分原代码缺陷与本次提取表达式缺陷；不能用高均分掩盖。'
    '实验方案须服从配置和输入约束，automatic_experiment_ready=false 时说明需补齐的实际配置或映射；'
    '不能把未解析的原平台外部依赖写成已满足。省略条目保持未知，不外推成全部通过。')
