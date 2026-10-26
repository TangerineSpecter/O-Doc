"""Immutable planning capability v1 shared by the three AI design entry points."""
import copy
from rest_framework.exceptions import ValidationError

CAPABILITIES = {'version': 1, 'method': 'bounded-temporal-planning-1',
    'walk_forward_versions': [1, 2], 'outer_folds': [2, 5], 'inner_folds': [2, 4],
    'modes': ['expanding', 'rolling'], 'minimum_intervals': {'train': 20, 'validation': 5, 'test': 5},
    'maximum_rows': 20000, 'maximum_attempts': 32, 'maximum_seconds': 60,
    'selection': 'inner_mean_train_pareto_then_mean_validation_return_minus_drawdown_v2',
    'scope': 'design_capability_not_market_data_execution_authority_or_validation'}


def contract() -> dict:
    return copy.deepcopy(CAPABILITIES)


def validate(value: dict) -> None:
    from quant.research.contracts import digest
    if digest(value) != digest(CAPABILITIES):
        raise ValidationError('实验规划能力版本或范围不一致')


def instruction(*, inherited: bool = False) -> str:
    text = '''\nplanning_capabilities是冻结的本机设计能力，不是行情、收益或执行授权。
需要比较多个参数组或探索新公式时，优先考虑多内层时序验证，并说明选择理由；不是强制每份材料都生成复杂实验。
完整配置示例：walk_forward:{version:2,mode:"expanding",folds:3,inner_folds:3,train_bars:40,validation_bars:10,test_bars:10,warmup_bars:0}。
v1保持单内层训练/验证；v2必须增加inner_folds整数2–4，外层folds整数2–5。mode只能expanding或rolling，内外层共用此训练模式。
各候选分别计算每个内层的训练和验证。训练收益/回撤/换手均值与复杂度做Pareto，随后按验证收益减回撤的均值选择；外层测试只在选择后评价，不挑测试最好的折。
内层窗口可共享历史，不是独立重复样本；各段空仓起止，均值不是连续组合收益，也不能据此承诺最优参数或统计显著性。
窗口单位是开盘到下一开盘的收益区间；训练至少20、验证/测试各至少5；gap为1–2000根，warmup_bars为0–2000根，结合最长窗口与完整计算链解释预热，不编造源码约束。
数据至少需要max(60,2+warmup_bars+train_bars+inner_folds*validation_bars+folds*test_bars+2*(gap+1))根且不超过20000，v1将inner_folds按1计算。
在data_requirement写明计算出的最低根数、标的/频率和口径，以及未知条件。未提供行情时只能提出数据要求，不能声称已有足够数据；元信息中的根数不是未见价格的验证证据。
候选总预算仍不超过32、时限不超过60秒，平分各外折，每折必须容纳全部原始父代+全部variants组+（启用evolution时1次预留）。不要把内层折数乘进候选预算，实际计算次数增加但所有窗口共享原时限。
预算或数据不够时减少可解释的候选/折数，或选择v1/单次固定分段并说明局限；没有合理可执行假设时方案null。不能自动扩大预算、猜测缺失输入或把显示/风控/执行参数当作信号窗口优化。
解读v2事实时，attempt.inner_evaluation.folds是逐内层结果，summary才是完整内层选择均值；顶层metrics只属于最后已启动内层。summary为null表示未完整计算，不能补造均值或参与选优。
参数敏感度和CSCV固定家族诊断仍只覆盖最后内层窗口，不能称所有内层都稳定；保留无效/失败/缺失与未执行的参数，后续假设须用未参与设计的新数据验证。\n'''
    if inherited:
        text += ('本入口的proposal沿用execution.config及既有预算，不增加config字段或擅自更换验证策略；'
            '如果继承的是v2则保留全部配置，无法满足下一份行情或剩余预算时proposal=null并解释。'
            '需要改变验证策略时在next_steps说明，可通过新的来源/反馈方案或显式调整准备，不能伪称本轮已更改。\n')
    else:
        text += '需要采用时将完整walk_forward放入方案config，解释设计和限制；系统只保存建议，后续按冻结方案核对数据与预算。\n'
    return text
