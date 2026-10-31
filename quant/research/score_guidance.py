"""Readable, source-based scoring guidance; retains the existing score contract."""
from copy import deepcopy


def context(value: dict) -> dict:
    """Keep original source/evidence; omit downstream execution and AI risk notes."""
    result = deepcopy(value)
    for key in ('source_structure', 'portable_qualification', 'factors_for_initial_plan', 'ai_definition_revisions'):
        result.pop(key, None)
    previous = result.get('previous', {})
    if 'parameters' in previous:
        previous['parameters'] = {'parameters': previous['parameters'].get('parameters', [])}
    if 'research' in previous:
        previous['research'] = {key: val for key, val in previous['research'].items()
                               if key in ('summary', 'principle', 'formula', 'usage')}
    if 'extract' in previous:
        previous['extract'] = {'factors': [{key: val for key, val in row.items()
            if key in ('name', 'role', 'category', 'summary', 'inputs', 'output', 'parameters', 'dependencies', 'evidence')}
            for row in previous['extract'].get('factors', [])]}
    return result

INSTRUCTION = '''
评分口径：评价所给原始源码的质量与复用便利性，按以下统一标准重新独立判断，不沿用前序分数。
逻辑清晰度：输入到输出的计算关系、分支、状态更新是否明确且一致。
实现质量：原源码的初始化、数值边界、状态维护、异常输入处理是否合理。
数据与时序可靠性：数据可得时点、历史索引、确认延迟、未来读取及历史信号是否会被改写。
参数可解释性：参数作用、单位、默认值、范围和相互影响是否能从代码解释。
复现与复用价值：原始算法的输入、依赖、初始化和输出是否完整，抽离复用有何具体成本。
每维0–5整数：5=该维静态表现完整清楚，未发现实质问题；4=存在一项具体轻微不足；
3=存在影响使用或复用的明确局限；2=存在显著问题；1=核心部分严重不足；0=该维核心设计明确失效。
只有材料不足以判断该维时才用null；完整源码的静态高分不要求先完成回测或原平台编译。
扣分必须对应原源码中的具体事实，说明触发条件和实际影响；没有具体问题不得为了保守而扣分。
不把未回测、未编译、未运行、缺少行情样本、缺少独立收益证据作为这些静态维度的扣分理由。
本机解析partial、算子不支持、Python翻译未验证、automatic_experiment_ready=false属于本系统验证状态，不能给原源码扣分。
作者尚未证明的预测效果单列验证情况，不扣计算逻辑清晰度；指标没有下单、持仓、止损不是缺陷。
当前未收盘K线变动、窗口预热和等待右侧K线确认是设计行为；先解释影响，只有具体误用未来数据、回填误导或未处理边界才按实际问题扣分。
以下正常设计不得扣分：本根计算使用本根已算出的中间量（顺序依赖不等于未来数据）；使用Pine内置函数的既定历史/na语义；实时指标未强制收盘；窗口预热；参数没有最大值或步长；未声明具体资产/周期；没有参数最优值或经验校准证据；固定常量未暴露为用户输入。
不得以“实际语义尚未运行确认”“可能有问题但无法确认”换一种说法扣分。若指出源码边界缺陷，必须给出源码支持的具体输入条件和明确后果；无法确定后果则放验证情况，不扣分。
按原平台正常提供的数据和声明允许的参数评价，不要求每个图表指标重复实现平台的数据清洗与内建函数文档。缺失值传播本身、未手写内置EMA初始化、未枚举input.source的平台选项，不能直接叫作边界防护不足。
核对数学判断再写问题：max(a,b)<k等价于a、b都小于k；正初值乘正的衰减系数不会在实数运算中变成零，若涉及下溢或参数使系数为零须说明具体条件；用首值启动递推是初始化方案，不与后续递推公式矛盾。所有权重为零后均匀分配是退化方案，不能仅因它不再区分对象就称为逻辑错误。
不同用途使用不同条件不是自相矛盾，例如Top身份识别用价格容差、触及检测用high/low穿越，两者不能仅因比较方式不同而扣分。
扣分说明只解释实际源码不足，不混入本系统提取范围、Python翻译状态、实验配置、解析状态。源码依据与验证情况也用自然中文，不输出portable_qualification、partial、automatic_experiment_ready等内部字段。
不要虚构缺陷、已运行结果或盈利能力。不要把同一条未验证状态重复写入五个维度。
每项reason用以下三个中文标签分行，每段一两句话，直接解释给使用者：
优点：具体做得好的地方。
问题与影响：实际问题、发生条件及后果；没有实质问题写“未发现实质问题”，不要凑缺点。
扣分说明：为何是这个分数；满分写“本维未扣分”；null写明缺少哪项材料导致无法判断。
reason中不写源码行号、长代码引文、英文作者宣传、内部字段或系统检查日志。
每项evidence分两段：
源码依据：简短定位到相关变量、函数或代码片段，支持上述判断。
验证情况：仅列与本维有关的运行核验状态或尚需检验的作者效果主张；明确未核验不等于缺陷，无需额外验证的静态事实直接说明。
这是说明格式，不新增输出字段；继续使用scores中的dimension、score、reason、evidence。
评分前逐项自检：本项扣分是否只是上面列出的正常行为或未验证状态？若是，删除该扣分理由，按剩余真实问题重新评分；不要将它改写成“说明不足”继续扣分。
示例：完整的EMA+滚动归一化指标，若源码清楚处理零分母且只用当前及历史数据，不能因未指定收盘、预热遵从平台、未给参数最优值而扣逻辑、时序、参数分。相反，分母确实可能为零且没有保护、历史输出用未来值填充，是可据源码说明的扣分事项。
'''
