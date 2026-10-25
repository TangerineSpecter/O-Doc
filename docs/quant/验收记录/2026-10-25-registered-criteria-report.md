# BTCUSDT 1h 双窗口均值偏离：五月固定验证与参数稳定性复核

固定验证的冻结双窗口公式（a_p0=14、b_p0=60）在2024-05实现正收益5.93%，最大回撤7.87%，但相对买入持有超额为-5.12个百分点，未通过预登记的全部标准；因此不能视为有效或优于基线。原实验的单窗口与双窗口参数邻域均未形成受支持稳定区段，联合网格仍缺(20,30)。历史证据混杂：2024-03部分验证正收益但训练多为负，2024-02 period=30固定验证大幅落后买入持有，另有period=30固定验证取消无结果。结论仅值得低优先级、在新独立数据上做否证性复核，不值得据此晋级。

本报告解释本机受控模拟，不代表原平台等价、独立样本外验证或实盘盈利能力。

研究优先级：降低优先级

## 实验研究评价

研究评价总分：32 / 100

### 参数稳定性 · 1

单窗口四点和双窗口部分网格均未形成受支持区段，联合网格不完整；只能给出低评价。

parameter_sensitivity 显示 period=12/14/18/24 全部训练和验证收益为负且无区段；parameter_joint_sensitivity 显示双窗口仅三点且无区段。

证据：parameter_sensitivity、parameter_joint_sensitivity、attempt-1、attempt-3、attempt-4、attempt-5、attempt-2、attempt-6、attempt-7、fixed_validation

### 验证表现 · 2

固定验证绝对收益为正且回撤低于上限，但相对买入持有为负并导致预登记标准不通过，表现证据不支持晋级。

fixed_validation 收益0.0592878、回撤0.0786891，买入持有0.1104720，超额-0.0511842。

证据：fixed_validation、attempt-2

### 风险与成本 · 2

已计入双边费用与滑点并报告换手，但平台语义、流动性和成本分解未知，风险证据有限。

执行固定 fee_bps=5、slippage_bps=5，固定验证换手50；未模拟流动性与成交量约束。

证据：fixed_validation、execution、attempt-2

### 证据充分度 · 1

仅一个冻结公式、一个新评价区间，独立验证为false，且历史与选择偏差限制明显。

fixed_validation 标注 independent_validation=false、external_prior_use=unattested；本次选择前已有16候选训练/验证比较。

证据：fixed_validation、reuse、execution

### 复现价值 · 2

公式简单、参数冻结、标准预登记，适合做否证性复核；但当前结果不支持正向推广。

可复现的固定参数与预登记标准存在，但固定验证未达超额收益标准，参数区段为空。

证据：fixed_validation、execution、attempt-2

## 登记标准与限定验证资格

未满足本次登记标准

逐项核对 fixed_validation：min_total_return 观测0.0592878≥0，met；max_drawdown 观测0.0786891≤0.2，met；min_excess_return 观测-0.0511842<0，not_met；min_signal_coverage 观测1.0≥1.0，met；min_entries 观测25≥1，met。因 criteria.logic=all，总体 status=not_met，eligibility=criteria_not_met。数据资格限制：imported_after_registration=true 且审计无已知冲突，但 independent_validation=false、external_prior_use=unattested，且 scope 仅限登记配方、参数和区间；不能据此证明原平台等价、全局独立验证、盈利能力或参数最优。

限定资格：criteria_not_met

证据：fixed_validation

满足数值阈值不等于原平台等价、全局独立验证或盈利保证；未登记的标准不能事后补作通过依据。

## 结果解读

事实：fixed_validation 使用冻结双窗口公式，实际参数 a_p0=14、b_p0=60，2024-05-01至2024-05-31共743根bar，收益0.0592878，最大回撤0.0786891，交易25次，换手50，信号覆盖1.0；同期买入持有收益0.1104720，超额收益-0.0511842。

证据：fixed_validation、attempt-2

事实：预登记标准中 min_total_return、max_drawdown、min_signal_coverage、min_entries 均达标，但 min_excess_return 要求≥0而实际为-0.0511842，因 logic=all，整体 status=not_met、eligibility=criteria_not_met。

证据：fixed_validation

事实：单窗口 period 轴有 period=12、14、18、24 四个同来源可比较点，训练和验证收益全部为负，parameter_sensitivity 的 regions 为空、status=no_supported_region；推断：该轴在本批数据上没有可称为稳定推荐区段的证据。

证据：parameter_sensitivity、attempt-1、attempt-3、attempt-4、attempt-5

事实：双窗口联合敏感度仅有 (14,30)、(14,60)、(20,60) 三个点，(20,30)缺失，status=incomplete_grid 且 regions 为空；b_p0从60降到30使验证收益从-0.0132751降至-0.0484722，a_p0从14升到20仅使验证收益小幅变化但训练变差。

证据：parameter_joint_sensitivity、attempt-2、attempt-6、attempt-7

事实：原实验共16个候选，按 train_pareto_then_validation_return_minus_drawdown_v1 选中 attempt-2，frontier 含 attempt-2、attempt-13、attempt-16、attempt-3、attempt-1、attempt-5、attempt-7；推断：后续固定验证与留出评价是在同一批选择之后观察，存在选择偏差，不能当作无偏样本外证明。

证据：execution、attempt-2、holdout

事实：2024-04留出段 attempt-2 收益-0.0348023，买入持有-0.0561797；这只是历史留出记录，且固定验证在2024-05又显示相对买入持有为负，说明不同区间方向不一致。

证据：holdout、baseline、attempt-2

事实：历史2024-03实验在验证段出现多组正收益，但训练段多为负，且窗口设置与当前固定14/60并不相同；推断：只能提示区间/窗口依赖，不能直接支持当前公式参数稳定。

证据：memory:experiment:3bcade44045d30027fe12365b9a4e61a081cba72

事实：历史2024-02 period=30固定验证收益0.1395833，买入持有0.4349843，明显落后；另一份period=30固定验证在计算前取消，error记录为固定验证在计算前停止。

证据：memory:fixed_validation:db8395139fd6602f97e1c426248d0dc38ce79d07、memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575

事实：fixed_validation 标注 imported_after_registration=true、authorization_audit 与 publication_audit 无已知冲突，但 independent_validation=false、external_prior_use=unattested；推断：登记后导入不等于全局独立，外部历史使用仍未知。

证据：fixed_validation、reuse

事实：执行使用 fee_bps=5、slippage_bps=5，固定验证25次交易、换手50；未模拟流动性、成交量约束、停牌、融资等，净值按开盘区间采样。

证据：fixed_validation、execution

## 参数研究

固定验证实际参数 a_p0=14、b_p0=60 与来源声明默认值一致；这是被冻结复现的实际配置，不是参数最优或调优结果。

证据：fixed_validation、seed:6c07f295a922f4ceaaa07f630201d478f68a7cf8、attempt-2

单窗口来源默认 period=14，实际尝试 period=12、14、18、24；四点在训练与验证均未同时转正，且 period=24 验证收益较基线下降超过2个百分点，parameter_sensitivity 无受支持区段。

证据：parameter_sensitivity、attempt-1、attempt-3、attempt-4、attempt-5、seed:8ad1fb3c214f382be9696ef1c10849a8be940581

双窗口仅比较 a_p0=14/20 与 b_p0=30/60 的部分组合；b_p0=30 的点在训练和验证均较基线恶化，a_p0=20 的点验证略好但训练更差且训练信号缺失59根，联合网格不完整，不能归因于单参数或推断缺失点。

证据：parameter_joint_sensitivity、attempt-2、attempt-6、attempt-7

尝试记录中所有 attempt-1至attempt-16 均为 evaluated，没有失败 status；但 excluded_combination_ids 与 excluded_variants 表明多种组合未纳入参数区段判断，缺失组合不能当作不存在。

证据：parameter_sensitivity、parameter_joint_sensitivity、execution

实际参数与源码默认值的差别主要是变量命名和衍生组合：单窗口 p0 映射 period；双窗口 a_p0、b_p0 分别映射两个窗口。默认值只用于复现，不能冒充运行配置或最优参数。

证据：seed:8ad1fb3c214f382be9696ef1c10849a8be940581、seed:6c07f295a922f4ceaaa07f630201d478f68a7cf8、attempt-2

## 风险与限制

固定验证虽为预登记冻结方案，但只有单公式、单区间、单市场；不能证明参数稳定、全局最优、原平台等价或样本外持续有效。

证据：fixed_validation、execution

相对买入持有的超额收益为负且未达预登记标准，是最直接的反向证据；正绝对收益不能掩盖未跑赢基线。

证据：fixed_validation、attempt-2

原实验16候选经过训练/验证选择，留出与固定验证都在选择后观察；存在选择偏差与区间依赖，跨批独立性未被证明。

证据：execution、holdout、reuse

参数邻域没有受支持区段，双窗口联合网格缺(20,30)，因此不能推荐最佳窗口或连续区间；只可在新数据补齐离散网格。

证据：parameter_sensitivity、parameter_joint_sensitivity

历史固定验证显示 period=30 在2024-02明显落后买入持有，另一个 period=30 固定验证取消无收益事实；历史混合结果不支撑正向外推。

证据：memory:fixed_validation:db8395139fd6602f97e1c426248d0dc38ce79d07、memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575

费用按单侧5bps及滑点5bps建模，换手50，但未模拟流动性、成交量约束、停牌、融资与公司行动；成本分解未给出，不能估算净成本贡献。

证据：execution、fixed_validation

外部历史数据使用未证明，登记后导入不证明从未被外部查看；本结论只能视为开发线索，需新独立数据验证。

证据：fixed_validation、reuse

## 下一轮待验证假设

假设：在未使用过的新区间，冻结双窗口14/60相对买入持有的超额收益仍不为正，或无法同时满足预登记回撤、覆盖率和交易次数标准。

证据：fixed_validation、attempt-2、execution

检验：用固定参数14/60在新独立数据上按同一费用、滑点和成交语义评价，并报告超额收益与全部预登记规则。

否证条件：若新区间超额收益≥0且回撤、覆盖率、交易次数全部达标，则否证该负向假设。

新数据要求：预登记的新BTCUSDT 1h区间（如2024-06起）或其他未使用市场；不得复用2024-02、03、04、05已查看数据。

假设：双窗口2x2网格在新区间仍无稳定区段，缺失的(20,30)不会同时改善训练与验证并保持覆盖率。

证据：parameter_joint_sensitivity、attempt-2、attempt-6、attempt-7、fixed_validation

检验：在新数据补齐 a_p0∈{14,20}、b_p0∈{30,60} 的完整2x2网格，保持其他参数与费用不变，比较各点与基线14/60。

否证条件：若(20,30)或任一网格点在训练和验证均满足正收益、覆盖率、相对基线及离散极差规则，则否证无稳定区段假设。

新数据要求：新的独立行情区间，且网格在评价前冻结；不得把本次2024-05固定验证或历史已看区间当作独立确认。

## 仍未知

- 外部使用与未同步设备上的历史数据使用未知。
- 原平台源码等价性、pandas rolling 的 min_periods 语义与本地 sma 是否一致未知。
- 2024-05固定验证是否在导入前已被外部查看未知。
- 双窗口(20,30)及完整2x2网格在独立新数据上的表现未知。
- 其他市场、其他周期、不同流动性与成本条件下的稳健性未知。
- 历史检索有 omitted_for_size=1，未提供的记录不能视为不存在失败或反例。

后续假设尚未执行；已查看留出结果，下一轮需要新的独立验证数据。

## 下一轮可执行方案

选择父代 seed:6c07f295a922f4ceaaa07f630201d478f68a7cf8，因为本次固定验证使用的正是该双窗口公式的14/60参数，且 parameter_joint_sensitivity 显示2x2网格缺(20,30)且无受支持区域。方案在新独立数据上继承基线14/60，只改动参与公式的 a_p0、b_p0，补测14/30、20/60、20/30三个非基线参数组，用于否证与补齐离散网格，不宣称最优。1个父代加3个参数组共4个候选，低于max_candidates=16，保留组合尝试空间。library_retrieval 本次无候选，故不引入库候选；已查看的2024-05固定验证不能继续作为新独立验证。

新独立数据上的双窗口均值偏离2x2网格复核

在未使用过的新区间，冻结双窗口14/60相对买入持有仍难获得正超额，且完整2x2网格没有同时满足正收益、覆盖率、相对基线与离散极差规则的稳定区段；若(20,30)在训练和验证均改善，则当前不稳定性判断被削弱。

否证条件：若新区间基线14/60或任一网格点在训练和验证均满足预登记正收益、回撤、覆盖率、交易次数及相对基线标准，且(20,30)不是孤立异常，则否证“无稳定区段”的假设。

数据要求：预先登记且未在本次及历史中使用的BTCUSDT 1h新区间（例如2024-06之后），或其他未使用市场；不得复用2024-02至2024-05已查看数据，外部历史使用仍需核实。

参数类型和窗口边界已检查；其他源码约束仍需核对。

父代：6c07f295a922f4ceaaa07f630201d478f68a7cf8

候选参数组：[[{"name": "a_p0", "value": 14}, {"name": "b_p0", "value": 30}], [{"name": "a_p0", "value": 20}, {"name": "b_p0", "value": 60}], [{"name": "a_p0", "value": 20}, {"name": "b_p0", "value": 30}]]
