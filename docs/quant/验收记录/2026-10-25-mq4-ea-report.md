# MT4 快慢SMA交叉单次做多EA（质量样例·tick_ea）

本材料是一个极简 MT4/MQL4 单次做多 EA 的质量样例。源码事实：OnTick 内先以 OrdersTotal()!=0 阻止新单，再按当前图表周期、当前 bar（shift 0）收盘价计算 Fast/Slow 两条 SMA，当快线大于慢线时以 Ask 市价买入，止损止盈参数为 0,0，且无卖出/平仓分支与 OrderSend 错误处理。研究价值在于可作为信号-执行骨架和缺陷审查样例，而不是可投产策略；材料无 description/url/回测/收益/最优参数主张，作者实证结论未知。候选标签（仅分类，不证明有效性）：platform:mt4、frequency:tick、data:price、structure:time_series、mechanism:trend、usage:signal、usage:execution、tunability:signal；资产维度因材料未声明留空。平台/语言来自来源字段声明（platform=MetaTrader 4、language=mql4），未本机编译验证；source_structure 为 lexical-v1/partial，calls 仅为词法同名候选，不是运行时依赖或回测证据。

## 问题清单与严重度

审查范围：source.code 全 13 行（逐行核对第1–13行）、source.title/language/platform/description/url/fetch_status/provenance、previous（identify/parameters/research/extract）、source_structure（parser=lexical-v1、status=partial、calls/imports）、portable_qualification（5 项均为 reusable 但 automatic_experiment_ready=false，inputs_requiring_mapping=close_price/orders_total）、compare（scanned=0，无跨库匹配）、research_memory（scanned 全为 0，scan_limits 未预算受限）。未检查/未完成项：未编译、未运行 MT4、未回测、未取 tick 级日志，因此 iMA shift=0 的盘中刷新与信号闪烁、OrdersTotal() 在跨品种/跨 Magic/人工持仓下的实际阻断行为、OrderSend 失败码、止损止盈 `0,0` 的平台语义均属未知，不外推为已通过或已失败。description 与 url 为空，故本次无法引用任何文档字段，所有 evidence 仅取自 source.code。未发现作者收益/胜率/稳健性/最优参数主张（材料无相关文本），这不等于此类结论不存在于其他材料。前序推断核对：previous 的 identify/research 对“无退出、无错误处理、全局闸门、shift=0 盘中可变、imports 为空不代表无依赖”的描述与原文一致；但 identify 标题中的“交叉”与第11行 `if(f > s)` 的水平比较不符，已在 findings 中标出为标签推断而非源码事实。portable_qualification 只是本机对受控表达式的声明引用/类型检查，不证明 MQL4 iMA 语义等价、不证明时点安全，也不证明任何收益或最优参数；automatic_experiment_ready=false 需先补齐 close_price/orders_total 的实际数据映射与图表周期/品种/账户配置才可实验。本机缺原平台函数语义属复现限制，未据此扣实现质量分。

严重度独立于研究质量分；AI 静态判断不代表编译、运行或盈利验证。

存在严重或高影响问题，研究总分不能视为通过结论。

### 高 · 账户级订单闸门未按 Magic/品种/方向过滤

AI 判断：认为原文明示

影响：第8行仅判断 `OrdersTotal() != 0`，任何其他品种、其他 EA 或人工持仓都会直接阻断入场；结合无退出逻辑，该 EA 在共享账户中可能长期不交易，且 Magic 参数无法用于隔离自身订单。前序推断（跨品种/跨魔术号持仓会阻断）与原文一致，但实际行为仍需运行时验证。

建议：改用按 OrderMagicNumber/OrderSymbol/订单方向循环筛选的持仓计数，或在文档中明确该 EA 必须独占账户；同时记录闸门触发次数以便审计。

涉及研究维度：实现质量、逻辑清晰度

原文依据（code）：

> if(OrdersTotal() != 0) return;

原文依据（code）：

> input int Magic = 731;

### 高 · 开仓后无任何退出路径，止损与止盈写死为 0

AI 判断：认为原文明示

影响：第12行 OrderSend 的 SL/TP 实参为 `0, 0`，全文无 OP_SELL、无 OrderClose、无平仓条件，源码层面持仓无退出、无单笔风险上限；任何关于该 EA 的盈亏或回撤讨论都缺前提。按 MQL4 常规语义 0 表示未设置，但该平台语义未经编译/运行确认。

建议：明确止损/止盈或平仓规则并写入订单参数，定义每笔风险预算；若设计上依赖外部平仓，需在文档中声明并纳入验证计划。

涉及研究维度：实现质量、复现与复用价值

原文依据（code）：

> OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);

原文依据（code）：

> void OnTick() {

### 中 · OrderSend 返回值与错误码未检查

AI 判断：认为原文明示

影响：第12行直接丢弃 OrderSend 返回值，未调用 GetLastError；滑点超限、无交易权限、市场关闭、手数非法等失败会被静默吞掉，无重试、无告警、无 ticket 记录，导致实盘/回测行为无法区分，也无法统计失败率。

建议：检查返回值是否大于 0，失败时记录 GetLastError 并按策略处理（告警/跳过/重试），并把 ticket 与 Magic 写入日志。

涉及研究维度：实现质量

原文依据（code）：

> OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);

原文依据（code）：

> #property strict

### 中 · shift=0 当前 bar 逐 tick 变化且无新 bar 检查，信号可能盘中闪烁

AI 判断：影响尚待验证的假设

影响：第9–10行 iMA 以 shift=0 取当前未闭合 bar，第7行 OnTick 每 tick 触发且无“新 bar”判断，同一 bar 内 `f > s` 可反复变化；是否构成平台意义上的重绘/信号抖动、以及在测试器与实盘是否一致，需要 MT4 运行时或 tick 级信号日志对照才能确认。这是信号稳定性与时点可复现性风险，不等同于已证实的前视偏差（源码未见未来索引）。

建议：记录同一 bar 内多次 tick 的 f、s 与 Ask，并与该 bar 闭合后的取值对照；若需 bar 级稳定信号，改用已闭合 bar（shift=1）或加新 bar 判断。

涉及研究维度：数据与时序可靠性

原文依据（code）：

> double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);

原文依据（code）：

> double s = iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0);

原文依据（code）：

> if(f > s)

### 中 · 信号是水平比较而非交叉事件，与“交叉”标签不一致

AI 判断：认为原文明示

影响：原文只有第11行 `if(f > s)` 的水平比较，没有 f_{t-1}<=s_{t-1} 且 f_t>s_t 的交叉判断；因此前序 identify 标题中的“快慢SMA交叉”是模型标签推断，而非源码事实。直接后果是：一旦持仓被外部平掉而 f>s 仍成立，下一 tick 会立刻重新入场，形成重复分批建仓而非“单次交叉”。

建议：补齐交叉状态记忆（或显式声明为水平条件策略），并在文档与标签中把“交叉”更正为“水平比较”，避免下游误用。

涉及研究维度：逻辑清晰度

原文依据（code）：

> if(f > s)

原文依据（code）：

> if(OrdersTotal() != 0) return;

### 中 · 信号参数无范围、无 Fast/Slow 关系校验

AI 判断：认为原文明示

影响：Fast/Slow 仅为 `input int`，源码未声明最小/最大/步长，也未校验 period>0 或 Fast<Slow；period 为 0 或负值时 iMA 的行为在材料中未定义（平台语义未验证）。默认 5/20 只是源码默认值，不构成推荐区间或最优参数。

建议：增加参数下限与 Fast<Slow 校验（或声明允许的取值域），并在明确品种/周期/成本后做敏感性测试，报告中保留失败参数组合。

涉及研究维度：参数可解释性

原文依据（code）：

> input int Fast = 5;

原文依据（code）：

> input int Slow = 20;

原文依据（code）：

> double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);

### 中 · Magic 参数写入订单但未参与任何持仓筛选

AI 判断：认为原文明示

影响：Magic 仅作为 OrderSend 第10个实参写出，第8行闸门不读取 OrderMagicNumber，故 Magic 无法隔离本 EA 与其他 EA/人工订单，参数语义与使用不一致；外部订单管理是否依赖该值未知。

建议：把闸门改为按 Magic（及 Symbol、方向）筛选持仓，或文档明确要求该 EA 独占账户且 Magic 仅供外部识别。

涉及研究维度：参数可解释性、复现与复用价值

原文依据（code）：

> input int Magic = 731;

原文依据（code）：

> if(OrdersTotal() != 0) return;

原文依据（code）：

> OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);

### 中 · 手数未经经纪商约束规范化，亦无风险预算

AI 判断：认为原文明示

影响：Lots 直接作为 OrderSend 成交量，源码未校验最小/最大手数与手数步长，也未与任何风险预算或止损距离关联；非法手数会被拒单而第12行又不检查返回值，失败将完全静默。默认 0.1 不能推断为安全值。

建议：下单前按 Symbol 的最小手数/步长规范化并校验，定义每笔风险预算（可用止损距离换算手数），并对拒单分支记录错误码。

涉及研究维度：参数可解释性、实现质量

原文依据（code）：

> input double Lots = 0.1;

原文依据（code）：

> OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);

### 中 · 图表周期与交易品种未声明，数据口径不可固定

AI 判断：认为原文明示

影响：第9–10行 timeframe 实参为 0（图表当前周期）、第12行品种取 Symbol()（当前图表品种），材料未声明具体周期、品种类别、账户类型与点值，故无法固定数据口径、无法跨样本比较，也不应据 MT4 或 MQL4 推断为外汇；Slippage 的点值假设随之悬空。

建议：在复现前固定并记录图表周期、品种、账户类型、点值、最小/最大手数与点差/佣金/滑点模型；缺失时相关实证结论保持未知。

涉及研究维度：数据与时序可靠性、复现与复用价值

原文依据（code）：

> double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);

原文依据（code）：

> OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);

原文依据（code）：

> input int Slippage = 3;

## 研究质量评价

研究质量分：48 / 100

评价依据为静态材料，实证表现未评估。

### 逻辑清晰度 · 3 / 5

代码仅 13 行、入口与参数命名直白（第2–6行 input；第7行 `void OnTick() {`），信号-执行骨架一眼可读，属于“基本可理解”。但存在三处结构不清晰：(1) 第8行 `if(OrdersTotal() != 0) return;` 是账户级闸门，未说明其意图是“账户内最多一单”还是“本 EA 最多一单”，语义含混；(2) 只有入场无退出，全文无 OP_SELL/OrderClose/平仓分支，策略层面的“何时结束”未定义；(3) 第11行 `if(f > s)` 是水平比较而非交叉事件，与前序 identify 标题所称“快慢SMA交叉”不一致，属于标签推断而非源码事实。这些是设计完整性与表述一致性问题，不是收益证据问题。

依据：source.code 第7行 `void OnTick() {`；第8行 `if(OrdersTotal() != 0) return;`；第11行 `if(f > s)`；第12行 `OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);`。缺失项：source.description 为空、source.url 为空，无外部设计文档；未编译、未回测；未提供运行时日志。检索相似性不是实证。

### 实现质量 · 2 / 5

可读但存在多处实现缺口：第12行 OrderSend 返回值与错误码完全未检查，滑点超限/权限/市场关闭时静默失败，不重试不告警；第8行闸门不按 OrderMagicNumber/OrderSymbol/方向过滤，跨品种、跨 EA、人工持仓都会阻断入场；第12行止损止盈实参写死 `0, 0`，无退出代码；Fast/Slow 未校验 >0 或 Fast<Slow，Lots 未经手数步长规范化。属“可读但不足以作为策略实现”的层级，故给 2。注意：按对象类别（EA）核查执行与风控，此项扣分来自源码自身缺陷，不来自本机解析或 DSL 支持状态。

依据：source.code 第12行 `OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);`（SL/TP 为 0,0，返回值未赋值）；第8行 `if(OrdersTotal() != 0) return;`（无 Magic/Symbol 过滤）；第2–3行 `input int Fast = 5;`、`input int Slow = 20;`（无范围与关系校验）；第1行 `#property strict`（严格模式下仍无错误处理）。缺失项：未提供编译日志或运行错误码。检索相似性不是实证。

### 数据与时序可靠性 · 2 / 5

未发现使用未来数据：第9–10行 iMA 的 shift 实参为 0，MQL4 中即当前 bar，无负向/未来索引，也没有 shift>0 的历史回看错配，故不构成典型前视泄漏。但时点语义未解决：(a) shift=0 的均线在未闭合 bar 上随 tick 变化，OnTick 每个 tick 都可能评估，源码无“新 bar”检查，同一 bar 内 `f > s` 可反复翻转，是否造成信号闪烁/平台意义上的重绘需 MT4 运行时验证；(b) iMA timeframe=0 指向图表当前周期、Symbol() 指向当前图表品种，材料未声明具体周期与品种，数据口径无法固定；(c) 入场价用 `Ask` 而信号基于 `PRICE_CLOSE` 的当前 bar 值，混合时点未说明。以上使时序可复现性不足，给 2。

依据：source.code 第9–10行 `double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);`、`double s = iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0);`；第7行 `void OnTick() {`；第12行 `OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);`。缺失项：未声明图表周期/品种/点差模型，无 tick 级日志，未回测。检索相似性不是实证。

### 参数可解释性 · 3 / 5

五个 input 命名与其在第8–12行的用途一一对应（Fast/Slow→iMA period，Lots→成交量，Slippage→允许滑点，Magic→订单标识），默认值可读，属“基本可理解”。扣分原因：全部参数均无 min/max/step 声明，也无 Fast<Slow 的运行时校验；Magic 写入订单却未用于持仓筛选（第8行闸门不看它），参数语义与使用不一致；Lots 无风险预算或手数步长约束；Slippage 未与品种点值挂钩；且默认 5/20/0.1/3/731 只是源码默认值，不能当作推荐或最优。

依据：source.code 第2–6行 `input int Fast = 5;`、`input int Slow = 20;`、`input double Lots = 0.1;`、`input int Slippage = 3;`、`input int Magic = 731;`；第8行 `if(OrdersTotal() != 0) return;`；第12行 `OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);`。缺失项：无参数范围/步长/风险预算说明，无经纪商手数约束。检索相似性不是实证。

### 复现与复用价值 · 2 / 5

作为缺陷审查/回归测试样例有复用价值（可稳定复现全局闸门、无退出、无错误处理三类问题），但作为可复用策略骨架价值有限：数据口径（品种、周期、账户类型、点值）未声明；无可编译/可回测配置；parser=lexical-v1/status=partial，imports 为空不代表运行时无依赖；portable_qualification 五项均 automatic_experiment_ready=false 且 inputs_requiring_mapping 含 close_price / orders_total，说明实验前必须补齐输入映射与平台语义，不能直接复用为可运行因子或策略。

依据：source.code 全文 13 行（第1–13行），第7行 `void OnTick() {`、第9行 `double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);`；缺失项：source.description 为空、source.url 为空、fetch_status=not_fetched，无编译/回测/实盘材料。检索相似性不是实证；本机解析与声明式类型检查不构成原平台等价或收益证据。

## 原理与计算逻辑

原理：机制假设为趋势/方向式多头的极简版本——短期均价高于长期均价时做多（第11–12行）。数据时点：入口为第7行 `void OnTick()`，每个 tick 都可能执行；第9–10行 `iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0)` 与 `iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0)` 的 timeframe 实参为 0（当前图表周期）、shift 为 0（当前 bar），因此盘中未闭合 bar 的值会随价格变化，是否导致平台意义上的重绘需运行验证；材料未声明具体图表周期与品种。执行时点：第8行先用 `if(OrdersTotal() != 0) return;` 检查账户总订单/持仓数，非零则直接返回，不按 Magic、Symbol 或方向过滤（AI推断：跨品种/跨魔术号持仓也会阻断，需运行验证）；第11行 `if(f > s)` 后第12行 `OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);` 以 Ask 市价做多，止损/止盈写作 `0, 0`。源码事实：仅 OP_BUY，全文无 OP_SELL/OrderClose/平仓分支，未检查 OrderSend 返回值/错误码；第8行闸门与第12行订单标识之间无 Magic 过滤。作者主张：材料未给出收益、回测、胜率、稳健性或参数最优性主张。平台/语言来自来源字段声明；imports 为空不代表运行时无依赖；parser=lexical-v1/status=partial，未编译或回测。

## 公式

公式与步骤（按源码可读语义描述，不构成编译/回测证据）：1) 令 `f_t = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0)`，`s_t = iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0)`；对应第9–10行对当前图表周期收盘价、当前 bar（shift 0）计算 SMA。2) 每个 tick 先计算 `N_total = OrdersTotal()`；若 `N_total != 0` 则不动作（第8行）。3) 若 `N_total == 0` 且 `f_t > s_t`（第11行），则以 `Ask`、手数 `Lots`、允许滑点 `Slippage` 发出 `OP_BUY`，`stop loss=0`、`take profit=0`（第12行）。4) 源码未检测 `f_{t-1} <= s_{t-1}` 且 `f_t > s_t` 的“交叉”事件，而是水平比较；未定义退出、止损、止盈或反向信号。5) 交易成本/成交结果取决于未声明的经纪商点值、点差、滑点、手数约束和 OrderSend 返回，材料未给出假设。

## 用途与条件

用途：研究/质量审查用的 MT4 信号与执行骨架，适合检查 tick 驱动、SMA 水平比较、单次入场闸门和市价单参数传递；也可作为缺陷复现样例（全局订单闸门、无退出、无错误处理）。适用情景假设：单图表、单品种、单周期、账户内无其他订单、允许由外部逻辑平仓和风控、且已明确点差/滑点/手数约束。不适用：不能据此认为可投产、可用于多品种/多 EA 共存、或具有正收益；材料未声明资产类别、周期、账户类型和经纪商约束。候选标签仅分类，不证明适用性或有效性。

## 输入参数与建议

### Fast · int

默认值：5；类别：signal

含义：快速简单移动平均的周期数（bar 数）；作为 iMA 的 period 实参，对当前图表周期收盘价计算 SMA。

约束：源码仅声明为 input int；未声明最小值、最大值、步长，也未声明 Fast 与 Slow 的大小关系；默认值 5<20 不是硬约束，源码也不校验该关系。

变化影响：改变快线平滑长度，进而改变 `f > s` 的入场条件；具体敏感性和最优值未知。

候选建议（待验证）：待验证：在明确图表周期、品种、点差/滑点模型和样本外框架下测试周期组合；源码未声明范围，不能把任何数值区间称为最优或硬约束。

来源依据：第2行：`input int Fast = 5;`；第9行：`double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);`

### Slow · int

默认值：20；类别：signal

含义：慢速简单移动平均的周期数（bar 数）；作为 iMA 的 period 实参，对当前图表周期收盘价计算 SMA。

约束：源码仅声明为 input int；未声明最小值、最大值、步长，也未声明 Slow 与 Fast 的大小关系；默认值 20>5 不是硬约束，源码也不校验该关系。

变化影响：改变慢线平滑长度，进而改变 `f > s` 的入场条件；具体敏感性和最优值未知。

候选建议（待验证）：待验证：在明确图表周期、品种、点差/滑点模型和样本外框架下测试周期组合；源码未声明范围，不能把任何数值区间称为最优或硬约束。

来源依据：第3行：`input int Slow = 20;`；第10行：`double s = iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0);`

### Lots · double

默认值：0.1；类别：risk

含义：OrderSend 的成交量/手数实参；单位为手，具体合约规模由经纪商决定，材料未声明。

约束：源码仅声明为 input double；未声明最小/最大手数、手数步长或风险预算。

变化影响：改变下单手数，从而改变名义敞口和风险；不改变 `f > s` 信号。

候选建议（待验证）：待验证：需先定义每笔风险预算、止损规则和经纪商手数约束；源码无止损，不能据默认 0.1 推断安全值。

来源依据：第4行：`input double Lots = 0.1;`；第12行：`OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);`

### Slippage · int

默认值：3；类别：execution

含义：OrderSend 的允许滑点实参；按 MQL4 语义为价格偏差（点），但材料未给出具体点差/成交假设。

约束：源码仅声明为 input int；未声明范围、步长或与品种点值的关系。

变化影响：改变订单可接受的最大价格偏差，影响成交概率与执行成本；不改变信号。

候选建议（待验证）：待验证：结合品种点值、流动性和执行成本测试；源码未声明范围，不能给最优值。

来源依据：第5行：`input int Slippage = 3;`；第12行：`OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);`

### Magic · int

默认值：731；类别：execution

含义：传入 OrderSend 的订单魔术号标识；用于外部识别订单，但本源码未用于持仓筛选。

约束：源码仅声明为 input int；未声明范围；第8行闸门仅用 OrdersTotal()，未按 Magic 过滤。

变化影响：改变订单标识，不改变 `f > s` 信号；由于闸门不看 Magic，不能靠它隔离本 EA 与其他持仓。

候选建议（待验证）：待验证：应保证与其他 EA/脚本/人工订单不冲突，并验证外部订单管理是否依赖该值；不能假设默认 731 唯一。

来源依据：第6行：`input int Magic = 731;`；第8行：`if(OrdersTotal() != 0) return;`；第12行：`OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);`

## 来源事实

- 平台与语言来自来源字段声明（非本机验证）：platform=MetaTrader 4、language=mql4、title=‘质量样例 · tick_ea’；description 为空、url 为空、fetch_status=not_fetched，provenance=intake。
- 依赖：解析 imports 为空（第1–13行无 #include，未见外部库加载）；第8行 OrdersTotal、第9–10行 iMA、第12行 OrderSend/Symbol/Ask 仅为词法同名候选，reference_semantics 明示‘syntactic_name_candidates_not_runtime_dependencies’，不证明运行时依赖或可调用性。
- 声明参数（原文，第2–6行）：`input int Fast = 5;`、`input int Slow = 20;`、`input double Lots = 0.1;`、`input int Slippage = 3;`、`input int Magic = 731;` —— 仅为源码声明的输入项，不是推荐或最优参数。
- 信号构造（原文，第9–10行）：`double f = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0);` 与 `double s = iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0);` —— 对收盘价计算两条简单移动平均，取当前 bar 位移 0 值。
- 入场逻辑（原文，第11–12行）：`if(f > s)` 后执行 `OrderSend(Symbol(), OP_BUY, Lots, Ask, Slippage, 0, 0, "QA", Magic, 0, clrBlue);` —— 快线在慢线上方时以 Ask 市价做多，止损与止盈两个参数写作 `0, 0`，即未设置。
- 单向且无退出：第12行仅 `OP_BUY`，全文无 `OP_SELL`、无 OrderClose 或平仓分支，也无止损/止盈写入；同时未检查 OrderSend 返回值或错误码。
- 入场过滤（原文，第8行）：`if(OrdersTotal() != 0) return;` —— 只按账户总订单/持仓数做一次闸门，未按 Magic、品种或方向筛选，因此跨品种/跨魔术号的既有持仓也会阻断入场（机制推断，需运行时验证）。
- 频率与资产：入口为第7行 `void OnTick()`（tick 事件驱动），但第9–10行 iMA 的 timeframe 实参为 0，指向图表当前周期，材料未声明具体周期；第12行品种取 `Symbol()`（当前图表品种），材料未声明具体资产类别，故资产标签留空、不据 MT4 推断为外汇。
- 结构解析状态：parser=lexical-v1、status=partial，诊断称‘仅词法结构候选，未调用原平台编译器；宏、类型、重载、作用域和实际执行依赖未解析’；节点与调用表不可作为编译或回测证据。
- 作者主张：材料未给出任何收益、回测、胜率、稳健性或参数最优性主张（description 为空、无 url），故此类结论全部未知。
- 未知项：是否能在 MT4 编译运行、历史表现、适用品种与周期、参数敏感性、点差与滑点假设、OrderSend 失败后的行为，均无材料依据，不补造。

## 分析假设

- AI推断：`mechanism:trend` 仅由“快线大于慢线做多”的水平比较推断为趋势/方向机制假设；源码没有证明该机制有预测力或收益。依据：第11–12行 `if(f > s)` 与 `OP_BUY`。
- AI推断：`frequency:tick` 来自第7行 `void OnTick()`；实际触发频率和是否每个 tick 都执行由平台/品种决定，材料未给运行配置。
- AI推断：`data:price` 来自第9–10行 `PRICE_CLOSE`；未使用成交量，不应标为 OHLCV。
- AI推断：`structure:time_series` 来自对 `Symbol()` 单品种当前图表序列的 SMA 计算；材料未声明横截面或资产类别。
- AI推断：第8行 `OrdersTotal()!=0` 会因账户内任何既有订单/持仓而阻断入场，包括其他品种/其他 Magic/人工单；依据是未看到按 Magic、Symbol、方向筛选。需运行验证。
- AI推断：由于源码无 OP_SELL、OrderClose、止损/止盈，开仓后若无外部干预将持续存在；这是源码结构推断，实际账户行为需运行验证。
- AI推断：第12行止损/止盈两个参数为 `0, 0`，按 MQL4 常规语义表示未设置；材料未声明平台语义验证，需编译器/运行确认。
- AI推断：shift=0 的 iMA 在当前 bar 未闭合时可能逐 tick 变化，信号可能闪烁；是否构成重绘需运行验证；材料未声明新 bar 检查。
- AI推断：imports 为空不等于无运行时依赖；matching calls 仅为词法候选；source_structure status=partial，不能作为编译或回测证据。
- 未知：图表周期、品种/资产类别、账户类型、经纪商点值、最小/最大手数和手数步长均未声明；不能据 MT4 或语言推断为外汇。
- 未知：作者未提供编译、回测、收益、胜率、稳健性或参数最优性主张；默认参数 5/20/0.1/3/731 仅为源码输入默认值，不是实际配置或推荐值。

## 缺失信息

- 未提供实际运行配置；5/20/0.1/3/731 仅为源码默认值，不能当作实际参数。
- 未声明图表周期、品种、账户类型、经纪商点值、最小/最大手数和手数步长。
- 未提供编译、回测或实盘结果，无法判断可运行性、成交、滑点、收益、回撤。
- Fast/Slow 的允许范围、步长及两者大小关系未声明；不能给优化区间或最优参数。
- iMA 在当前 bar（shift 0）上的盘中变化、信号闪烁或重绘风险未验证。
- OrdersTotal() 闸门在跨品种、跨 Magic、其他 EA 或人工持仓存在时的实际阻断行为未验证。
- OrderSend 失败、部分成交、滑点超限、市场关闭或交易权限受限时的行为未处理且未验证。
- Lots 的风险预算、止损/止盈规则未声明；第12行写死 0, 0，风险暴露未知。
- Magic 是否与其他 EA/脚本/人工订单冲突，以及外部订单管理是否依赖该值未知。
- 作者未给出收益、胜率、稳健性或参数最优性主张；材料无相关实证证据。

## 问题与限制

时间对齐与盘中变化：第9–10行 iMA 的时间周期实参为 0、shift 为 0，指向当前图表周期当前 bar；OnTick 逐 tick 计算且未检查新 bar，当前 bar 值会盘中变化，信号可能闪烁，是否构成重绘需运行验证。数据依赖：品种取 Symbol()、周期取图表当前周期，材料未声明具体品种/周期。实现缺陷：第8行 `if(OrdersTotal() != 0) return;` 是全局订单数闸门，不按 Magic、Symbol 或方向过滤，任何既有持仓都会阻断入场；第11–12行只做 `if(f > s)` 后 OP_BUY，并未检测“交叉”，且无 OP_SELL、OrderClose 或平仓分支，止损/止盈参数写死为 `0, 0`，持仓无退出逻辑；第12行未检查 OrderSend 返回值/错误码，成交失败或滑点拒绝无处理。Magic 虽传入 OrderSend 但未用于闸门筛选。解析器为 lexical/partial，imports 为空不等于运行时无依赖，未编译或回测。

## 验证计划

1) 复现前固定材料与版本：记录源码、平台声明、parser=lexical-v1/partial；在 MT4 编译并明确声明图表周期、品种、账户类型、点值、最小/最大手数、点差/佣金/滑点模型；不把默认参数当实际配置。2) 行为核验：逐 tick 记录 bar 时间、`f`、`s`、`Ask`、`OrdersTotal()`、`OrderSend` 返回码/票据、`Magic`、`Symbol`；验证第8行闸门在跨品种/跨 Magic/人工持仓下的阻断；验证 OrderSend 失败、部分成交、滑点超限、市场关闭、权限受限时的行为；验证无退出/无止损止盈时持仓如何被外部关闭。3) 盘中与重绘核验：比较同一 bar 内多次 tick 的 shift=0 信号变化，并与 bar 收盘后值对照；区分源码行为与设计变体。4) 敏感度：在明确样本与成本下对 Fast/Slow 做网格/随机搜索，报告交易数、暴露、回撤、成本敏感性和失败率；不宣称最优参数；对 Lots/Slippage 做执行成本与手数约束敏感性。5) 样本外：采用时间切分或 walk-forward，跨多个已声明品种/周期和不同波动区间检验；加入点差、佣金、滑点、隔夜利息；报告多重检验和参数选择偏差；若材料仍无资产/周期/账户配置，则相关样本外结果应标记为未知而非补造。

## 自动提取的研究候选

仅从所提供的 13 行 MQL4 质量样例提取；未执行、未编译、未回测。来源声明 platform=MetaTrader 4、language=mql4，parser=lexical-v1/status=partial。提取范围限定为源码中可分离的 SMA 计算、快慢线水平比较信号、以及账户订单数闸门；Lots/Slippage/Magic 属于执行或风控参数，但材料未给出独立计算逻辑，未列入 factors。所有默认值仅为源码默认，不表示推荐或最优；材料未声明图表周期、品种、资产类别、参数范围及 Fast/Slow 大小关系。expression 使用声明式 SMA 抽象描述 PRICE_CLOSE/当前图表周期/当前 bar，不能证明 MQL4 iMA 的运行时语义、可编译性或有效性。

### fast_sma_current

当前图表周期、当前 bar（shift 0）上对收盘价计算的快速简单移动平均，作为趋势类数值序列候选；不是收益因子，未验证预测力。

f_t = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0)

限制与待验证项：expression 中的 sma(close_price, Fast) 是对源码 iMA MODE_SMA/PRICE_CLOSE/shift=0 的声明式抽象，未编码 MetaTrader 4 平台差异、当前 bar 盘中刷新、图表周期与品种。parser=partial，未编译/回测，不能证明可执行或有效。材料未声明 Fast 范围及与 Slow 的关系。

### slow_sma_current

当前图表周期、当前 bar（shift 0）上对收盘价计算的慢速简单移动平均，作为趋势类数值序列候选；不是收益因子，未验证预测力。

s_t = iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0)

限制与待验证项：expression 中的 sma(close_price, Slow) 是对源码 iMA MODE_SMA/PRICE_CLOSE/shift=0 的声明式抽象，未编码 MetaTrader 4 平台差异、当前 bar 盘中刷新、图表周期与品种。parser=partial，未编译/回测，不能证明可执行或有效。材料未声明 Slow 范围及与 Fast 的关系。

### fast_minus_slow_sma_spread

快速 SMA 与慢速 SMA 的连续价差；源码只使用其符号（f > s）作为入场条件，并未单独输出或交易该价差。可作为趋势方向的连续数值候选。

spread_t = f_t - s_t = iMA(NULL, 0, Fast, 0, MODE_SMA, PRICE_CLOSE, 0) - iMA(NULL, 0, Slow, 0, MODE_SMA, PRICE_CLOSE, 0)

限制与待验证项：expression 用 sma(close_price, Fast) - sma(close_price, Slow) 抽象源码中的两条 iMA；未编码 MetaTrader 4 平台差异、当前 bar 盘中刷新、图表周期与品种。源码并未直接计算或输出该价差字段，此候选是 AI 对两条均线差值的结构化提取，未经实测。

### fast_sma_above_slow_sma_signal

快线严格大于慢线的水平比较布尔信号；源码随后以 Ask 市价做多。该条件不是交叉事件检测，也不是收益因子。

entry_signal_t = (f_t > s_t)，其中 f_t 与 s_t 为当前图表周期、shift=0 的 Fast/Slow SMA

限制与待验证项：expression 只表达 f_t > s_t 的布尔状态；不表达无持仓闸门、OrderSend、手数、滑点、止损止盈或退出。当前 bar shift=0 可能盘中变化，是否导致信号闪烁/重绘需运行验证。未声明图表周期/品种，未回测。

### no_open_orders_entry_gate

账户总订单/持仓数为零时才允许继续执行入场逻辑的闸门；源码按 OrdersTotal() != 0 直接返回，未按 Magic、品种或方向筛选。

gate_t = (OrdersTotal() == 0)

限制与待验证项：expression 用声明式 input orders_total 抽象 OrdersTotal() 返回值；不能表达平台账户状态获取、跨品种/跨 Magic/人工订单的实际阻断行为。该闸门为全局账户级检查，源码未按 Magic/Symbol/方向筛选，机制推断需运行验证。

## AI 定义修订

原始提取保留；以下是独立修订假设，不能把结构通过当作原平台修复、等价或收益证据。研究质量分仍评价原资料。

本次未发现需要修订的受控定义或默认配置，不额外调用修订模型。

## 首轮实验规划

本轮只设计条件实验，未运行、未编译、未回测。可检验范围：以 factor:2 的价差 spread=FastSMA(close)-SlowSMA(close) 为数值信号，entry threshold=0 做多、<=0 空仓；Fast/Slow 默认 5/20 来自第2–3行及第9–10行，网格 Fast∈{3,10}、Slow∈{15,30} 的四个完整组合是对两个 signal 参数的联动敏感性假设，不是源码约束、推荐值或最优参数。所选输入 close_price 在 bindings 中明确映射为 close；但原源码第9–10行 iMA 的 timeframe=0、shift=0 指当前图表未闭合 bar 且逐 tick 变化，本引擎只能用已闭合 bar 的 close 近似，不能声称与原 MQL4 逐 tick 行为等价，具体品种、图表周期和平台语义仍未知。阻碍：portable_qualification 对所有项 automatic_experiment_ready=false；factor:2 的 close_price 需实际数据列映射；factor:4 的 orders_total 无法映射到 open/high/low/close/volume，其账户级 OrdersTotal() 闸门不进入本轮，避免把非行情状态伪造成行情输入。需用户先提供单一品种、固定周期、连续 OHLCV，至少覆盖最长 Slow=30 根的预热和评价窗口，并确认 bar 收盘信号到下一开盘执行的映射，才可执行。threshold=0 因价差单位是价格差，0 对应 f>s 的符号，不是跨单位阈值；fee_bps=5、slippage_bps=5、gap=2、seconds=30 是实验预算/成本假设，不代表真实账户；position_fraction=0.5、max_entries=1000 是固定实验设置，不是最优风控；止损、止盈停用，避免编造源码不存在的退出规则。未使用 evolution，因没有明确的新公式假设；未使用 walk_forward，因品种、周期、总数据长度未知，无法声明每折预算与训练/验证/测试容量。历史库无可继承实验，故不引用 memory；本方案不声称已运行、最优或获利。

### sma_spread_sign_long_flat_first_round

检验假设：在单一品种、固定周期的已闭合 OHLCV 上，若快速 SMA 高于慢速 SMA（spread>0）包含可延续的趋势方向信息，则按 spread>0 做多、spread<=0 空仓，在扣除假设费用与滑点后，应优于零信号或同成本买入持有对照，并且结论不应只出现在单一 Fast/Slow 组合。

否证条件：在用户选定并隔离的评价区间内，若四组 Fast/Slow 组合在扣除 5 bps 费用和 5 bps 滑点后均不优于同成本买入持有对照，或多数组合无正收益、方向不一致、结果对窗口小幅变化即翻转，则拒绝该趋势延续假设；若因 close_price 映射或 shift=0 时序无法确定而不能形成可复现实验，则标记为不可检验，不补造结果。

行情要求：单一品种、单一固定周期的连续 OHLCV，至少包含 close；信号使用已闭合 bar 的 close，并在下一开盘决策，作为对原 shift=0 当前 bar 的近似而非等价复现；长度至少覆盖最长 Slow=30 根预热加用户评价区间，不得跨品种或跨周期拼接；具体品种、周期和总长度材料未声明，需用户补齐后才能声称可运行。

包含 AI 修订候选时按其独立定义默认配置建立基线，须核对 repair 引用；原始版本仍用来源默认值。尚未执行，不代表原平台等价、实际运行配置或最优参数。

## 历史研究依据与判断

本次冻结研究库扫描范围为 same_collection，cutoff=2026-10-25T10:52:22.556000+00:00，scan_limit=2000，实际 scanned={experiments:0, feedback:0, comparisons:0, fixed_validations:0}，eligible 全为 0，omitted_for_size=0，scan_limits.budget_limited=false、size_limited=false，即未触及时间或读取预算，属于“库中暂无相关历史记录”，而非“历史全被截断”。因此：无可复用的历史实验、可放弃的历史线索、可核对的外部反馈、可直接对照的比较记录，也无冻结的固定样本验证结果可继承。本轮不引入任何历史表现、失败条件、成本或参数作为先验；不存在历史留出，故不声称任何样本外证据。memory_assessment 为空数组，仅表示暂无历史可判断，不代表这些方向已被验证为无效。当前结论完全来自本次材料的静态审查：13 行源码、previous 分析、source_structure（lexical-v1/partial）、portable_qualification（五项 reusable 但 automatic_experiment_ready=false，需映射 close_price 与 orders_total）。后续若进入实验，须先补齐图表周期、品种、账户与成本配置及输入映射，并在新数据上检验，不能把本轮静态评分当作收益证据或放行依据。
