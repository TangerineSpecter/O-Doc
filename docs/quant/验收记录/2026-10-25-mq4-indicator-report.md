# MT4 MissingVendor 指标封装样例

研究结论：材料是 MT4 图表窗口的薄封装指标，源码只在 OnInit 中绑定 1 个缓冲区，并在 OnCalculate 中给 Buffer[0] 做三元赋值；实际信号来源是未提供的外部指标 "MissingVendor"。因此这批材料不足以支持因子定义、收益判断或参数优劣结论；研究价值是识别依赖缺失、历史填充和索引风险，并整理接入和验证步骤。既有分类 platform:mt4、usage:display、tunability:signal、tunability:other 只是候选分类，不证明适用性或有效性。

## 问题清单与严重度

审查范围：source.code 第1–14行、source.description、url、source_structure、portable_qualification 与冻结 research_memory；description 为空，无 url/web_markdown，未引用这些字段。未检查项：未调用 MT4 编译器，未运行终端，未取得 MissingVendor 源码/算法/参数契约，未做回测、收益、风险、重绘或跨周期验证，未验证 SetIndexBuffer 运行时绑定。source_structure=partial 仅为词法候选，portable_qualification 的 expression missing、automatic_experiment_ready=false 与外部依赖未验证属于本机研究流程边界，不据此单独判源码缺陷。前序 AI 推断“只写 Buffer[0]”与原文第12–13行一致，但“历史 bar 不填充”及返回 rates_total 的终端后果仍是未运行验证的假设；未发现未来收益直接作为时点信号的写法，但不等于不存在未提供的 MissingVendor 内部时序问题。检索相似性、前序 AI 分析与本次审查本身都不是实证。

严重度独立于研究质量分；AI 静态判断不代表编译、运行或盈利验证。

存在严重或高影响问题，研究总分不能视为通过结论。

### 高 · 外部指标 MissingVendor 缺失，核心计算不可复现

AI 判断：认为原文明示

影响：第12行硬编码调用外部指标 MissingVendor；材料未提供该文件、算法、参数契约、返回单位或缺失行为，无法确认 mode/shift 语义，因而不具备独立复现前提。

建议：先取得 MissingVendor 源码或可执行文件及参数契约，核对其缓冲区索引、输入顺序和缺失返回值；未取得前不建立因子有效性或参数结论。

涉及研究维度：逻辑清晰度、参数可解释性、复现与复用价值

原文依据（code）：

> Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;

### 高 · 仅给 Buffer[0] 赋值，未证明逐历史 bar 填充

AI 判断：认为原文明示

影响：可见代码只在第12行写索引0，未见遍历 rates_total 的循环；若按字面运行，历史缓冲区可能只得到单点或空值，图表历史曲线可能缺失。该运行后果仍需编译和终端观察，不能当作已确认缺陷。

建议：在终端记录 rates_total、prev_calculated、Buffer[0]、Buffer[1]、Buffer[10] 等历史索引，并与直接加载 MissingVendor 的输出逐 bar 对照；确认是否需要按 rates_total 循环填充。

涉及研究维度：实现质量、数据与时序可靠性、复现与复用价值

原文依据（code）：

> Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;

原文依据（code）：

> return(rates_total);

### 中 · OnCalculate 返回 rates_total 的终端语义未验证

AI 判断：影响尚待验证的假设

影响：在 MT4 中返回 rates_total 可能让终端认为全部 bars 已计算；与仅写索引0结合，可能抑制历史重算。材料没有运行日志或编译结果，不能确定为源码缺陷。

建议：在终端观察 prev_calculated 与返回值的增量语义，比较首次加载、新 tick、切周期后的 Buffer 历史；不能仅凭函数名或检索相似性推断。

涉及研究维度：实现质量、数据与时序可靠性

原文依据（code）：

> return(rates_total);

原文依据（code）：

> Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;

### 中 · iCustom 的 shift=0 当前 bar 值可能随 tick 变化

AI 判断：影响尚待验证的假设

影响：若 shift=0 返回当前未收盘 bar，Buffer[0] 会随 tick 更新；是否重绘及其对历史显示的影响未知。不能据此宣称未来数据泄漏，也不能直接当作已确认重绘。

建议：用已收盘 bar 对照、shift=1 候选、实时/回放日志和逐 tick 快照验证 Buffer[0] 是否变化；在因子使用时固定可得时点。

涉及研究维度：数据与时序可靠性

原文依据（code）：

> Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;

### 中 · Period 参数语义、范围与外部契约未知

AI 判断：认为原文明示

影响：第4行只声明默认值14，第12行原样传给 MissingVendor；没有最小值、最大值、步长、单位或外部参数顺序证据，不能解释其经济含义或给出优化区间。

建议：取得 MissingVendor 参数契约后建立映射；在此之前仅记录默认值，不作最优参数、敏感度或收益结论。

涉及研究维度：参数可解释性、复现与复用价值

原文依据（code）：

> input int Period = 14;

原文依据（code）：

> Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;

### 低 · ShowSignal=false 只把索引0置空，隐藏全部历史输出的语义未知

AI 判断：影响尚待验证的假设

影响：第12行三元表达式仅作用于 Buffer[0]；关闭开关是否清除全部历史缓冲区未证明，可能造成显示不一致。

建议：检查关闭时是否需循环清空 Buffer 或依赖平台重绘；用图表历史输出验证，而不是仅凭单行赋值推断全部历史已隐藏。

涉及研究维度：实现质量、数据与时序可靠性

原文依据（code）：

> extern bool ShowSignal = true;

原文依据（code）：

> Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;

### 提示 · OHLCV 形参未被函数体引用，不能据此推断价格或量能输入

AI 判断：认为原文明示

影响：第8–11行声明价格、成交量和点差数组，但第12行只调用 iCustom；若把该对象误标为 OHLCV 因子会缺乏源码依据。

建议：保持 mechanism 未细分或待确认；待 MissingVendor 算法明确后再判定是否使用价格或量能，不据形参声明捏造数据因子。

涉及研究维度：逻辑清晰度、复现与复用价值

原文依据（code）：

> int OnCalculate(const int rates_total, const int prev_calculated,

原文依据（code）：

> Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;

## 研究质量评价

研究质量分：40 / 100

评价依据为静态材料，实证表现未评估。

### 逻辑清晰度 · 3 / 5

封装控制流简单：OnInit 绑定缓冲区，OnCalculate 对 Buffer[0] 做三元赋值；前序说明能区分源码事实与 AI 推断，且未发现与原文直接矛盾。但核心计算完全外包给未提供的 MissingVendor，无法形成可计算、可检验的因子逻辑，因此只能给中等分。

依据：source.code 第7行：`int OnInit() { SetIndexBuffer(0, Buffer); return(INIT_SUCCEEDED); }`；第12行：`Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;`；source.description 与 url 为空，无回测或运行证据；检索相似性不是实证。

### 实现质量 · 2 / 5

有指标基本骨架，但可见代码只给 Buffer[0] 赋值，未见遍历 rates_total 的循环，prev_calculated 也未被使用；返回 rates_total 的终端语义未验证。外部依赖 MissingVendor 未提供，无法确认运行时能否计算。该对象是指标，不因没有下单、止损或仓位控制扣分。

依据：source.code 第12–13行仅见 `Buffer[0] = ...` 与 `return(rates_total);`；第7行 SetIndexBuffer 仅为词法候选；source.structure 为 partial，不能当作编译或运行证据。

### 数据与时序可靠性 · 2 / 5

可见代码未直接使用 OHLCV 数组，也未发现把未来收益作为时点信号的写法；但 iCustom 的 shift=0 时点语义和是否重绘未知，历史逐 bar 填充未证实，资产类别与频率未声明。不能仅凭形参声明推断数据使用时序。

依据：source.code 第8–11行声明 OHLCV 等形参，第12行只调用 iCustom(...Period, 0, 0)；无时间戳、数据频率、回测或终端日志证据；前序 AI 对单点写入的推断与原文一致，但运行影响仍属未验证假设。

### 参数可解释性 · 2 / 5

Period=14 只作为 iCustom 输入转发，其单位、合法范围、步长和外部参数契约均未知；ShowSignal 是显示门控，不是已证明的收益参数。缺少 MissingVendor 定义时，参数效果无法解释，更不能给出优化结论。

依据：source.code 第4行：`input int Period = 14;`；第5行：`extern bool ShowSignal = true;`；第12行把 Period 传给 MissingVendor；材料未提供参数契约或运行配置。

### 复现与复用价值 · 1 / 5

核心依赖 MissingVendor 文件/算法缺失，受控表达式为空，automatic_experiment_ready=false，输入映射仍未完成；无法独立复现或复用为因子。当前价值主要是依赖缺失与缓冲区实现风险的样例，而不是可检验因子。

依据：source.code 第12行硬编码 `iCustom(NULL, 0, "MissingVendor", Period, 0, 0)`；portable_qualification 声明 expression missing、automatic_experiment_ready=false 且 external_dependencies 未验证；research_memory 无历史实验。

## 原理与计算逻辑

源码事实：第1-3行声明 `#property strict`、`#property indicator_chart_window`、`#property indicator_buffers 1`；第4-6行声明 Period=14、ShowSignal=true、Buffer[]；第7行 OnInit 调用 `SetIndexBuffer(0, Buffer)` 并返回 INIT_SUCCEEDED；第8-11行 OnCalculate 接收 rates_total、prev_calculated、OHLC、tick_volume、volume、spread；第12行只给 Buffer[0] 赋值 `Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;`；第13-14行返回 rates_total。数据可得时点：源码未使用 OHLCV 数组，输出取决于终端调用 OnCalculate 时 iCustom 对 "MissingVendor" 的查询；shift=0 按字面是当前 bar 的候选值（AI 推断，未运行验证），历史 bar 是否逐根可得未知。结构解析 parser=lexical-v1、status=partial，仅词法候选，未调用 MT4 编译器，不能当作运行时依赖或回测证据。

## 公式

字面计算：若 ShowSignal=true，则 B[0] = iCustom(NULL, 0, "MissingVendor", Period, 0, 0)；否则 B[0] = EMPTY_VALUE。步骤：1) OnInit 尝试把 Buffer 绑定为 0 号指标缓冲区；2) 终端每次调用 OnCalculate；3) 计算三元表达式；4) 写入 B[0]；5) return(rates_total)。未见对 B[1..rates_total-1] 的循环或增量赋值。"MissingVendor" 的内部映射 F 及 mode=0、shift=0 的运行时语义未提供，不能写出可计算的因子公式。

## 用途与条件

候选用途是按 MT4 图表窗口显示外部指标 "MissingVendor" 的当前候选值，并由 ShowSignal 控制显示或 EMPTY_VALUE；不是完整交易策略，源码未见下单、止损、仓位或风险控制。适用情景假设：外部指标文件存在且 iCustom 参数契约匹配，只需显示当前候选值；对历史曲线、回测因子、跨资产或特定频率的适用性均无材料支持。

## 输入参数与建议

### Period · int

默认值：14；类别：signal

含义：MQL4 input 输入参数；第12行作为 iCustom 的输入传给外部指标 "MissingVendor"。单位与具体语义由外部指标定义，材料未说明。

约束：源码仅声明 `input int Period = 14;`，未声明最小值、最大值、步长或可选值；未提供实际运行配置，默认值 14 不能视为部署值或优化区间。

变化影响：会改变传给 MissingVendor 的参数；由于外部指标算法未提供，无法确认对信号、缓冲区数值或显示的具体影响。

候选建议（待验证）：不宜给出实证最优范围；应先取得 MissingVendor 的参数契约与算法，再验证有效区间。

来源依据：第4行：`input int Period = 14;`；第12行：`Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;`

### ShowSignal · bool

默认值：true；类别：display

含义：MQL4 extern 外部参数；为 true 时第12行把 iCustom 结果写入 Buffer[0]，为 false 时写 EMPTY_VALUE。它是输出显示/隐藏开关性质，不改变已传入的外部指标参数。

约束：源码仅声明 `extern bool ShowSignal = true;`，未声明运行配置、联动关系或取值范围；布尔默认值 true 不是实际部署配置。

变化影响：切换 Buffer[0] 是显示外部指标值还是 EMPTY_VALUE；是否影响历史全部输出未知，因为源码只写索引 0。

候选建议（待验证）：仅作为显示开关核查；不应作为收益优化参数。需确认关闭时是否应清除全部历史缓冲区。

来源依据：第5行：`extern bool ShowSignal = true;`；第12行：`Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;`

### Buffer · double[]

默认值：未知；类别：state

含义：指标输出缓冲区数组；第7行通过 SetIndexBuffer(0, Buffer) 尝试绑定为 0 号缓冲区，第12行只写 Buffer[0]。不是用户可调输入。

约束：非用户参数；长度与索引方向由终端/平台管理，源码未显示 ArraySetAsSeries 或显式长度设置。SetIndexBuffer 仅为词法候选，运行时绑定未证明。

变化影响：承载显示输出；当前源码只写索引 0，若未逐根遍历，历史 bars 的缓冲区填充情况未知。

候选建议（待验证）：不应列入可调参数；应检查是否需要对 rates_total 逐根赋值以及缓冲区索引方向。

来源依据：第6行：`double Buffer[];`；第7行：`int OnInit() { SetIndexBuffer(0, Buffer); return(INIT_SUCCEEDED); }`；第12行：`Buffer[0] = ...`

### indicator_buffers · int

默认值：1；类别：constant

含义：编译属性声明指标缓冲区数量为 1；不是用户输入。

约束：源码硬编码属性 `#property indicator_buffers 1`，未声明可变范围；其与 SetIndexBuffer(0, Buffer) 的运行时绑定一致性未验证。

变化影响：影响平台为指标分配/绑定的缓冲区数量；改动需与 SetIndexBuffer 调用匹配。

候选建议（待验证）：不作为优化参数；若修改应重新编译并核对缓冲区绑定。

来源依据：第3行：`#property indicator_buffers 1`

### MissingVendor · string

默认值：MissingVendor；类别：constant

含义：iCustom 调用的外部指标名称，属于硬编码依赖标识。

约束：字符串硬编码在第12行；材料未提供该指标文件、算法、输入参数个数或加载证据。

变化影响：改变该名称会改变外部依赖与计算来源；当前名称可能导致依赖缺失，具体运行结果未知。

候选建议（待验证）：不应作为收益优化参数；需先提供并验证 MissingVendor 指标文件及其参数契约。

来源依据：第12行：`iCustom(NULL, 0, "MissingVendor", Period, 0, 0)`

## 来源事实

- 材料元数据：title='质量样例 · vendor_indicator'，language='mql4'，platform='MetaTrader 4'，provenance='intake'，fetch_status='not_fetched'；description 与 url 为空，未提供资产、频率、回测或有效性声明。
- 源码事实（第1-3行）：`#property strict`、`#property indicator_chart_window`、`#property indicator_buffers 1`，声明为图表窗口、1个指标缓冲区；这些是属性声明，未经原平台编译器验证。
- 源码事实（第4-6行）：`input int Period = 14;`、`extern bool ShowSignal = true;`、`double Buffer[];`；Period 与 ShowSignal 是输入/外部参数，Buffer 为数组。
- 源码事实（第7行）：OnInit 调用 `SetIndexBuffer(0, Buffer)` 并返回 `INIT_SUCCEEDED`；source_structure 将该调用标为词法候选，未证明运行时绑定成功。
- 源码事实（第8-11行）：OnCalculate 形参包含 rates_total、prev_calculated、time/open/high/low/close、tick_volume、volume、spread；代码主体未显示对这些价格或成交量数组的计算。
- 源码事实（第12行）：`Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;`；仅写索引0，未显示遍历 rates_total 的循环；iCustom 引用名称 'MissingVendor'，未提供该外部指标文件或加载证据。
- 源码事实（第13-14行）：`return(rates_total);` 结束 OnCalculate；未见交易下单、止损、仓位或风险控制代码。
- 结构解析：parser='lexical-v1'，status='partial'，仅词法候选；未调用MT4编译器，宏、类型、重载、作用域及实际执行依赖未解析；imports为空且外部依赖未加载。
- AI推断：由于只写 Buffer[0] 且未循环，若原样运行，历史 bars 的缓冲区可能不会被逐根填充；该推断未运行验证，不能当作编译、回测或收益结论。
- 未知：资产类别、数据频率、MissingVendor 的实际算法与可得性、参数最优值、收益与风险表现均无材料，不能补造。

## 分析假设

- AI推断：作者意图是把外部指标 "MissingVendor" 封装为图表指标；依据是第12行 iCustom 调用和第2行 indicator_chart_window。
- AI推断：当前源码可能只填充最新 bar 的缓冲区；依据是第12行仅写 Buffer[0]、未显示遍历 rates_total 的循环，且第13行直接 return(rates_total)。未编译或运行验证，不能视为确定缺陷。
- AI推断：iCustom 的 shift=0 可能读取当前 bar；依据是字面参数 0，但源码未注释，运行时语义未知。
- AI推断：SetIndexBuffer 可能成功绑定 0 号缓冲区；依据是第7行调用，但解析器仅给词法候选，未证明运行时成功。
- AI推断：Period 影响外部指标计算；依据是第12行把 Period 传给 iCustom，但外部算法未提供，具体影响未知。
- AI推断：ShowSignal 是显示开关而非信号参数；依据是第12行三元表达式在 false 时写 EMPTY_VALUE，且未改变传给 iCustom 的 Period。
- AI推断：该材料当前不可独立复现或评估；依据是 MissingVendor 文件、资产、频率、运行配置和回测均未提供。

## 缺失信息

- 实际运行配置未提供；`Period=14` 与 `ShowSignal=true` 仅为源码默认值，不能冒充部署参数。
- Period 的允许范围、步长、单位及其在 MissingVendor 中的语义未声明。
- MissingVendor 指标文件、算法、输入参数顺序、缓冲区/模式索引以及是否重绘未知。
- `iCustom(NULL, 0, "MissingVendor", Period, 0, 0)` 中 timeframe=0、mode=0、shift=0 的运行时语义与是否应固定为常量未知，源码未注释。
- Buffer 的索引方向、是否逐根填充、SetIndexBuffer 运行时是否成功未知。
- 资产类别、数据频率、回测、收益、风险表现和最优参数均无材料。
- 结构解析为 partial 词法候选，未调用 MT4 编译器，宏、类型、重载、作用域和实际执行依赖未验证。

## 问题与限制

源码事实：第12行仅对 `Buffer[0]` 赋值，第13行直接 `return(rates_total);`，未见以 rates_total 或 prev_calculated 驱动的循环；AI推断：若按字面运行，历史每根 bar 的缓冲区可能不会被逐一填充，prev_calculated 也未用于增量计算，但未编译或运行验证。第12行依赖外部指标 `"MissingVendor"`，材料未提供该指标文件或加载证据，无法确认输入参数顺序、缓冲区/模式索引、重绘或滞后行为。第7行 `SetIndexBuffer` 仅被词法解析为候选，运行时绑定成功与否未证明。`ShowSignal=false` 时只把 `Buffer[0]` 置为 `EMPTY_VALUE`，是否等同隐藏全部历史输出未知。源码未显示价格/成交量计算、交易下单、止损、仓位或风险控制逻辑。

## 验证计划

1) 依赖核验：取得 "MissingVendor" 指标文件或源码及参数契约，确认 iCustom 参数个数、mode=0、shift=0 和缓冲区索引语义。2) 编译与静态检查：在 MT4 编译器验证第7行 SetIndexBuffer 与第3行 indicator_buffers 一致，检查 Buffer 的索引方向、ArraySetAsSeries 和逐根填充。3) 运行观察：在图表加载后记录 rates_total、prev_calculated、Buffer[0]、Buffer[1]、Buffer[10] 等值和日志，验证是否只写索引0以及 ShowSignal=false 时是否只清空单点。4) 对照验证：将本封装输出与直接加载 MissingVendor 的输出逐 bar 对照，检查重绘或滞后。5) 敏感度：在外部指标参数契约允许范围内改变 Period、切换 ShowSignal、缺失依赖与存在依赖、不同 shift 候选；不给出最优参数。6) 样本外：仅在 MissingVendor 算法与数据口径明确后，按多个资产和时间框架划分样本内外验证显示数值一致性；当前材料不足以进行收益、风险或参数晋级验证。

## 自动提取的研究候选

提取范围：仅第1–14行源码、既有 identify/parameters/research 记录与分类候选词表。边界：源码只有 1 次 SetIndexBuffer（第7行）与 1 次对 Buffer[0] 的三元赋值（第12行），无算术、无窗口函数、无循环、无过滤条件组合，唯一数值来源是黑箱平台函数 iCustom 调用外部指标 "MissingVendor"，其文件、算法、参数契约、mode/shift 语义均未提供，故只能给出 1 个待研究特征候选并 expression=null，不为凑数编造均线、RSI、区间或收益型因子。未列为候选的项及原因：ShowSignal 是同一三元表达式内的显示门控（原文 "ShowSignal ? ... : EMPTY_VALUE"），与宿主赋值不可分离，若单独建 display 候选会与同一变换重复；Buffer[]/indicator_buffers 是缓冲区与编译属性，不是可研究特征；OnCalculate 的 OHLC/tick_volume/volume/spread 形参在函数体内未被引用（第12行未用），不能据形参声明捏造价格或成交量因子。role 判断：该值在源码中的直接用途是图表窗口输出（第2行 indicator_chart_window），但它是唯一可复用的数值特征，故按「待研究特征」记为 role=factor、family=other；若下游按严格用途口径重判为 display，不改变其黑箱与未知性质。未执行编译、未访问终端、未运行回测；source_structure 为 lexical-v1/partial 词法候选，不代表编译或运行通过。材料未声明资产类别、数据频率、收益或参数最优值，本报告不作任何此类结论。

### MissingVendor 封装输出值（iCustom 直通，写 Buffer[0]）

第12行把外部指标 "MissingVendor" 在 mode=0、shift=0 下的返回值（受 ShowSignal 门控）写入输出缓冲区第 0 个元素，是材料中唯一可辨识的数值输出，故作为待研究特征占位。外部指标算法、参数契约、单位与是否重绘均未知，机制无法归类，family 记 other；未经编译、运行或回测，不声明任何预测力、有效性或收益。

字面赋值（第12行）：B[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE。流程：1) OnInit 尝试 SetIndexBuffer(0, Buffer)（第7行，仅词法候选，运行时绑定未验证）；2) 终端调用 OnCalculate；3) 求三元表达式：ShowSignal 为真取 iCustom(NULL,0,"MissingVendor",Period,0,0)，为假取平台空值 EMPTY_VALUE；4) 写 B[0]；5) return(rates_total)。未见对 B[1..rates_total-1] 的循环或增量赋值，prev_calculated 未被使用。iCustom 内部映射 F（MissingVendor 算法、mode=0、shift=0 的运行时语义）未提供，无法写出等价可计算公式。

限制与待验证项：expression=null 原因：核心依赖 iCustom（平台黑箱函数）不在支持算子集合内，其内部映射 F 与 mode/shift 语义未知，编造等价公式会伪造语义。其他边界：源码只写 Buffer[0]，未见遍历 rates_total 的循环，prev_calculated 未使用，历史 bar 填充情况未知（AI 推断，未运行验证）；ShowSignal=false 只把索引 0 置为 EMPTY_VALUE，是否等同隐藏全部历史输出未知；"MissingVendor" 为硬编码字符串常量，材料未给出可选值集合，故不作字符串枚举参数建模，仅记入 dependencies；Period 的合法范围、步长与单位未声明，不建 domain；未使用 OnCalculate 的 OHLC/tick_volume/volume/spread 形参，不能据此推断价格或量能输入；解析为 lexical-v1/partial，未编译、未运行、未回测；资产类别、频率、收益、风险与最优参数均无材料，本项不作有效性声明。

## AI 定义修订

原始提取保留；以下是独立修订假设，不能把结构通过当作原平台修复、等价或收益证据。研究质量分仍评价原资料。

### MissingVendor 封装输出值（iCustom 直通，写 Buffer[0]） · 尚未解决

无法修订为受控定义。源码第12行仅把 ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE 写入 Buffer[0]；iCustom 与外部指标 MissingVendor 的算法、参数契约、mode=0/shift=0 语义、返回单位及缺失行为均未提供，EMPTY_VALUE 的平台哨兵含义也未声明。受控算子不含 iCustom，不能把黑箱外部指标替换为等价表达式，也不能删除该依赖。源码未见遍历 rates_total 的循环，prev_calculated 未使用，输出是逐 bar 序列还是仅索引0未知；因此无法构造保留时点、单位与缺失规则的新定义。保持原候选，不发布伪造定义。

仍待核对：外部指标 "MissingVendor" 的文件、算法、内部缓冲区索引语义、参数契约与返回单位均未提供，无法展开为受控表达式。；MQL4 iCustom 在 symbol=NULL、timeframe=0、mode=0、shift=0 下的运行时语义、错误返回值及缺失值处理未给出，无法确认输入时点与缺失规则。；源码只写 Buffer[0]，且 OnCalculate 函数体内没有遍历 rates_total 的循环、prev_calculated 未被使用；历史 bar 是否填充、序列方向与索引含义未知。；EMPTY_VALUE 的平台哨兵表示、可比较性或是否等同缺失值未声明，无法在定义中安全表达 ShowSignal=false 分支。；SetIndexBuffer(0, Buffer) 仅为词法候选，运行时绑定是否成功、缓冲区数量与绘图属性未验证。；iCustom 中 symbol=NULL 与 timeframe=0 对应的实际图表品种和周期未在材料中具体化，资产类别与数据频率未知。；Period=14 与 ShowSignal=true 是源码默认值；其部署配置、合法范围、步长及传给 MissingVendor 后的语义未知。；无法判断该输出应建模为单点标量、最新 bar 值还是完整时间序列，也无法确认 ShowSignal 关闭时是否应清除全部历史缓冲区。

原文依据（code）：

> int OnCalculate(const int rates_total, const int prev_calculated,
>                 const datetime &time[], const double &open[], const double &high[],
>                 const double &low[], const double &close[], const long &tick_volume[],
>                 const long &volume[], const int &spread[]) {
>     Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;
>     return(rates_total);
> }

原文依据（code）：

> int OnInit() { SetIndexBuffer(0, Buffer); return(INIT_SUCCEEDED); }

原文依据（code）：

> input int Period = 14;

原文依据（code）：

> extern bool ShowSignal = true;

## 首轮实验规划

阻断项（据此 initial_proposal=null）：
1) 无受控表达式。第12行 `Buffer[0] = ShowSignal ? iCustom(NULL, 0, "MissingVendor", Period, 0, 0) : EMPTY_VALUE;` 的唯一数值来源是平台黑箱 iCustom 与未提供的外部指标 "MissingVendor"（文件、算法、参数契约、返回单位、缺失行为均缺）。factor.expression=null，portable_qualification 该条 expression=missing、automatic_experiment_ready=false；lag/smooth/zscore/ts_rank 等受控算子无法承载该依赖，写成等价公式即伪造语义。
2) 输入无法映射到 OHLCV。已声明输入为 missingvendor_value / chart_symbol / chart_timeframe；第8–11行 OHLCV 形参在函数体内未被引用（第12行只用 iCustom），不能据形参声明把它们映射为 open/high/low/close/volume。symbol=NULL、timeframe=0 对应品种与周期未具体化，资产类别与频率未知，data_requirement 无法写出。
3) 参数默认值不足以成组：可表示为有限 JSON 的只有 Period=14（第4行 `input int Period = 14;`）与 ShowSignal=true（第5行 `extern bool ShowSignal = true;`）。但 Period 的合法范围、步长、单位与在 MissingVendor 内的语义未声明；ShowSignal 是显示门控（第12行 false 时写 EMPTY_VALUE），不应作为收益优化参数。缺少第二个可联动数值轴，也无可依据的枚举，故不做单轴对角线扫描。
4) 输出形态与时序未知。源码只写 Buffer[0]，未见遍历 rates_total 的循环，prev_calculated 未使用，第13行 `return(rates_total);` 的终端语义未验证（AI 推断，未运行）。无法判断该输出是逐 bar 序列还是仅单点，因而窗口参数（1–2000整数）与滞后语义无从建立；EMPTY_VALUE 是否可比较、能否等同缺失未声明，gate/缺失处理也不能假定已消除缺失。
5) 无可辩护的阈值与执行尺度。units 为 platform_specific 且未知；任何 threshold、direction、退出滞回、止损止盈、持仓上限都缺尺度依据，把该值>0 当多头信号属无意义转换。因此本批也省略 strategy，而非默认沿用做多/空仓模型。
附带省略说明：evolution 需至少一个可计算父代与结构单位匹配的片段，crossover 需第二父代为布尔过滤条件，均不成立；walk_forward 需明确行情与口径、每折容纳基线与参数组，前提缺失时声明折数/窗口会暗示已验证，故一并省略。费用/滑点/间隔等假设在此不设定，避免被误读为已适配账户。
补齐后可检验的范围（不声称已做）：a) 取得 MissingVendor 源码与参数契约，核对 mode=0、shift=0、缓冲区索引与缺失返回值；b) 与直接加载该指标逐 bar 对照，记录 rates_total、prev_calculated、Buffer[0]/[1]/[10]，判定是否逐根填充与是否重绘；c) 明确品种、周期与逐 bar 可得时点后，再讨论窗口与阈值，并将费用/滑点/隔离间隔明确标注为实验假设。
证据边界：源码事实=第3–7行属性与声明、SetIndexBuffer(0,Buffer)、第12–13行赋值与返回；作者主张=无（description/url 为空）；AI 推断=历史 bar 可能未填充、shift=0 可能随 tick 变化；未知=品种、频率、外部算法、单位、收益与最优参数。本轮未运行、未回测，不声称有效或获利。

## 历史研究依据与判断

冻结 research_memory 扫描结果为 experiments=0、feedback=0、comparisons=0、fixed_validations=0，items 为空；本轮没有历史实验、外部反馈、直接对照或固定验证可引用。未提供历史不等于不存在失败或反例，也不能据此补造表现、收益或最优参数。本轮不采用、不拒绝任何历史记录。
