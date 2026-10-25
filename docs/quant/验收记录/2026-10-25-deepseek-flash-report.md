# QA bands and RSI（Pine v2 策略）

材料是一个 Pine v2 的 TradingView 策略骨架。源码事实仅支持：用 close 计算 RSI、SMA 和标准差；当 RSI 穿越 50 且 close 穿越布林带边沿同时成立时，以 stop=lower/upper 提交多空入场；第18行只显示中轨。未提供作者说明、资产、频率、回测或成交结果，因此研究价值主要是语义复现、执行假设审计和参数敏感度设计，而不是收益结论。分类候选 platform:tradingview、data:price、mechanism:volatility、mechanism:momentum、usage:signal、usage:display、tunability:signal 仅作索引，不证明适用性或有效性。

## 问题清单与严重度

审查范围：仅凭 source.code（18行；行首数字前缀不属于原代码，证据引文不含前缀）、source.description（空）、source.url（空）、source_structure（lexical-v1，status=partial，仅词法候选）、parameters/research 提取、portable_qualification、ai_definition_revisions 与空的 research_memory（scanned 全 0，budget_limited=false）。未检查/未知：未访问 TradingView 编译器、未运行、未回测；Pine v2 的 rsi/sma/stdev 自由度、warmup、na 传播、crossover/crossunder 等号处理、strategy.entry(stop=) 成交与拒单语义均未由材料证明；资产类别、周期、佣金、滑点、初始资金、仓位、作者与描述均未提供，故无作者盈利主张可核对（也未发现作者主张）。基于文本未见 security()、[] 前视或未来收益引用，这不等于运行时证明无重绘。研究流程边界（不计为源码问题）：本机未编译、source_structure 仅 partial；portable_qualification 仅 factor:5 display gate 通过引用/类型检查且自动实验未就绪，factor:0-4 表达式缺失并被标为未验证原平台上下文；ai_definition_revisions 选中 0-3 全为 unresolved，属修订假设未成立而非等价证据。compare.scanned=0，无结构相似对照，检索相似不构成实证。缺少材料处一律保留未知，不补造行情、收益、最优参数或放行结论。

严重度独立于研究质量分；AI 静态判断不代表编译、运行或盈利验证。

存在严重或高影响问题，研究总分不能视为通过结论。

### 高 · 条件成立后以 stop=lower/upper 入场，触发价与成交时点未声明

AI 判断：影响尚待验证的假设

影响：第14行要求 close 上穿 lower，第15行却以 stop=lower 做多；条件在收盘成立时价格已在 stop 另一侧，订单是下一 bar 触发、按 stop 价成交、立即按市价成交还是被拒，源码与材料均未说明（第16-17行空头对称问题）。这直接决定入场价、滑点与信号可执行性，也使不同实现间的复现结果不可比。

建议：在 Pine v2 或明确版本的参考实现中单独验证 strategy.entry(stop=) 在价格穿越 stop 后的行为，把“下一 bar 开盘/触价/拒单”作为情景而非事实记录；语义确定前不要把该策略视为可交易或可回测结论来源。

涉及研究维度：实现质量、数据与时序可靠性、复现与复用价值

原文依据（code）：

> strategy.entry("L", strategy.long, stop=lower)

原文依据（code）：

> if crossover(r, RSIoverSold) and crossover(close, lower)

### 中 · 多空 RSI 阈值同为 50，命名与数值矛盾且无缓冲带

AI 判断：认为原文明示

影响：RSIoverSold 与 RSIoverBought 都写死为 50，多头 crossover 与空头 crossunder 共用同一水平，源码未提供缓冲带；变量名暗示超卖/超买分离，但数值无分离，源码也未说明是否为占位值。相邻 bar 反复翻转的可能性属机制推断，未回测，不能量化换手或收益。

建议：保留该写死语义作为基线；若要研究阈值分离，应作为新的代码变体单独验证并声明为假设，不得把 50 解释为作者选定或最优。

涉及研究维度：参数可解释性、逻辑清晰度

原文依据（code）：

> RSIoverSold = 50

原文依据（code）：

> RSIoverBought = 50

### 中 · 关键阈值与带宽倍数硬编码为普通赋值，非 input

AI 判断：认为原文明示

影响：第6-8行是普通赋值而非 input，参数面板无法修改；任何“调参”都改变源码语义，与 input 参数不可同日而语。BBmult 未声明正负约束，负值会使 lower/upper 互换（机制推断）。这使敏感性分析必须先定义代码变体，否则口径混淆。

建议：若需评估带宽或阈值敏感性，新建明确声明的代码变体并标注与原语义的差异；先声明 BBmult 为正数约束再讨论取值范围。

涉及研究维度：参数可解释性

原文依据（code）：

> BBmult = 2.0

原文依据（code）：

> RSIlength = input(6, minval=1)

### 中 · 默认 200 根窗口的 warmup/na 未做任何处理

AI 判断：认为原文明示

影响：BBlength 默认 200，源码文本无最小历史检查或 na 过滤；历史不足时 b、d、lower、upper 可能为 na，而 crossover/crossunder 与 strategy.entry 收到 na 时的行为未由材料证明。若前段信号被抑制或订单异常，会改变回测起点与信号计数；具体后果未知。

建议：用不足 200 根与恰好 200 根的合成序列核对信号与订单是否被 na 抑制，并在复现时显式规定最小历史长度与起始评估点。

涉及研究维度：数据与时序可靠性、实现质量

原文依据（code）：

> BBlength = input(200, minval=2)

原文依据（code）：

> b = sma(close, BBlength)

### 中 · 未声明是否等 bar 收盘确认，实时 bar 重算行为未知

AI 判断：影响尚待验证的假设

影响：信号基于 close 及由 close 派生的指标；若在未收盘 bar 上评估，crossover/crossunder 可能瞬时成立后消失，使图表信号与 bar 收盘确认的回测不一致。源码未声明 calc 时机或确认条件，材料也未提供平台语义，因此重绘风险既未被证实也未被排除。

建议：对比 bar 内实时信号与收盘确认信号并记录差异数量与时点；在得到证据前不宣称无重绘，也不把图表瞬时信号当作可执行信号。

涉及研究维度：数据与时序可靠性

原文依据（code）：

> if crossover(r, RSIoverSold) and crossover(close, lower)

原文依据（code）：

> r = rsi(close, RSIlength)

### 中 · stdev 的总体/样本自由度与 na 传播未声明，带宽数值口径不明

AI 判断：认为原文明示

影响：第11行用 stdev(close, BBlength) 作为带宽基础，源码未声明自由度（n 还是 n-1）、na 传播和实时更新规则；同一段收盘价序列会得到不同 d，从而改变 lower/upper 与穿越判定。本机受控算子 std 不能直接冒充 stdev，比较结论必需先固定该口径。

建议：以平台文档或对照实现确定自由度与 na 规则，用合成序列（常数、单调、已知方差的序列）校准 d 的数值，再讨论信号敏感性。

涉及研究维度：数据与时序可靠性、复现与复用价值

原文依据（code）：

> d = BBmult * stdev(close, BBlength)

原文依据（code）：

> lower = b - d

### 中 · 策略未声明仓位、费用与退出规则

AI 判断：认为原文明示

影响：第2行只声明 overlay=true，未见 qty、commission、slippage、初始资金；第15/17行仅入场，无 exit/close 调用，反向持仓如何了结（是否依赖后续反向 entry）未声明。因此无法复现盈亏、回撤或换手，任何收益类判断都缺必要参数。

建议：从原平台策略属性或作者说明补齐仓位与费用设定；缺失时仅做语义复现与信号计数，明确不生成收益或风控结论。

涉及研究维度：实现质量、复现与复用价值

原文依据（code）：

> strategy("QA bands and RSI", overlay=true)

原文依据（code）：

> strategy.entry("S", strategy.short, stop=upper)

### 低 · ShowBands 名称与实际绘制内容不符，仅画中轨

AI 判断：认为原文明示

影响：第18行在 ShowBands 为 true 时输出中轨 b，为 false 时输出 na；源码文本未绘制 upper/lower，故该开关不控制上下轨。使用者可能按名称预期在图上看到带宽，从而误读信号位置；源码未说明这是有意还是遗漏。

建议：核对原始意图；若需显示上下轨须新增 plot 并单独验证，不得假设默认会显示带边。

涉及研究维度：逻辑清晰度

原文依据（code）：

> plot(ShowBands ? b : na)

原文依据（code）：

> ShowBands = input(true)

## 研究质量评价

研究质量分：56 / 100

评价依据为静态材料，实证表现未评估。

### 逻辑清晰度 · 3 / 5

结构很短，第9-13行的计算链（r/b/d/lower/upper）与变量命名基本对应公式，读者能还原复合信号；但核心入场逻辑存在语义冲突：第14行 `crossover(close, lower)` 要求 close 上穿下轨，第15行却用 `stop=lower` 下单做多，源码未说明此时订单是回踩触发、立即成交还是其它（第16-17行空头同理）。另外第6-7行 RSIoverSold 与 RSIoverBought 命名反义却同为 50，源码无缓冲带；第18行 ShowBands 名义上“显示带”，实际只 plot 中轨 b。这三点使意图无法仅凭源码唯一确定，故不超过3。依据仅为18行文本与空 description，无作者说明可交叉核对。

依据：source.code 第14-15行 `if crossover(r, RSIoverSold) and crossover(close, lower)` / `strategy.entry("L", strategy.long, stop=lower)`；第6-7行 `RSIoverSold = 50`、`RSIoverBought = 50`；第18行 `plot(ShowBands ? b : na)`。source.description 与 url 为空，缺失项：作者意图、资产、频率、成交口径。

### 实现质量 · 3 / 5

代码干净、无多余结构，计算与下单分离；但作为 strategy 存在多处未声明：第2行 strategy() 只设 overlay=true，未声明 qty、commission、slippage、初始资金，第15/17行只有 entry 而无 exit/close 调用；默认 BBlength=200 却无最小历史或 na 保护；stop= 准入语义未在源码中定义。这些属于执行与状态层面的缺口，非语法错误，故给3而非更高。本机未编译、未回测，不以其解析状态替代实现判断。

依据：source.code 第2行 `strategy("QA bands and RSI", overlay=true)`；第15行 `strategy.entry("L", strategy.long, stop=lower)`；第17行 `strategy.entry("S", strategy.short, stop=upper)`；第4行 `BBlength = input(200, minval=2)`。缺失项：仓位、费用、退出规则、na 过滤。

### 数据与时序可靠性 · 3 / 5

文本层面只出现 close，未见 security() 或显式未来引用，第9-13行均由当根 close 派生，这是有利证据但只是文本事实，不等于运行时无重绘。未声明是否等 bar 收盘确认，实时 bar 上 crossover/crossunder 与 close 的重算行为未知；BBlength=200 的 warmup 与 na 传播未处理；第11行 stdev 的总体/样本自由度未声明，会直接改变 lower/upper 的数值口径。无任何证据表明使用了未来收益或未来价格，因此不判泄漏，但因上述未知项不给高分。

依据：source.code 第9-13行 `r = rsi(close, RSIlength)`、`b = sma(close, BBlength)`、`d = BBmult * stdev(close, BBlength)`、`lower = b - d`、`upper = b + d`。缺失项：收盘确认策略、Pine v2 的 na/warmup 规则、stdev 自由度；未检查项：编译与回测。

### 参数可解释性 · 3 / 5

三个 input 有明确默认值与硬下限（RSIlength minval=1、BBlength minval=2、ShowBands 布尔），用途可读；但关键量写死：`BBmult = 2.0`、两个 RSI 阈值均 50，属普通赋值而非 input，任何“调参”都改变源码语义；两个阈值同值且命名与数值矛盾，源码未声明二者关系或间隔；BBmult 未声明正负约束，负值会交换 lower/upper。参数含义大体可理解但有实质局限，故3。

依据：source.code 第3-5行 `RSIlength = input(6, minval=1)`、`BBlength = input(200, minval=2)`、`ShowBands = input(true)`；第6-8行 `RSIoverSold = 50`、`RSIoverBought = 50`、`BBmult = 2.0`。缺失项：阈值设计理由、倍数正负约束、实际运行配置。

### 复现与复用价值 · 2 / 5

18行代码足够短，理论上可逐行移植做语义复现，这是主要价值。但阻断项明确：portable_qualification 中 factor:0-4 的 expression 均为 missing（rsi/stdev/crossover/crossunder/strategy.entry 不在受控词汇或语义未证明），仅 factor:5（display gate）references/types 通过，且全部 automatic_experiment_ready=false、外部依赖状态为 declared_unverified_original_context；ai_definition_revisions 选中 0-3 全部 unresolved，未提供等价定义，不能当作等价证据。加之无资产、频率、费用、回测与收益，复用价值受限，故2。这些是本机提取与映射边界，不据此反判原平台源码有缺陷。

依据：portable_qualification factor:0 `"尚无受控表达式；保留原平台片段，需要补齐计算语义后才能检查引用和类型。"`；factor:5 `"表达式输入、参数引用均有声明；内嵌树无外部执行或未声明函数调用。"` 且 `automatic_experiment_ready`: false。source.code 第15行 `strategy.entry("L", strategy.long, stop=lower)` 无声明式等价。

## 原理与计算逻辑

源码事实：第1行 `//@version=2`；第2行 `strategy("QA bands and RSI", overlay=true)`；第3-5行定义 `RSIlength = input(6, minval=1)`、`BBlength = input(200, minval=2)`、`ShowBands = input(true)`；第6-8行 `RSIoverSold = 50`、`RSIoverBought = 50`、`BBmult = 2.0` 是普通赋值而非 input。第9-13行计算 `r = rsi(close, RSIlength)`、`b = sma(close, BBlength)`、`d = BBmult * stdev(close, BBlength)`、`lower = b - d`、`upper = b + d`。第14-15行多头条件为 `if crossover(r, RSIoverSold) and crossover(close, lower)`，随后 `strategy.entry("L", strategy.long, stop=lower)`；第16-17行空头条件为 `if crossunder(r, RSIoverBought) and crossunder(close, upper)`，随后 `strategy.entry("S", strategy.short, stop=upper)`。第18行 `plot(ShowBands ? b : na)` 仅绘制中轨，未直接绘制 upper 或 lower。数据可得时点：历史 bar 上 close 在收盘后确定，信号只能在对应 bar 收盘后稳定；实时 bar 上 close 仍会变化，是否等待收盘确认、是否重绘源码未声明，未知。源码只显式使用 close，未调用成交量、盘口或财务数据。来源元数据声明 language=pine、platform=TradingView，但资产类别与频率未声明。source_structure status=partial，仅词法候选，未调用原平台编译器；rsi/sma/stdev/crossover/crossunder 和 strategy.entry 的运行时语义未由材料证明，未知。

## 公式

设 N1=RSIlength（默认6），N2=BBlength（默认200），m=BBmult（默认2.0），θ=50。r_t=RSI(close,N1)_t；b_t=SMA(close,N2)_t；d_t=m*stdev(close,N2)_t；lower_t=b_t-d_t；upper_t=b_t+d_t。多头触发：crossover(r_t,θ)=真 且 crossover(close_t,lower_t)=真；按常见定义即 r_{t-1}≤θ<r_t 且 close_{t-1}≤lower_{t-1}<close_t，等号与严格不等号的处理以平台实现为准，未知。空头触发：crossunder(r_t,θ)=真 且 crossunder(close_t,upper_t)=真；常见定义为 r_{t-1}≥θ>r_t 且 close_{t-1}≥upper_{t-1}>close_t，同上未知。触发后分别提交 stop=lower_t 的多头入场和 stop=upper_t 的空头入场；成交价、滑点、是否立即成交、仓位大小未在源码声明。默认两个 RSI 阈值同为50，源码未提供缓冲带。stdev 的总体/样本自由度与 na 传播未在源码声明，未知。

## 用途与条件

用途：作为 TradingView 图表上的信号与显示模块候选，研究 RSI 阈值穿越与布林带边沿穿越的双重确认，以及波动率缩放带宽对信号频率的潜在影响。适用情景假设：仅价格序列可得、按 bar 收盘评估、可接受 stop 入场语义审计的时序研究；资产类别和频率未声明，不能由 Pine 语言或函数名推断为股票、加密资产或某周期。显示用途仅中轨 b；第18行未见 upper/lower 绘制，ShowBands 不控制上下轨。该结构不是完整风控或执行系统，不能直接视为可交易策略。

## 输入参数与建议

### RSIlength · int

默认值：6；类别：signal

含义：RSI 计算回看的 K 线根数（bars），用作 rsi(close, RSIlength) 的窗口长度；单位未在源码中声明，按函数惯例为 bar 数（AI 推断）。

约束：源码仅声明 minval=1（下限 1）；上限、步长、枚举与参数间关系均未声明。未提供实际运行配置，默认值 6 不能视为作者选定或最优。

变化影响：窗口越短，r 对价格变化越敏感，crossover(r, RSIoverSold) 触发次数预期增多；窗口越长，r 越平滑、信号越稀疏。该影响为机制推断，无回测支持。

候选建议（待验证）：在源码硬下限（≥1）之上，可在明确标注为待验证假设的前提下比较若干整数窗口（例如较小的短周期取值），不宣称任何取值为实证最优；先确认编译与回测口径再评估。

来源依据：RSIlength = input(6, minval=1)

本机实验将检查：RSIlength ≥ 1

约束由 AI 根据下列原文提取，语义仍需核对；未结构化的文字约束不会自动执行。

原文依据（code）：RSIlength = input(6, minval=1)

### BBlength · int

默认值：200；类别：signal

含义：布林带中轨 sma(close, BBlength) 与标准差 stdev(close, BBlength) 的窗口长度（bar 数，依函数惯例，源码未显式声明单位）。

约束：源码声明 minval=2（下限 2）；上限、步长未声明。仅约束 BBlength 本身，源码未声明与 RSIlength 的大小关系，不添加关系约束。默认 200 需要至少 200 根历史数据才能得到有效值（AI 推断，源码未处理 na）。

变化影响：窗口越长，中轨 b 与带宽 d 越平滑，价格穿越 lower/upper 的次数预期减少；窗口越短，带宽对近期波动更敏感，穿越更频繁。此为机制推断，未经回测。

候选建议（待验证）：在硬下限（≥2）之上，可对待验证的整数窗口做敏感性分析；默认 200 较长，若数据历史不足会长期无效，需先核实数据长度与 na 处理，再讨论取值。

来源依据：BBlength = input(200, minval=2)

本机实验将检查：BBlength ≥ 2

约束由 AI 根据下列原文提取，语义仍需核对；未结构化的文字约束不会自动执行。

原文依据（code）：BBlength = input(200, minval=2)

### ShowBands · bool

默认值：true；类别：display

含义：显示开关：为 true 时 plot 输出中轨 b，为 false 时输出 na（不绘制）。仅影响显示，源码文本未见其对 entry 条件的引用。

约束：布尔输入，源码未声明其他取值或依赖；不参与信号计算（依据第 18 行仅用于 plot）。显示参数不进入收益优化。

变化影响：只改变图上中轨是否可见，不改变 r、b、d、lower、upper 或入场逻辑；源码未绘制 upper/lower，故该开关并不控制上下轨的显示（AI 推断）。

候选建议（待验证）：无优化建议；保持默认 true 仅为显示选择，需在图表层面确认是否与名称预期一致。

来源依据：ShowBands = input(true)

本机实验将检查：枚举：True、False

约束由 AI 根据下列原文提取，语义仍需核对；未结构化的文字约束不会自动执行。

原文依据（code）：ShowBands = input(true)

### RSIoverSold · int

默认值：50；类别：constant

含义：多头条件中 crossover(r, RSIoverSold) 的 RSI 阈值水平，无单位（RSI 指标值）。

约束：源码为普通赋值而非 input（第 6 行），运行期不可通过参数面板修改；未声明取值区间。与 RSIoverBought 同为 50，源码未声明两者的大小关系或间隔要求。

变化影响：改动需修改源码；阈值位置决定 crossover 触发点。由于该值与 RSIoverBought 相等，多头穿越 50 与空头穿越 50 共用同一水平，源码未提供缓冲带。

候选建议（待验证）：非可调参数；若后续研究要参数化，需明确改变源码语义并重新验证，不把任何阈值称为实证最优。

来源依据：RSIoverSold = 50

### RSIoverBought · int

默认值：50；类别：constant

含义：空头条件中 crossunder(r, RSIoverBought) 的 RSI 阈值水平，无单位（RSI 指标值）。

约束：源码为普通赋值而非 input（第 7 行），运行期不可调；未声明取值区间，未声明与 RSIoverSold 的关系（仅可观察到两者都被写死为 50）。

变化影响：改动需修改源码；阈值决定 crossunder 触发点。与 RSIoverSold 相等意味着多空阈值无分离，源码未说明这是有意设计还是占位值。

候选建议（待验证）：非可调参数；如需评估阈值分离，应作为新的代码变体单独验证，并注意不得用默认值或相等关系反推声明范围。

来源依据：RSIoverBought = 50

### BBmult · float

默认值：2.0；类别：constant

含义：布林带带宽倍数：d = BBmult * stdev(close, BBlength)，无单位（标准差的倍数）。

约束：源码为普通赋值而非 input（第 8 行），运行期不可调；未声明取值区间或正负约束。负数会使 lower/upper 反转（AI 推断，源码未声明）。

变化影响：倍数越大，lower 越低、upper 越高，close 穿越带边越难触发；倍数越小，穿越越频繁。此为机制推断，未经回测。

候选建议（待验证）：非可调参数；若研究带宽敏感性，应参数化后单独验证，并先声明正数约束，不宣称某倍数为实证最优。

来源依据：BBmult = 2.0

## 来源事实

- 来源元数据声明 language=pine、platform=TradingView、provenance=intake、fetch_status=not_fetched；代码第1行 `//@version=2`，第2行 `strategy("QA bands and RSI", overlay=true)`。未提供作者、URL 与描述，description/url 为空。
- 第3-5行定义三个 input：`RSIlength = input(6, minval=1)`、`BBlength = input(200, minval=2)`、`ShowBands = input(true)`。第6-8行 `RSIoverSold = 50`、`RSIoverBought = 50`、`BBmult = 2.0` 在源码中是普通赋值，不是 input（依据逐字引文与词法解析候选）。
- 第9-13行计算：`r = rsi(close, RSIlength)`、`b = sma(close, BBlength)`、`d = BBmult * stdev(close, BBlength)`、`lower = b - d`、`upper = b + d`。源码只显式使用 `close` 价格序列，未出现成交量、盘口或财务数据调用。
- 第14-15行多头条件为 `crossover(r, RSIoverSold) and crossover(close, lower)`，并调用 `strategy.entry("L", strategy.long, stop=lower)`；第16-17行空头条件为 `crossunder(r, RSIoverBought) and crossunder(close, upper)`，并调用 `strategy.entry("S", strategy.short, stop=upper)`。
- 第18行 `plot(ShowBands ? b : na)` 仅条件显示中轨 `b`；源码文本未直接绘制 `upper` 或 `lower`。
- 词法结构 status=partial，诊断说明仅为词法候选、未调用原平台编译器，宏、类型、重载、作用域和实际执行依赖未解析；imports 为空。builtin 函数名（rsi/sma/stdev/crossover/crossunder 等）按源码文本出现，不能被解析结果证明运行时可用。
- 资产类别、交易频率、数据完整性、回测/收益/风险结果、最优参数、实际编译或运行情况均未提供，未知；不得由 Pine 语言或函数名推断资产与频率。

## 分析假设

- AI推断：RSIlength 和 BBlength 的单位按 Pine 指标惯例为 bar 数；依据是 `input(6, minval=1)`、`input(200, minval=2)` 与 `rsi(close, RSIlength)`、`sma(close, BBlength)`，源码未逐字声明单位。
- AI推断：BBlength=200 意味着至少约 200 根历史 bar 才可能得到有效中轨和带宽；源码未见 na 过滤，前段无效值的具体行为未知。
- AI推断：stdev 的自由度、na 传播和极小窗口行为不能由函数名确定；需平台语义或独立实现核对。
- AI推断：crossover/crossunder 的等号处理、同一 bar 上两个条件的求值顺序和实时 bar 重算行为未声明；公式中的常见定义不是平台证明。
- AI推断：第15/17行 stop=lower/upper 的成交语义存疑；条件在收盘时成立，而 stop 是触价型参数，实际是下一 bar 触发、立即成交、拒单还是其他行为，材料未提供。
- AI推断：两个 RSI 阈值都写死为50，系统没有多空缓冲带，相邻 bar 可能反复翻转；这是机制推断，未回测。
- AI推断：ShowBands 仅进入第18行 plot 的三元表达式，未出现在第14-17行入场条件，因此它只影响中轨显示，不影响信号。
- AI推断：源码只显式调用 close，未出现成交量、盘口或财务数据；因此数据需求候选为价格序列，但不能据此确定资产或频率。
- AI推断：未提供作者、URL、描述、运行配置、佣金、滑点、初始资金和仓位规则；默认值只是源码默认，不代表作者实盘或最优参数。
- AI推断：第18行只画 b 而未画 upper/lower，ShowBands 名称与实际显示范围可能不一致；原始意图未知。

## 缺失信息

- 未提供作者、URL、描述与任何说明文本，参数意图未知。
- 未提供实际运行配置（是否默认值、目标品种、周期、手续费与滑点）。
- 未提供回测/收益/风险和最优参数结果，任何取值建议均无实证支持。
- 未声明资产类别与数据频率（Pine 语言本身不构成证据）。
- rsi/sma/stdev 在窗口为 1 或 2 等极小值、以及历史不足 200 根时的 na 与边界行为未知。
- strategy.entry 使用 stop= 的成交语义、是否允许反向/重复入场、是否设置默认 quantity 均未在源码声明，未知。
- 未调用 TradingView 编译器，未验证版本 2 下 plot/strategy.entry 重载与兼容性。
- 是否存在源码之外的补充参数（如策略属性、初始资金、佣金）未知；材料中未见。
- 未提供 upper/lower 是否应显示的原始意图，ShowBands 与绘制内容不一致的原因未知。

## 问题与限制

1) 阈值重叠：第 6–7 行 RSIoverSold 与 RSIoverBought 均为 50，多空 RSI 触发共用同一水平，源码未给出缓冲带；同一 bar 上 crossover 与 crossunder 互斥，但相邻 bar 可能来回翻转（AI 推断）。2) 入场语义可疑：第 15 行 strategy.entry("L", strategy.long, stop=lower) 以 stop（止损/触价单）方式在 lower 价位做多，第 17 行以 stop=upper 做空；以带边作为触发价的 stop 单在条件已成立时的实际成交与滑点行为未提供，属实现风险，需平台语义核实。3) 数据长度/na：BBlength 默认 200（第 4、10、11 行），历史不足 200 根时 b、d、lower、upper 可能为 na，而源码未见 na 过滤；rsi/sma/stdev 在 Pine v2 的 na 处理未验证（未知）。4) 重绘与实时更新：crossover/crossunder 基于 close 序列（第 9、14、16 行），在未收盘 bar 上的实时重算与信号确认时点未提供，回测与实盘一致性未知。5) 显示不一致：第 18 行 plot 仅绘制中轨 b，未绘制 upper/lower，ShowBands 名称与实际显示内容不符（第 5、18 行）。6) 解析限制：source_structure status=partial，仅词法候选，未调用平台编译器；rsi/sma/stdev/crossover/crossunder/strategy.entry 的运行时可用性与重载未证明，宏、类型、作用域未解析（diagnostics）。7) 资产与频率：材料未声明资产类别、周期与数据口径，不能由 Pine 语言或函数名推断。8) 常量与可调参数混用：RSIoverSold/RSIoverBought/BBmult 写死在源码（第 6–8 行），任何“调参”需改代码，不能当作 input 优化。9) 未提供实际运行配置，默认值（6/200/true/50/50/2.0）仅为源码默认，不代表作者实盘或回测设置。

## 验证计划

1) 语义复现：在 TradingView Pine v2 或独立参考实现中逐行复刻第3-18行，优先确认 rsi/sma/stdev/crossover/crossunder 的窗口、na、等号和实时更新语义，并记录编译器版本。2) 单元测试：用常数序列、单调序列、单次穿越、恰好等于阈值、历史不足200根、窗口取 minval 边界等合成数据核对信号和 na。3) 执行审计：单独验证 `strategy.entry(stop=...)` 在条件成立时价格已在 stop 另一侧的行为，比较收盘确认与下一 bar 开盘成交、滑点和佣金假设；把成交语义不确定性列为情景而非事实。4) 时点与重绘：比较 bar 内实时信号与 bar 收盘确认信号，检查是否存在重绘；所有回测使用当时可得数据，禁止未来函数。5) 敏感度：在源码声明的硬下限之上对 RSIlength、BBlength 做有限网格，对 BBmult 和 RSI 阈值作为代码变体做单因素敏感度；报告信号数、换手、回撤、胜率等分布和稳定性，不宣称最优。6) 样本外：按时间切分参数选择段与样本外段，若频率和资产确定后再做滚动或 walk-forward；与 RSI-only、band-only、买入持有等基线比较。7) 显示核对：确认 ShowBands 是否应同时控制 upper/lower，避免把显示开关误当信号参数。

## 自动提取的研究候选

仅提取源码中可分离的 RSI 指标、布林带半宽、长/空复合信号、stop 入场执行调用和布林带中轨显示门控；未执行源码、未回测、未验证收益或最优参数。未单独提取 b/lower/upper 作为候选以避免重复：b 在显示候选中内联，lower/upper 作为长空信号与执行候选的依赖在 formula/limitations 中说明。rsi/stdev/crossover/strategy.entry 的平台语义未由材料证明，相关 expression 置 null；display 表达式仅使用已声明的 sma/gate，并假设 Pine sma 与声明式 sma 语义一致，尚未验证。未提取 risk/filter 候选，因为没有独立可分离且语义足够明确的风控或过滤模块。

### rsi_value

源码用 close 与 RSIlength 计算 RSI 指标 r，作为后续阈值穿越条件的输入；是独立时序动量指标，但平台 rsi 语义未验证。

r_t = RSI(close, RSIlength)_t（源码写作 r = rsi(close, RSIlength)）

限制与待验证项：expression=null：rsi 不是本词汇已支持算子，不能编造等价公式；na/warmup、极值窗口与实时 bar 更新行为未知。

### bollinger_band_half_width

源码以 close 的 BBlength 窗口标准差乘以 BBmult 得到布林带半宽 d；反映波动缩放后的带宽，是长空信号 lower/upper 的组成项。

d_t = BBmult * stdev(close, BBlength)_t（源码写作 d = BBmult * stdev(close, BBlength)）

限制与待验证项：expression=null：stdev 不是本词汇已支持算子，且总体/样本自由度与 na 传播未证明；不能把 std 直接冒充 Pine stdev。

### long_entry_condition

多头触发条件要求 RSI 上穿 RSIoverSold 且 close 上穿 lower 同时成立；随后源码以 stop=lower 提交多头入场。这是复合信号，不是单一收益因子。

long_trigger_t = crossover(r_t, RSIoverSold) and crossover(close_t, lower_t)，其中 r_t=RSI(close,RSIlength)_t，lower_t=b_t-d_t，b_t=SMA(close,BBlength)_t，d_t=BBmult*stdev(close,BBlength)_t。条件成立后执行 strategy.entry("L", strategy.long, stop=lower)。

限制与待验证项：expression=null：crossover/rsi/stdev 非本词汇支持算子或平台语义未证明；等号处理、同一 bar 求值顺序、实时 bar 重算与 na 行为未知；stop 入场成交语义未知。

### short_entry_condition

空头触发条件要求 RSI 下穿 RSIoverBought 且 close 下穿 upper 同时成立；随后源码以 stop=upper 提交空头入场。这是复合信号，不是单一收益因子。

short_trigger_t = crossunder(r_t, RSIoverBought) and crossunder(close_t, upper_t)，其中 r_t=RSI(close,RSIlength)_t，upper_t=b_t+d_t，b_t=SMA(close,BBlength)_t，d_t=BBmult*stdev(close,BBlength)_t。条件成立后执行 strategy.entry("S", strategy.short, stop=upper)。

限制与待验证项：expression=null：crossunder/rsi/stdev 非本词汇支持算子或平台语义未证明；等号处理、同一 bar 求值顺序、实时 bar 重算与 na 行为未知；stop 入场成交语义未知。

### stop_entry_execution

源码在多头/空头条件成立时分别调用 strategy.entry，并用 stop=lower/upper 指定触价参数；本候选只覆盖下单与成交语义，不生成信号。

多头条件成立时：strategy.entry("L", strategy.long, stop=lower)；空头条件成立时：strategy.entry("S", strategy.short, stop=upper)。

限制与待验证项：expression=null：strategy.entry 是平台专用调用，无声明式等价；成交价、滑点、佣金、仓位大小、是否立即触发/拒单、stop 在条件成立后的实际成交行为均未知；不能视为已验证执行。

### band_display_gate

第18行用 ShowBands 三元表达式条件绘制布林带中轨 b：为 true 时输出 b，否则输出 na；不控制 upper/lower，也不影响入场条件。

display_t = ShowBands ? SMA(close,BBlength)_t : na（源码写作 plot(ShowBands ? b : na)）

限制与待验证项：表达式假设 Pine sma 与声明式 sma 语义一致，未在平台验证；仅显示中轨，不显示 upper/lower；ShowBands 不进入 entry 条件；na 处理未声明。

## AI 定义修订

原始提取保留；以下是独立修订假设，不能把结构通过当作原平台修复、等价或收益证据。研究质量分仍评价原资料。

### rsi_value · 尚未解决

源码事实显示 r = rsi(close, RSIlength)，且 RSIlength 为 input(6, minval=1)；但 rsi 不属于该阶段受控算子，Pine v2 中 RSI 的 warmup、na 传播、实时 bar 更新及等值行为未由材料证明。按约束不得用不等价的简单平均替代 RSI，因此本次不能给出可结构检查的完整定义。

仍待核对：Pine v2 rsi(close, length) 的精确计算式、warmup 长度、na 传播规则与实时 bar 重算行为未知；RSI 的时间窗口单位虽由 input 文本暗示为 bar 数，但源码未显式声明单位；rsi 不在受控算子集合中，缺少其可声明的等价组合，且不得用不等价简单平均替代

原文依据（code）：

> r = rsi(close, RSIlength)

原文依据（code）：

> RSIlength = input(6, minval=1)

### bollinger_band_half_width · 尚未解决

源码事实显示 d = BBmult * stdev(close, BBlength)，BBlength 为 input(200, minval=2)，BBmult 为普通赋值 2.0 而非 input。受控算子中有 std，但材料未声明 Pine v2 stdev 的总体/样本自由度、na 与 warmup 语义；不能用 std 直接冒充 stdev。因此本次不能安全内联为完整受控表达式。

仍待核对：Pine v2 stdev(close, BBlength) 的总体/样本自由度、warmup、na 传播及实时 bar 行为未知；受控 std 与 Pine stdev 是否等价未由材料证明，不能直接替换；BBmult 是普通赋值常量而非 input；若后续需要参数化，其是否保持原语义需另行定义，不能从默认值推断约束

原文依据（code）：

> d = BBmult * stdev(close, BBlength)

原文依据（code）：

> BBmult = 2.0

原文依据（code）：

> BBlength = input(200, minval=2)

### long_entry_condition · 尚未解决

源码事实显示多头条件为 crossover(r, RSIoverSold) and crossover(close, lower)，并随后执行 strategy.entry("L", strategy.long, stop=lower)；其中 lower = b - d，b 与 d 分别依赖 sma、stdev，r 依赖 rsi。rsi、stdev、crossover 的平台语义及 strategy.entry 成交语义均未由材料证明，且不能猜测 crossover 的等值处理。因此不能形成完整且可检查的受控表达式。

仍待核对：Pine v2 rsi 与 stdev 的精确计算、warmup、na 传播及自由度未知；crossover 在等值、跳空和实时 bar 重算时的行为未知，不能用 gt/lt 与 lag 的简单组合无依据替代；strategy.entry 的 stop 触价、成交价、同 bar 求值顺序、拒单与仓位语义未知；b 与 d 的中间变量展开目前受 stdev 语义缺失阻断

原文依据（code）：

> if crossover(r, RSIoverSold) and crossover(close, lower)

原文依据（code）：

> lower = b - d

原文依据（code）：

> strategy.entry("L", strategy.long, stop=lower)

原文依据（code）：

> RSIoverSold = 50

### short_entry_condition · 尚未解决

源码事实显示空头条件为 crossunder(r, RSIoverBought) and crossunder(close, upper)，并随后执行 strategy.entry("S", strategy.short, stop=upper)；其中 upper = b + d，b 与 d 分别依赖 sma、stdev，r 依赖 rsi。rsi、stdev、crossunder 的平台语义及 strategy.entry 成交语义均未由材料证明，且不能猜测 crossunder 的等值处理。因此不能形成完整且可检查的受控表达式。

仍待核对：Pine v2 rsi 与 stdev 的精确计算、warmup、na 传播及自由度未知；crossunder 在等值、跳空和实时 bar 重算时的行为未知，不能用 gt/lt 与 lag 的简单组合无依据替代；strategy.entry 的 stop 触价、成交价、同 bar 求值顺序、拒单与仓位语义未知；b 与 d 的中间变量展开目前受 stdev 语义缺失阻断

原文依据（code）：

> if crossunder(r, RSIoverBought) and crossunder(close, upper)

原文依据（code）：

> upper = b + d

原文依据（code）：

> strategy.entry("S", strategy.short, stop=upper)

原文依据（code）：

> RSIoverBought = 50

本次修订预算最多4项，另有 1 项保留待处理；不将其视为通过。

## 首轮实验规划

本轮不生成 initial_proposal，原因是缺少可进入首轮实验的受限表达式 signal/filter/factor。源码事实：第14-17行以 `if crossover(r, RSIoverSold) and crossover(close, lower)`、`strategy.entry("L", strategy.long, stop=lower)`、`if crossunder(r, RSIoverBought) and crossunder(close, upper)`、`strategy.entry("S", strategy.short, stop=upper)` 定义复合入场；但 factor:2/3 的 expression=null，portable_qualification 为 expression missing、automatic_experiment_ready=false，并声明 rsi/stdev/crossover/crossunder/strategy.entry 属 declared_unverified_original_context。factor:0 依赖 `r = rsi(close, RSIlength)`，RSI 算子与 warmup/na 语义未证明；factor:1 依赖 `d = BBmult * stdev(close, BBlength)`，stdev 自由度与 na 未证明，且 `BBmult = 2.0` 是普通赋值常量而非 input，不能当作可调参数默认值。factor:4 是执行模块，不是 factor/signal/filter，且无声明式等价。唯一有表达式的是 factor:5 `band_display_gate`，第18行 `plot(ShowBands ? b : na)`，其 role=display，参数为 BBlength=200 与 ShowBands=true；虽然 portable_qualification 的 references/types 通过，但它只控制中轨显示，`ShowBands` 不得用于收益优化，不能作为交易信号父代。因此不满足“存在受控表达式的 factor/signal/filter”这一前提。可行研究范围仅为语义复现准备：先取得 rsi、stdev、crossover、crossunder、strategy.entry(stop=) 的平台或受控实现语义，明确 close 输入映射、warmup（BBlength=200 至少约200根为AI推断）、na 与收盘确认规则；再在合成常数/单调/单次穿越序列上核对信号和成交。当前阻碍：无资产、周期、数据口径；无 signal 表达式；无成交与仓位语义；无历史实验（research_memory scanned 全0）；不能编造默认值、阈值、费用、滑点、收益或最优参数。故不声明已运行、已验证或可自动实验。

## 历史研究依据与判断

本次 research_memory 为空：method=library-history-v3，scope=same_collection，scanned 中 experiments/feedback/comparisons/fixed_validations 均为 0，eligible 全为 0，omitted_for_size=0，scan_limits 显示 budget_limited=false、size_limited=false、chars_read=0，即未触及时间或读取预算但库中无可用记录。因此没有可引用的历史实验（含失败与成本）、外部反馈、直接固定样本对照或冻结公式评价；不采用、不排除任何历史线索，也不存在“看过的历史数据算新留出”的问题。缺口：无同机制历史可比，任何关于 RSI 阈值同为 50 或 200 窗口带宽对信号频率、换手、回撤的影响都只是本次 AI 机制推断，必须通过新的、可失败的合成与真实数据实验补证；本报告的静态评分不因缺少历史而提高，也不把空历史当作通过证据。未提供的记录不能推定为不存在失败或反例。
