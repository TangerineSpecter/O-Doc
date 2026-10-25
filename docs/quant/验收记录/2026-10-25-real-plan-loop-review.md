# BTCUSDT 1h 滚动均值偏离因子的参数邻域复核

本批只有一个滚动均值偏离公式的单参数搜索。attempt-1 至 attempt-6 的训练与验证收益均为负；选择规则选中的 attempt-5（period=30）留出收益 +2.16%，但低于同段基线 +6.86%，且留出是在本批选择后计算，不能证明独立优势。参数敏感度没有支持区段。结论：不值得作为优先交易方向；仅值得用新的独立数据做否证性复核。

本报告解释本机受控模拟，不代表原平台等价、独立样本外验证或实盘盈利能力。

研究优先级：降低优先级

## 实验研究评价

研究评价总分：28 / 100

### 参数稳定性 · 1

有 6 个同公式同轴可比较点，但全部不满足正收益、覆盖和相对基线容差，regions 为空；只能说明本批没有稳定区段，不能支持推荐值。

period 5/10/14/20/30/60 的训练收益极差 6.81pp、验证 2.28pp，period=60 训练覆盖不足。

证据：parameter_sensitivity、attempt-1、attempt-2、attempt-5、attempt-6

### 验证表现 · 1

被选中 attempt-5 的训练和验证收益均为负，验证收益 -4.02%；留出 +2.16% 低于同段基线 +6.86%，且不是独立验证。

attempt-5 验证收益 -0.0402、回撤 0.0402；留出收益 0.0216、基线收益 0.0686。

证据：attempt-5、holdout、baseline

### 风险与成本 · 2

有固定费用、滑点、换手和回撤记录，但只有一个月数据且无费用敏感性；风险证据有限。

单侧 5bps 手续费加 5bps 滑点；attempt-5 验证换手 16、回撤 4.02%，留出回撤 2.97%。

证据：execution、attempt-5、holdout

### 证据充分度 · 1

仅一个交易对、一个月、9 个尝试，无独立留出证明、无历史对照、无显著性检验；证据不足以支持继续优化。

数据集为 BTCUSDT 1h 2024-01，共 744 行；留出仅在批内选择后评价。

证据：dataset、execution、holdout

### 复现价值 · 2

公式简单、参数和表达式记录完整，可复现计算；但未验证原平台等价性，且经济表现弱，复现主要用于否证而非部署。

表达式为 close/sma(close, period)-1；attempt-1 与 attempt-5 记录实际 period 分别为 14 和 30。

证据：attempt-1、attempt-5、execution

## 结果解读

事实：attempt-1 至 attempt-6 的训练与验证收益全部为负；被选中的 attempt-5 训练收益 -12.19%、验证收益 -4.02%、验证最大回撤 4.02%。这说明本批选择结果不是正收益证据。

证据：attempt-1、attempt-2、attempt-3、attempt-4、attempt-5、attempt-6

事实：attempt-5 留出段收益 +2.16%、最大回撤 2.97%、7 次入场；同一留出段基线收益 +6.86%、回撤 2.82%、1 次入场且 100% 暴露。留出为选择后计算，不能据此宣称策略优于基线或跨批稳定。

证据：attempt-5、holdout、baseline

事实：同轴 period 5/10/14/20/30/60 六个可比较点全部不满足参数敏感度规则，训练收益极差 6.81 个百分点、验证收益极差 2.28 个百分点，且无正收益，regions 为空，status=no_supported_region。period=60 训练缺失 59/444，覆盖率不足 90%。

证据：parameter_sensitivity、attempt-6

事实：均值组合 attempt-7、attempt-8、attempt-9 的验证收益分别约 -5.80%、-3.79%、-6.78%，未见改善；它们被排除在单参数敏感度归因之外，不能把组合结果归因于某个 period。

证据：attempt-7、attempt-8、attempt-9、parameter_joint_sensitivity

事实：源码默认 period=14 实际对应 attempt-1；被选中的 attempt-5 实际使用 period=30。默认值不是最优值，源码未声明取值范围，本批也没有统计显著性检验。

证据：execution、attempt-1、attempt-5

## 参数研究

实际参数：基线尝试 attempt-1 使用 period=14，被选择 attempt-5 使用 period=30，尝试覆盖 5 至 60。同轴没有支持区段，不能推荐任何 period 值；period=60 的预热缺失使训练覆盖不足，说明窗口变大与信号覆盖存在实际约束。

证据：parameter_sensitivity、attempt-1、attempt-5、attempt-6

联合敏感度只有一维 period 轴，comparison_cells 为空、status=incomplete_grid；无法评价二维参数稳定性或连续区间。attempt-7 至 attempt-9 是多窗口均值组合，不能作为单参数稳定性证据。

证据：parameter_joint_sensitivity、attempt-7、attempt-8、attempt-9

费用固定为单侧 5bps 手续费加 5bps 滑点；attempt-5 训练换手 56、验证换手 16、留出换手 14。未做费用或滑点敏感性，不能判断成本冲击是否会改变结论。

证据：execution、attempt-5

## 风险与限制

选择偏差：9 个尝试中按训练 Pareto 与验证收益减回撤选择 attempt-5；留出正收益可能是选择后偶然，不是独立样本外证明。

证据：execution、attempt-5、holdout

所有同轴点训练与验证为负，且仅覆盖一个 BTCUSDT 1h 月份；不能外推到其他市场、周期或实盘。留出段基线表现更高，不能以留出正收益替代相对基线评估。

证据：dataset、holdout、baseline、parameter_sensitivity

平台语义风险：sma/rolling 的 min_periods、缺失处理与成交假设未验证；受限表达式引擎结果不等价于原平台。参数容差通过也不等于统计显著性或连续区域有效。

证据：execution、parameter_sensitivity

看过留出后继续使用同一留出会污染验证；任何新假设需新的独立数据。当前研究库无历史记录和库候选可作独立对照。

证据：holdout、execution

## 下一轮待验证假设

period=30 的留出正收益是选择后偶然，不是稳定优势。

证据：attempt-5、holdout、baseline

检验：在新的独立 BTCUSDT 1h 区间，同费用同成交语义下比较 period=30 与 period=14，并跑 20 至 50 邻域；预注册训练/验证判据。

否证条件：若 period=30 在新数据训练与验证均为正收益、回撤不高于基线，且至少 3 个邻近 period 点满足覆盖率和相对基线容差，则否证该假设。

新数据要求：2024-01 之外的 BTCUSDT 1h 数据，最好多个独立月份；不得复用本批留出。

均值组合不会改善单窗口公式的负收益。

证据：attempt-7、attempt-8、attempt-9

检验：在独立数据上比较 attempt-7、attempt-8、attempt-9 的均值组合与对应单窗口尝试，固定费用和成交语义。

否证条件：若组合在独立验证段相对两个单窗口均提高净收益且不增加回撤，则支持组合假设。

新数据要求：新的独立区间，并保留完整组合与单窗口对照。

period=60 的训练缺失主要由预热造成，而非信号本身缺失。

证据：attempt-6、parameter_sensitivity

检验：统一预热窗口重算各 period 的覆盖率，并在新数据上比较 period=60 与较短窗口。

否证条件：若统一预热后 period=60 仍覆盖不足 90% 或表现更差，则缺失不能仅由预热解释。

新数据要求：带足够预热的连续新行情数据。

## 仍未知

- period 在 5 至 60 之外的参数行为未知。
- 同一公式在其他币种、其他时间框架或其他行情月份的表现未知。
- sma/rolling 的 min_periods 语义与预热重算后的覆盖率未知。
- 费用和滑点变化对净收益的影响未知。
- attempt-5 留出正收益是否只是选择后偶然，尚未用独立数据检验。
- 均值组合 attempt-7 至 attempt-9 是否在独立数据上改善单窗口公式未知。
- 是否存在统计显著性或经济显著性未知；本批未提供显著性检验。
- 原平台源码等价性和实盘可执行性未知。

后续假设尚未执行；已查看留出结果，下一轮需要新的独立验证数据。

## 下一轮可执行方案

选择原始 seed 8ad1fb3c214f382be9696ef1c10849a8be940581 而不是已查看留出的派生候选，因为其参数名与源码默认 period 对应，实际基线为 14；只改变信号参数 period，不改公式、输入、费用或成交语义。提出 12 个邻域值，父代 1 个加参数组 12 个共 13 个，小于 max_candidates=16，保留 3 个预算空位。该方案是否证性独立复核假设，不是最优参数推荐，也不宣称已执行或已验证；attempt-5 的同一留出不能用于确认新假设。

独立数据复核：滚动均值偏离因子 period 邻域

在未参与本轮选择的新 BTCUSDT 1h 区间上，period=30 不会相对 period=14 基线显示稳定净收益优势，且 period 20 至 50 邻域不存在同时满足正训练/验证收益与覆盖要求的稳定区段。

否证条件：若新数据上 period=30 在训练和验证均正收益、回撤不高于基线，且至少三个邻近 period 点满足覆盖率与相对基线容差，则否证该假设。

数据要求：新的 BTCUSDT 1h 数据，时间区间不在 2024-01 且未参与本批选择；沿用单侧 5bps 手续费与 5bps 滑点及下一根开盘成交语义；最好覆盖多个独立月份。

参数类型和窗口边界已检查；其他源码约束仍需核对。

父代：8ad1fb3c214f382be9696ef1c10849a8be940581

候选参数组：[[{"name": "period", "value": 20}], [{"name": "period", "value": 24}], [{"name": "period", "value": 26}], [{"name": "period", "value": 28}], [{"name": "period", "value": 30}], [{"name": "period", "value": 32}], [{"name": "period", "value": 34}], [{"name": "period", "value": 36}], [{"name": "period", "value": 38}], [{"name": "period", "value": 40}], [{"name": "period", "value": 45}], [{"name": "period", "value": 50}]]
