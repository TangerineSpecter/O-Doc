# BTCUSDT 1h 收盘相对滚动均值偏离：period=30 冻结复核与参数轴证据评估

本轮以 fixed_validation 为主证据：冻结 period=30 的 close/滚动均值偏离公式在 2024-02 整月（695 bar、41 次进出、无缺失信号）录得总收益 0.1396、最大回撤 0.1112，绝对收益为正，但同记录买入持有基线为 0.4350、回撤 0.0426，即收益远低于基线且回撤约为 2.6 倍。同一公式在 2024-01 训练/验证段全部为负（如 period=30 训练 -0.1219、验证 -0.0402），单轴 6 个 period 取值无一通过固定规则，regions 为空；联合敏感性只有一维，未构成二维网格。历史冻结评价记录为 cancelled 且审计显示区间被复用，不能作为未见样本外证据。结论：该机制在本批数据未显示可迁移优势，不值得扩大参数搜索；仅保留一次以新数据为主的否证性对照复核。

本报告解释本机受控模拟，不代表原平台等价、独立样本外验证或实盘盈利能力。

研究优先级：降低优先级

## 实验研究评价

研究评价总分：28 / 100

### 参数稳定性 · 1

同轴 6 个可比较点（含实际基线 period=14）全部不满足规则，regions 为空；训练最优与验证最优不一致，联合敏感性仅一维无网格。仅支持“不稳定”这一结论，不支持任何推荐区间。

period 轴训练收益 -0.1288/-0.0987/-0.0794/-0.1424/-0.1219/-0.1476，验证 -0.0371/-0.0322/-0.0462/-0.0234/-0.0402/-0.0382，全部 eligible=false，status=no_supported_region

证据：parameter_sensitivity、parameter_joint_sensitivity、attempt-1、attempt-2、attempt-4、attempt-6

### 验证表现 · 1

2024-01 验证段全部为负（-0.0234 至 -0.0462）；2024-02 冻结评价 +0.1396 但同记录基线 +0.4350 且回撤 0.1112 对 0.0426；留出 +0.0216 对基线 +0.0686。有依据但整体弱于被动持有，且方向在不同区间反转。

fixed_validation: final 0.1396/回撤 0.1112/entries 41，baseline 0.4350/回撤 0.0426；attempt-5 验证 -0.0402；holdout 0.0216 对 baseline 0.0686

证据：fixed_validation、attempt-5、holdout、baseline

### 风险与成本 · 1

回撤约为基线 2.6 倍，换手与进出次数高（2 月 turnover 82、41 次；训练短窗 turnover 128 且回撤 0.1817），费用固定 5+5bps 但无敏感性对照，成本可控性未被证明。

fixed_validation 的 max_drawdown 0.1112 对 baseline 0.0426、turnover 82；attempt-2 训练 turnover 128、max_drawdown 0.1817；execution 费用 5bps+5bps

证据：fixed_validation、attempt-2、execution

### 证据充分度 · 2

有 6 个同轴点、一次冻结新区间评价与一条历史记录，但仅单标的、两个月度区间，历史条目 cancelled，审计未证明独立，且无二维网格。证据足以否定“稳健有效”，不足以支持任何正面结论。

parameter_sensitivity 6 点无区段；fixed_validation 单区间单公式；memory 条目 status=cancelled、range_status=reused；reuse total=0 且 independent_holdout_proven=false

证据：execution、fixed_validation、reuse、memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575

### 复现价值 · 2

公式极简、输入单一、参数只有一个整数，作为否证性对照和成本/暴露分解的基线容易复现；但经济表现未优于被动持有，复现价值主要是排除而非推广。

seed 公式 close/sma(close,period)-1，单参数、单输入；fixed_validation 收益低于基线且回撤更高

证据：seed:8ad1fb3c214f382be9696ef1c10849a8be940581、fixed_validation

## 结果解读

事实：fixed_validation 中冻结公式（p0=30）在 2024-02-01 至 2024-02-29 共 695 根 bar 上取得 total_return 0.1396、max_drawdown 0.1112、entries 41、turnover 82、exposure_fraction 0.6317、missing_signals 0；同记录 baseline（买入持有）total_return 0.4350、max_drawdown 0.0426、entries 1、exposure 1.0。推断：该信号在该月为正收益，但收益低于基线约 0.30、回撤约为基线 2.6 倍，属于“收益正但相对与风险都更差”的一次固定评价。

证据：fixed_validation

事实：同一公式在 2024-01 训练段为 -0.1219、验证段为 -0.0402（period=30）；而 2024-02 冻结评价为 +0.1396。推断：结果对评价区间高度敏感，1 月与 2 月方向相反，不能据 2 月的正收益推断参数稳健或机制有效。

证据：attempt-5、fixed_validation

事实：parameter_sensitivity 中 period 轴 6 个抽样点（5/10/14/20/30/60）全部 eligible=false，训练与验证收益均为负，regions 为空，status=no_supported_region。训练段最优为 period=14（-0.0794）、最差为 period=60（-0.1476）；验证段最优为 period=20（-0.0234）、最差为 period=14（-0.0462）。推断：训练与验证的排序相互冲突，没有任何取值同时满足正收益与容差要求，无受支持参数区段。

证据：parameter_sensitivity、attempt-1、attempt-4、attempt-6

事实：parameter_joint_sensitivity 的该 seed 只有一个 context、一条数值轴（period），minimum_dimensions=2 未满足，comparison_cells 与 regions 均为空，status=incomplete_grid。推断：本轮没有任何双参数完整笛卡尔网格，无法评价参数联合稳定性，也不存在可推荐的采样组合。

证据：parameter_joint_sensitivity

事实：attempt-7/8/9 是双窗口均值组合（参数 a_p0/b_p0 分别为 14/60、14/30、30/60），被列入 excluded_combination_ids，未参与参数敏感度比较；其验证收益分别 -0.0580、-0.0379、-0.0678。推断：这是三个不同公式的并列结果，不构成参数敏感度证据，也不能把组合结果拆回各单窗口因子的独立收益。

证据：attempt-7、attempt-8、attempt-9、parameter_joint_sensitivity

事实：本批留出（2024-01-25 至 2024-01-31）中按训练/验证规则选中的 attempt-5 得 total_return 0.0216、max_drawdown 0.0297；同区间 baseline 为 0.0686、回撤 0.0282。留出是在本批选择完成后才计算，reuse 显示 total=0、independent_holdout_proven=false。推断：该留出只对本批选择成立，跨批独立性未被证明，也不支持“优于买入持有”。

证据：holdout、baseline、execution

事实：历史 memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575 与本次 fixed_validation 指向同一冻结计划（attempt-5、2024-02 区间），该历史 status=cancelled、error 为“固定验证在计算前停止”，授权审计 conflict_count=1、range_status=reused、global_independent_validation=false；本次 fixed_validation 的登记后审计为 conflict_count=0、range_status=no_tracked_conflict，但 external_prior_use=unattested、global_independent_validation=false。推断：两处审计结论不一致，且历史侧已记录同区间被复用，因此该 2024-02 结果不能称为当前公式的未见样本外证据。

证据：memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575、fixed_validation、reuse

事实：源码默认 period=14，本轮实际运行覆盖 5/10/14/20/30/60，冻结验证使用 p0=30。推断：14 只是源码默认值，30 只是当时被选中的变体值，二者都不是最优或推荐运行参数；引用实际参数必须以 attempt 记录为准。

证据：seed:8ad1fb3c214f382be9696ef1c10849a8be940581、execution、attempt-5

## 参数研究

实际参数与默认值的差别：源码声明默认 period=14，本轮 attempt-1 以 14 实际运行，attempt-2/3/4/5/6 分别以 5/10/20/30/60 运行，fixed_validation 冻结的是 p0=30。默认值未被验证为更优；实际运行值域仅覆盖 5–60 的 6 个离散点，源码未声明取值范围与步长，超出该范围的值完全未测。

证据：seed:8ad1fb3c214f382be9696ef1c10849a8be940581、execution、attempt-1、attempt-5

同轴邻域比较（同来源、同表达式、同行情、同费用）：训练收益 -0.1288(5)/-0.0987(10)/-0.0794(14)/-0.1424(20)/-0.1219(30)/-0.1476(60)；验证收益 -0.0371/-0.0322/-0.0462/-0.0234/-0.0402/-0.0382；回撤训练 0.1817/0.1600/0.1401/0.1835/0.1402/0.1572。所有点收益为负，训练最优(14)与验证最优(20)不一致，验证收益极差 0.0228 已超出规则容差 0.02。结论是参数稳定性无支持证据，而非已找到稳定值。

证据：parameter_sensitivity、attempt-2、attempt-3、attempt-4、attempt-5、attempt-6

信号覆盖与失败边界：训练段 missing_signals 随窗口增大而增加（period=5 为 4/444，period=30 为 29/444，period=60 为 59/444 并因此被标注“训练段信号覆盖不足 90%”）；验证段全部为 0 缺失。预热未统一重算，跨取值比较存在结构性不对称，不能把缺失差异归因于经济含义。

证据：parameter_sensitivity、attempt-6

多参数情况：组合尝试 a_p0/b_p0 = 14/60、14/30、30/60 已被排除在参数敏感度之外，联合敏感性又仅有单一数值轴，因此没有任何双参数网格基线可对照，双参数稳定性保持未知而非“稳定”。

证据：parameter_joint_sensitivity、attempt-7、attempt-8、attempt-9

## 风险与限制

过拟合与事后选择风险：2024-01 与 2024-02 均已查看，其中 2 月为正收益、1 月为负，若据 2 月挑选 period=30 即为在已见数据上择优；一次固定参数评价不证明参数最优或稳定。

证据：fixed_validation、parameter_sensitivity、attempt-5

成本与换手风险：费用固定为单侧 5bps 手续费加 5bps 滑点；2 月 turnover 82、entries 41，训练段短窗口 period=5 的 turnover 达 128 且回撤 0.1817。本轮没有费用敏感性对照，无法区分收益来自信号还是成本容忍度，也不能排除换手进一步上升时结果转负。

证据：execution、attempt-2、fixed_validation

平台语义风险：候选以 sma(close, period) 表达 pandas .rolling(period).mean()，min_periods 默认行为与预热缺失处理未声明、未验证；源码未声明数据频率与复权口径，close 为 0 或缺失时的 inf/NaN 行为未知，结果不等价于原平台实现。

证据：seed:8ad1fb3c214f382be9696ef1c10849a8be940581、execution

数据重用与独立性风险：历史冻结评价的授权审计为 conflict_count=1、range_status=reused，本次登记后审计虽无跟踪冲突但 external_prior_use=unattested、global_independent_validation=false；登记后导入不证明该行情未被外部查看或选择，故不得称为全局独立验证。

证据：memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575、reuse、fixed_validation

样本代表性风险：仅有 BTCUSDT 1h、2024-01 与 2024-02 两个区间，且 2 月买入持有基线为 0.4350、1 月该信号全负，区间差异远大于参数间差异；不能外推到其他月份、周期或标的。

证据：dataset、fixed_validation、parameter_sensitivity

## 下一轮待验证假设

假设 H1：单窗口偏离度信号的表现对 period 无可迁移的单调或稳定关系；若存在，其方向应在新的未使用区间上复现。

证据：parameter_sensitivity、attempt-5、fixed_validation

检验：在 2024-03 起的未使用 1h 数据上，按同一表达式、同一费用（5+5bps）、同一阈值与成交语义，评价 period=7/12/18/24，并与本轮已记录的 5/10/14/20/30/60 一并比较训练段与验证段的收益、回撤排序。

否证条件：若新数据上各 period 的收益/回撤排序与 2024-01 记录在同号方向上一致（例如长窗 consistently 更低回撤且收益不低于短窗），且可由换手机制解释，则 H1 被否证。

新数据要求：2024-03 起未在私密文集出现、注册后导入并经重用审计无冲突的 BTCUSDT 1h 行情；不得复用 2024-01/02 或已查看留出。

假设 H2：双窗口均值组合的价值在于降低换手与回撤，而不是提高收益；该作用应相对其较短窗口父代可观察。

证据：attempt-7、attempt-8、attempt-9、parameter_joint_sensitivity

检验：在同一新数据上评价 (a_p0,b_p0)=(10,30) 与 (20,60)，与单窗口对应父代在同费用下比较 turnover、entries、max_drawdown；只做组合与单因子并列对照，不据组合结果回推单因子收益。

否证条件：若组合的 turnover 不低于其较短窗父代，或 max_drawdown 高于其较长窗父代，则“双窗口平滑降低换手与回撤”的假设被否证。

新数据要求：与 H1 相同的新行情区间；需保证组合与单因子使用同一区间、同一预热与同一成交假设。

假设 H3：该信号在上涨区间跑输买入持有主要源于暴露不足（2 月 exposure 0.6317 对基线 1.0），而非持仓期内选时错误。

证据：fixed_validation、baseline

检验：在新数据上按逐笔持仓区间拆分收益，比较“相同暴露比例下的信号收益”与“同比例持有基线收益”，并记录空仓期间的标的价格变动。

否证条件：若在暴露比例对齐后信号收益仍明显低于基线，则暴露不足解释被否证，需转向选时错误假设。

新数据要求：新数据区间，以及能够输出逐笔持仓区间收益的诊断记录；若引擎不支持该诊断，则本条降为待实现事项，不得用现有汇总指标替代。

## 仍未知

- 原平台源码等价性未验证；表达式引擎语义与 pandas rolling 是否一致未知
- min_periods 与前 period-1 根 bar 的缺失结果未验证
- period 在 60 以上或 5 以下的行为完全未测试
- 无费用与滑点敏感性对照，成本弹性未知
- 无任何二维及以上完整参数网格，联合稳定性未知
- 连续区间、跨月、跨市场与跨周期有效性未知
- 只做多/空仓，无空头与仓位规模维度，无法判断跑输基线是暴露不足还是选时错误
- 跨批留出独立性未被证明，2024-03 及以后数据完全未测

后续假设尚未执行；已查看留出结果，下一轮需要新的独立验证数据。

## 下一轮可执行方案

选择依据：本轮主证据是 fixed_validation 对单个冻结公式（p0=30）在 2024-02 的固定评价，其收益 0.1396 低于同记录基线 0.4350、回撤 0.1112 高于 0.0426；同轴 6 点全部不通过且无区段，联合敏感性仅一维。因此不扩大参数搜索，也不宣称任何最优值。计划采用两个已提供父代做一次低成本、可否证的对照：原始 seed（period 轴）用 7/12/18/24 填补 5–30 之间的未测邻域；双窗口均值父代用 (10,30)、(20,60) 两个未测组合检验“平滑降低换手/回撤”而非“提高收益”。未选 bb2925（period=60）作为独立父代，因其训练段缺失信号 59/444 已触发覆盖不足标注，单独扩测价值低；未新增因子或算子，全部沿用已记录的 sub/div/sma/add/mean 语义。父代 2 组 + 参数组 6 组共 8，小于 max_candidates=16，为后续组合与失败重试保留预算。数据要求为新区间，因 2024-01/02 及留出均已查看，历史冻结评价又被审计标记为区间复用，重复同区间不构成独立验证。

新数据上单窗口邻域与双窗口均值的否证性对照（BTCUSDT 1h）

在未使用的新行情区间上，同一费用与成交语义下：单窗口 period 的收益/回撤排序不会与 2024-01 记录出现方向一致的可迁移关系；双窗口均值组合相对其较短窗父代可降低 turnover，且 max_drawdown 不高于其较长窗父代，但不因此获得高于买入持有的收益。

否证条件：若新数据上 period 邻域的收益与回撤排序在训练/验证之间同号且与 2024-01 一致，或双窗口组合的 turnover 未低于较短窗父代、回撤高于较长窗父代，或组合在该区间收益超过同区间买入持有基线，则相应子假设被否证，需改写机制解释而非继续调参。

数据要求：2024-03 起未在私密文集出现、注册后导入且重用审计无冲突的 BTCUSDT 1h 行情；需另建授权与发布审计，不得复用 2024-01/02 及已查看留出，也不得把本次冻结评价当作新公式未见样本外证据。

参数类型和窗口边界已检查；其他源码约束仍需核对。

父代：8ad1fb3c214f382be9696ef1c10849a8be940581

候选参数组：[[{"name": "period", "value": 7}], [{"name": "period", "value": 12}], [{"name": "period", "value": 18}], [{"name": "period", "value": 24}]]

父代：6c07f295a922f4ceaaa07f630201d478f68a7cf8

候选参数组：[[{"name": "a_p0", "value": 10}, {"name": "b_p0", "value": 30}], [{"name": "a_p0", "value": 20}, {"name": "b_p0", "value": 60}]]
