# BTCUSDT 1h 均值回归偏离单/双窗口实验解读与独立复核计划

本批16个尝试均有评价记录，但训练与验证收益全部为负；选中attempt-2在选择后留出为-3.48%，虽好于买入持有基准的-5.62%，但绝对收益仍为负。当前没有可用于盈利或实盘晋级的证据，值得继续研究，但下一轮只能作为新的独立数据否证性复核，不能称为推荐参数或最优方案。

本报告解释本机受控模拟，不代表原平台等价、独立样本外验证或实盘盈利能力。

研究优先级：继续研究

## 实验研究评价

研究评价总分：24 / 100

### 参数稳定性 · 1

有同轴四个可比较点，但全为负且无受支持区段；双窗口网格不完整，不能推荐稳定参数。

period=12/14/18/24训练与验证均负；parameter_sensitivity为no_supported_region；joint为incomplete_grid。

证据：parameter_sensitivity、parameter_joint_sensitivity、attempt-1、attempt-3、attempt-4、attempt-5

### 验证表现 · 0

本批全部训练/验证收益为负；选中尝试留出也负，仅相对基准少亏。

attempt-2验证-1.33%、留出-3.48%；基准留出-5.62%。

证据：attempt-2、holdout、baseline

### 风险与成本 · 1

回撤和换手在负收益环境中不低，费用滑点固定且缺失信号影响覆盖；无实盘或成本敏感性证据。

基线训练回撤11.67%、period24回撤12.77%；每边5bps费用加5bps滑点。

证据：execution、attempt-1、attempt-5

### 证据充分度 · 2

有16个可评价尝试和固定分区，但只有单月单品种，留出在选择后查看，且历史与留出均已暴露。

训练430、验证141、留出141个收益区间；无跨批独立证明。

证据：dataset、partition:train、partition:validation、partition:holdout、selection_diagnostic

### 复现价值 · 2

公式和参数合同简单、可复现，适合做否证性新数据测试；但平台等价性和经济有效性未证明。

seed表达式明确，实际参数有记录；执行引擎为quant-local-search-2。

证据：seed:8ad1fb3c214f382be9696ef1c10849a8be940581、seed:6c07f295a922f4ceaaa07f630201d478f68a7cf8、execution

## 搜索选择与过拟合风险

本请求记录16个尝试，16个均为evaluated、无重复、0拒绝/取消/预算停止；诊断覆盖16个候选，未触及32候选上限。按8块重组568/571个开发区间、丢弃最旧3个区间，70个组合中20个发生排名反转、50个保留、歧义0，反转比例28.57%；上下界相同且不是置信区间。该诊断只条件于本请求已记录的固定家族和开发期，不使用最终留出，也不重新训练或选择候选，不是p值、置信区间或独立性证明；外部和其他请求的搜索次数未知。低反转率不能抵消本批负收益和平台语义差异，诊断没有把unknown当作0。

证据：selection_diagnostic

## 结果解读

本批16个尝试状态均为evaluated，无拒绝、取消或预算停止；但所有可比较训练/验证收益均为负。选中attempt-2训练-1.04%、验证-1.33%，选择后留出-3.48%，基准留出-5.62%；留出仅显示相对基准少亏，不能证明该家族有效。

证据：execution、attempt-2、holdout、baseline

单窗口period轴：period=12/14/18/24的训练收益分别为-7.82%/-9.17%/-9.43%/-10.15%，验证收益为-2.21%/-2.05%/-3.82%/-4.36%；period=12相对基线略好但收益仍负，parameter_sensitivity判定no_supported_region。

证据：parameter_sensitivity、attempt-1、attempt-3、attempt-4、attempt-5

双窗口参数中，a_p0=20,b_p0=60验证-1.24%略好于a_p0=14,b_p0=60的-1.33%，但训练-2.01%更差且训练缺失59/430；b_p0=30验证-4.85%明显更差。联合网格只有3个可比较点且覆盖不足，不能把差异归因于单个参数，也没有受支持区域。

证据：parameter_joint_sensitivity、attempt-2、attempt-6、attempt-7

实际参数方面，单窗口实际period=14等于源码默认14；双窗口实际a_p0=14、b_p0=60等于衍生候选声明默认值。默认值不是实证最优；12/18/24及b_p0=30等邻域显示收益和回撤变化，但方向不一致且全为负。

证据：seed:8ad1fb3c214f382be9696ef1c10849a8be940581、seed:6c07f295a922f4ceaaa07f630201d478f68a7cf8、attempt-1、attempt-2、attempt-7

组合与派生尝试attempt-8至attempt-16均为负收益；例如attempt-16训练-0.41%、验证-1.61%，attempt-14验证-1.06%但训练-4.55%。轻微改善不稳定，不能据此挑单点。

证据：attempt-8、attempt-14、attempt-16

同机制历史在2024-03曾出现较多正验证收益，如单窗口period=7/12/14/24验证约+9.93%/+9.41%/+7.42%/+9.56%，双窗口a14/b60验证+5.16%；但2024-04本批全负，说明月份/行情状态差异可能很大，历史正结果不能当作当前独立样本。

证据：memory:experiment:3bcade44045d30027fe12365b9a4e61a081cba72

2024-02固定验证period=30最终+13.96%，但买入持有基准+43.50%，最大回撤11.12%对4.26%，明显跑输基准；另一个period=30固定验证在计算前取消，无收益事实。

证据：memory:fixed_validation:db8395139fd6602f97e1c426248d0dc38ce79d07、memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575

选择诊断显示16个尝试全部可评价、无重复，分块重组70个组合中20个发生排名反转、50个保留、歧义0，反转比例28.57%；诊断只条件于本请求已记录固定家族和开发期，不是p值、置信区间或独立验证。

证据：selection_diagnostic

## 参数研究

period实际14等于默认14，但同轴12/14/18/24四个可比较点全为负；period=12相对14在训练少亏1.35个百分点、验证少亏0.16个百分点，但未转为正收益，且更短窗口训练换手70对62、进场35对31，不能称为稳定区段。

证据：parameter_sensitivity、attempt-1、attempt-3、attempt-4、attempt-5

双窗口a_p0/b_p0实际14/60等于衍生默认；a_p0=20时验证略好但训练更差，b_p0=30时训练和验证均显著变差。联合敏感性为incomplete_grid，缺少完整笛卡尔积和覆盖，b_p0轴仅两点，参数稳定性证据不足。

证据：parameter_joint_sensitivity、attempt-2、attempt-6、attempt-7

窗口越长，训练段missing_signals通常越多：单窗口period=12/14/18/24分别为11/13/17/23；双窗口b_p0=60训练缺失59/430，覆盖率不足90%，导致这些点不能进入稳定区段。预热处理尚未统一重算。

证据：attempt-2、attempt-3、attempt-1、attempt-4、attempt-5、parameter_sensitivity

本批无失败尝试，但历史固定验证c6aef处于cancelled且final/baseline为空，不能作为成功或失败收益证据；只能说明该预注册验证尚未产生结果。

证据：memory:fixed_validation:c6aef2399d994b9515ec5ee561cbcb6eca7c4575

## 风险与限制

选择偏差与多重比较风险：16个尝试先由训练Pareto和验证收益减回撤选择，再查看留出；留出不是跨批独立证明，且选择诊断显示约28.6%分块组合排名反转。

证据：execution、selection_diagnostic、holdout

成本与换手风险：配置为每边5bps费用加5bps滑点，单次往返约20bps；单窗口基线训练进场31次、换手62，短窗口换手更高，负收益下成本不可忽略。

证据：execution、attempt-1、attempt-3

市场与样本风险：只覆盖BTCUSDT 1h单月2024-04，训练430个收益区间、验证141个、留出141个；未覆盖其他月份、品种、周期、流动性和成交约束，不能外推。

证据：dataset、partition:train、partition:validation、partition:holdout

平台语义风险：sma/rolling的min_periods、缺失传播和开盘成交规则未与原平台验证；表达式等价性未证明，不能把本地结果当作原平台源码等价或实盘表现。

证据：execution、seed:8ad1fb3c214f382be9696ef1c10849a8be940581

历史暴露风险：March实验、February固定验证和本批April留出均已被查看，进入后续研究后属于开发线索；不能继续称为未见样本外证据。

证据：memory:experiment:3bcade44045d30027fe12365b9a4e61a081cba72、memory:fixed_validation:db8395139fd6602f97e1c426248d0dc38ce79d07、holdout

## 下一轮待验证假设

在未参与本批选择的2024-05 BTCUSDT 1h上，预注册的单窗口period邻域不会出现训练和验证同时为正且覆盖达标的稳定收益；若出现，则说明4月负结果可能受月份状态影响。

证据：parameter_sensitivity、attempt-1、attempt-3、attempt-5

检验：用父代8ad的period 7/10/12/18/24/30在新数据上同一成本规则下逐点评价，并报告missing_signals、entries、回撤和基准对照。

否证条件：任一组训练和验证净收益均为正、信号覆盖均不低于90%且回撤不高于基准时，否定“无非正稳定组”的表述。

新数据要求：2024-05 BTCUSDT 1h独立月线，预先冻结区间，不使用2024-02/03/04已查看结果挑选参数。

双窗口均值相对单窗口的主要作用若是降低回撤而非提高收益，则在新数据上应表现为双窗口回撤低于同周期单窗口，但收益不一定更高；若双窗口同时收益更差且回撤不降，则该组合无保留价值。

证据：parameter_joint_sensitivity、attempt-2、attempt-7、attempt-14

检验：用父代6c07的a_p0/b_p0预注册组合，与单窗口period=14及买入持有基准比较训练/验证收益、回撤和覆盖。

否证条件：双窗口组合在新数据上既不降低回撤也没有收益改善，或覆盖不足导致不可比较。

新数据要求：同一独立2024-05区间，固定5+5bps费用滑点，保留所有失败和缺失点。

选择诊断中的排名反转提示开发期单点排名不稳定；下一轮不应只挑历史上最好的单点，而应预注册完整小网格并报告全部结果。

证据：selection_diagnostic、parameter_sensitivity、parameter_joint_sensitivity

检验：对新数据同时运行单窗口period小网格和双窗口a_p0/b_p0小网格，按预注册规则汇总所有点而非按旧留出重选。

否证条件：若预注册网格中出现多组一致正收益且排名在训练/验证间无反转，则说明当前“排名不稳定”判断不成立。

新数据要求：新的独立月份与预先写明的评价规则；需要保留失败、缺失和未执行点。

## 仍未知

- 跨批留出独立性未证明；下一轮必须使用未参与选择的新的时间区间。
- 原平台rolling/sma的min_periods和缺失值与本机引擎是否一致未知。
- 其他市场、周期和更长样本上的表现未知。
- 参数_sensitivity无受支持区段，不能推荐period或a_p0/b_p0的具体值。
- 历史检索有1条omitted_for_size记录未展示，不能把未展示历史当作不存在失败或反例。
- c6aef固定验证取消后没有收益/回撤结果，需补证而非视为成功。

后续假设尚未执行；已查看留出结果，下一轮需要新的独立验证数据。

## 下一轮可执行方案

选择两个已提供的父代：单窗口8ad1fb3c214f382be9696ef1c10849a8be940581和双窗口6c07f295a922f4ceaaa07f630201d478f68a7cf8。保持close输入、单位、引擎和费用预算不变，不新增算子；只改变实际参与公式的signal参数。2个父代加12个参数组共14个候选，小于max_candidates=16，并为组合比较保留2个预算余量。单窗口变体覆盖period 7/10/12/18/24/30；双窗口变体覆盖a_p0 10/14/20与b_p0 30/60/90中的预注册组合，并包含b_p0=30对照。所有组须在新独立月份上同时报告，不按旧留出挑单点；方案只是待验证假设，不授权执行。

BTCUSDT 1h 均值回归偏离单/双窗口2024-05独立否证复核

在未参与本批选择的2024-05 BTCUSDT 1h数据上，预注册的单窗口period邻域与双窗口a_p0/b_p0组合中，至少存在一组训练和验证净收益为正、信号覆盖不低于90%且验证回撤不高于买入持有基准；若不存在，则该均值回归偏离家族在April之外仍缺乏可复现正收益证据。

否证条件：所有预注册组在训练或验证净收益小于等于0，或所有组信号覆盖不足90%，或没有组能在回撤不高于基准的同时取得正验证收益。

数据要求：BTCUSDT 1h 2024-05独立月线，预先冻结起止与评价规则；不得使用2024-02/03/04已查看结果选择参数；固定5bps费用和5bps滑点，报告全部失败、缺失和未执行点。

参数类型和窗口边界已检查；其他源码约束仍需核对。

父代：8ad1fb3c214f382be9696ef1c10849a8be940581

候选参数组：[[{"name": "period", "value": 7}], [{"name": "period", "value": 10}], [{"name": "period", "value": 12}], [{"name": "period", "value": 18}], [{"name": "period", "value": 24}], [{"name": "period", "value": 30}]]

父代：6c07f295a922f4ceaaa07f630201d478f68a7cf8

候选参数组：[[{"name": "a_p0", "value": 10}, {"name": "b_p0", "value": 30}], [{"name": "a_p0", "value": 14}, {"name": "b_p0", "value": 30}], [{"name": "a_p0", "value": 20}, {"name": "b_p0", "value": 30}], [{"name": "a_p0", "value": 20}, {"name": "b_p0", "value": 60}], [{"name": "a_p0", "value": 14}, {"name": "b_p0", "value": 90}], [{"name": "a_p0", "value": 10}, {"name": "b_p0", "value": 60}]]
