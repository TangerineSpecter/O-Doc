# 质量样例 · channel：均线偏离度与零轴上穿信号（通达信）

该材料是一个仅 7 行、无外部依赖的通达信词法级指标原型：以收盘价 C 相对 N=20 周期均线的偏离度为状态量，再以上穿零轴作为 BUY 信号，另有 M=5 平滑显示列。源码事实层面可确认的仅包括第 2–7 行的赋值与一个布尔条件结构；本机解析为 parser=lexical-v1、status=partial，diagnostics 明确“仅词法结构候选，未调用原平台编译器”，因此不构成编译或运行证据。研究价值在于它是一个结构极简、可逐行复现的时序价格结构原型，适合作为“偏离度状态变量 + 阈值穿越事件”这一类信号的对照基线，并用于检验实现口径（MA/REF 边界、是否重绘、信号可得时点）对结论的影响；材料没有样本区间、频率、标的、回测、成本或收益信息，N/M 经第 1 行注释声明为内部常量而非外部参数，因此不能据其声称任何机制有效性或给出最优参数。

## 问题清单与严重度

审查范围：7行源码、previous 的识别/参数/研究/提取、compare（0匹配）、portable_qualification、source_structure、ai_definition_revisions；research_memory 扫描为0。未执行源码、未访问工具、未调用通达信编译器、无行情、回测、收益或最优参数。本机 parser=lexical-v1/status=partial，MA/REF 仅为同名语法候选；portable_qualification 中 factor:0 为 reusable 但 automatic_experiment_ready=false（C、BASE 需映射），factor:1/2 为 candidate 且 expression missing；ai_definition_revisions 对 SMOOTH/BUY 均 unresolved。这些是提取/可移植性边界，不是原平台源码缺陷，未单列为 source_findings。未检查项：平台编译与运行、MA/REF 精确语义、首根/缺失/停牌/复权、BASE=0 平台行为、冒号输出是否盘中更新、BUY 是否重绘、外部参数入口、实际运行配置、样本区间与成本。没有发现盈利主张不等于存在收益证据；没有发现显式未来函数也不等于时序安全。source.description 为空、url 为空、fetch_status=not_fetched，故无文档引文可用。

严重度独立于研究质量分；AI 静态判断不代表编译、运行或盈利验证。

存在严重或高影响问题，研究总分不能视为通过结论。

### 高 · BUY 依赖当前 bar 的 C_t，未定义信号与成交时点

AI 判断：影响尚待验证的假设

影响：若在 t 收盘前用 BUY_t 决策或在 t 收盘同价成交，则回测可能使用收盘后才确定的信息；若盘中计算，BUY 可能随 C_t 变化而重绘。

建议：明确信号时间戳为 t 收盘后，并采用 t+1 开盘或 t+1 收盘成交做对照；记录盘中重绘测试。

涉及研究维度：数据与时序可靠性、复现与复用价值

原文依据（code）：

> DEV:=C/BASE-1;

原文依据（code）：

> BUY:DEV>0 AND REF(DEV,1)<=0;

### 中 · REF(DEV,1) 的滞后期、首根和缺失值行为未确认

AI 判断：影响尚待验证的假设

影响：若 REF 并非简单滞后一根或首根返回异常，BUY 的上穿定义会改变；无法确认是否重绘。

建议：在通达信环境用构造序列核对 REF(DEV,1) 与滞后一项的逐点一致性，并记录首根和缺失值处理。

涉及研究维度：实现质量、数据与时序可靠性

原文依据（code）：

> BUY:DEV>0 AND REF(DEV,1)<=0;

### 中 · MA 口径未提供，BASE/DEV 无法逐点复现

AI 判断：影响尚待验证的假设

影响：N=20 的窗口含义、是否含当前 bar、边界处理不明，导致 DEV 和 BUY 与平台可能不一致。

建议：补齐平台 MA 文档并用构造序列对齐；在未确认前不将本机 MA 实现称为等价。

涉及研究维度：实现质量、复现与复用价值

原文依据（code）：

> BASE:=MA(C,N);

原文依据（code）：

> SMOOTH:MA(DEV,M);

### 中 · SMOOTH 未进入 BUY，M 对信号无作用

AI 判断：认为原文明示

影响：若研究把 M 当作信号平滑参数进行调参，结论无效；SMOOTH 只是冒号显示列。

建议：在文档中标注 SMOOTH 为 display-only；若意图平滑信号，应另建明确使用 SMOOTH 的 BUY 变体并单独验证。

涉及研究维度：参数可解释性、逻辑清晰度

原文依据（code）：

> M:=5;

原文依据（code）：

> SMOOTH:MA(DEV,M);

原文依据（code）：

> BUY:DEV>0 AND REF(DEV,1)<=0;

### 中 · BASE=0 时 DEV 的除法无防护

AI 判断：影响尚待验证的假设

影响：BASE 为零或接近零时，DEV 可能产生无穷大、异常或平台特定值，进而污染 BUY 序列；平台处理未知。

建议：用含零值和近零值的构造序列测试平台行为，并在复用实现中定义缺失或异常处理策略。

涉及研究维度：实现质量

原文依据（code）：

> DEV:=C/BASE-1;

### 中 · 仅使用 C，未声明频率、复权、停牌和标的

AI 判断：认为原文明示

影响：N=20 是 20 根 bar，不同频率或复权方式下含义不同；无法跨市场比较，也无法确定停牌和缺失值如何处理。

建议：复用前补齐数据契约：标的、市场、资产类别、频率、复权、停牌与缺失处理、样本区间。

涉及研究维度：数据与时序可靠性、复现与复用价值

原文依据（code）：

> BASE:=MA(C,N);

原文依据（code）：

> DEV:=C/BASE-1;

### 中 · N/M 仅为字面常量，实际运行配置和外部入口未知

AI 判断：认为原文明示

影响：不能把 20/5 当作实际运行配置；若平台允许外部覆盖，参数敏感性研究可能偏离原配置。

建议：记录实际运行配置；若做变体，标注为非原配置并单独验证，不将默认值冒充运行值。

涉及研究维度：参数可解释性、复现与复用价值

原文依据（code）：

> {N=20, M=5 are internal constants, not external parameter declarations.}

原文依据（code）：

> N:=20;

原文依据（code）：

> M:=5;

## 研究质量评价

研究质量分：52 / 100

评价依据为静态材料，实证表现未评估。

### 逻辑清晰度 · 3 / 5

源码按 N/M 常量→BASE→DEV→SMOOTH→BUY 顺序展开，7 行可逐行对应；前序识别对 MA/REF 未知、无收益证据的标注与原文无矛盾。扣分点：N/M 选择无依据，SMOOTH 与 BUY 的关系仅靠文本推断，数据频率与成交时点未定义；机制只到价格结构，未给出趋势或反转取向。

依据：第2–7行逐字结构；第1行作者注释；source.description 为空、无 url；无样本、回测、成本或最优参数。检索相似性不是实证。

### 实现质量 · 3 / 5

实现极简，赋值和布尔条件结构清楚；但第5行除以 BASE 无零值防护，第6行 SMOOTH 未进入第7行 BUY，MA/REF 运行时语义未验证，且本机未编译。不能把 parser partial 当源码缺陷，但也不能宣称可运行等价。

依据：第4–7行；第5行“DEV:=C/BASE-1;”；第6行“SMOOTH:MA(DEV,M);”；第7行“BUY:DEV>0 AND REF(DEV,1)<=0;”；parser=lexical-v1/status=partial。检索相似性不是实证。

### 数据与时序可靠性 · 2 / 5

信号使用当前 bar 的 C_t 和 BASE_t，逻辑上只能在 t 收盘后确定；材料未定义信号时间戳、成交时点、频率、复权、停牌和缺失处理。第7行虽用 REF(DEV,1)，但 REF 语义、首根行为、冒号输出是否盘中更新、BUY 是否重绘均未知。无显式未来函数不等于无前视；若在 t 收盘同价成交，存在前视或重绘风险。

依据：第5行“DEV:=C/BASE-1;”、第7行“BUY:DEV>0 AND REF(DEV,1)<=0;”；无数据频率、复权、成交映射或样本区间。检索相似性不是实证。

### 参数可解释性 · 3 / 5

N=20、M=5 的字面含义清楚，且第1行明确称其为内部常量；但无选择依据、可调范围或外部入口证据，实际运行值未知。M 只作用于 SMOOTH 显示列，按文本不进入 BUY，若把 M 当信号参数会误读。

依据：第1行“{N=20, M=5 are internal constants, not external parameter declarations.}”、第2行“N:=20;”、第3行“M:=5;”、第6行“SMOOTH:MA(DEV,M);”、第7行“BUY:DEV>0 AND REF(DEV,1)<=0;”；实际配置未知。

### 复现与复用价值 · 2 / 5

7 行原型适合作为“偏离度+零轴上穿”的概念基线，结构小、可手工重写；但逐点复现依赖 MA/REF 未确认语义，C/BASE 需输入映射，factor:1/factor:2 尚无受控表达式，automatic_experiment_ready=false。可用于提出新对照，不能直接视为原平台等价复现或有效策略。

依据：portable_qualification: factor:0 reusable 但 automatic_experiment_ready=false；factor:1/2 candidate、expression missing；ai_definition_revisions 对 SMOOTH/BUY unresolved；source 无数据、回测、成本。检索相似性不是实证。

## 原理与计算逻辑

源码事实与定位：第 2 行逐字“N:=20;”、第 3 行“M:=5;”设定两个内部常量；第 4 行“BASE:=MA(C,N);”以 C 的 N 周期均线作为基准；第 5 行“DEV:=C/BASE-1;”构造无量纲（比例，非百分数）偏离度；第 6 行“SMOOTH:MA(DEV,M);”对 DEV 再做 M 周期平滑，且使用冒号输出，属显示列；第 7 行“BUY:DEV>0 AND REF(DEV,1)<=0;”定义 BUY 为 DEV 由非正转为正的上穿事件。作者主张：第 1 行逐字“{N=20, M=5 are internal constants, not external parameter declarations.}”，即 N/M 非外部参数声明，与第 2–3 行一致；是否存在平台外部可调入口属未知。AI 推断及依据：按第 7 行的表达式依赖，BUY 只由 DEV 与其上一根值决定，第 6 行的 SMOOTH 未出现在第 7 行，故 SMOOTH 参数 M 不进入 BUY（推断，非作者主张）。数据可得时点：信号计算需要 C_t、BASE_t（即 N 根 C 的滚动统计）与 DEV_{t−1}，逻辑上只能在第 t 根 bar 的价格确定之后成立；第 7 行使用 REF(DEV,1) 表明显式引用历史值，但 MA、REF 在 source_structure 中仅为 syntactic name candidates（reference_semantics 声明“同名引用不证明运行时依赖”），其精确口径、首根历史不足行为、冒号输出是否随当前 bar 更新以及信号是否重绘均为未知，不能断言无未来函数。机制归类（AI 推断，非作者主张）：归为价格结构（mechanism:price_structure）与时序单序列计算（structure:time_series）；材料未在趋势延续与均值回归间给出取向，故不主张 mechanism:momentum 或 mechanism:mean_reversion。

## 公式

记 t 为 bar 序号，C_t 为第 t 根收盘价（口径未在材料逐字声明，属推断）。按源码第 4–7 行：
1) BASE_t = MA(C, N)_t，N=20；MA 的具体算法（简单/加权/是否含当前 bar）未在材料中定义，未知。
2) DEV_t = C_t / BASE_t − 1，量纲为比例；BASE_t=0 时存在除零风险，平台处理未知（第 5 行）。
3) SMOOTH_t = MA(DEV, M)_t，M=5，为冒号显示列，按代码依赖不进入 BUY（第 6 行；AI 推断）。
4) BUY_t = 1 若 DEV_t > 0 且 REF(DEV,1) ≤ 0，否则 0；其中 REF(DEV,1) 表示取上一根 DEV（第 7 行；REF 口径与首根行为未知）。
5) 等价事件表述：DEV 的零轴上穿（由非正到正），不含下穿、不含阈值带、不含持有期定义。
计算步骤（复现顺序）：先取足量历史 C 以覆盖 N 与 M 窗口及 1 根 REF → 计算 BASE → 计算 DEV → 计算 SMOOTH（显示）→ 用 DEV 与滞后 1 期的 DEV 生成 BUY。材料未给出仓位、止损、手续费、滑点或下单映射，信号到收益之间无定义。

## 用途与条件

用途（有材料依据）：usage:factor（第 4–6 行构成可独立计算的偏离度序列及平滑列）与 usage:signal（第 7 行布尔输出）；SMOOTH 的冒号输出可视为 usage:display 的候选。适用情景假设（AI 推断，未经检验）：用于单标的时序择时，把“价格相对自身 N 周期均线的位置”作为结构状态、把“上穿零轴”作为状态切换事件；若把上穿视为趋势转强，则对应趋势跟踪假设，若视为偏离修正后的回归起点，则对应均值回归假设——两种解释材料均未支持，不应默认其一。不适用/未覆盖：材料无频率（日线/分钟未知）、无标的与资产类别、无复权与停牌处理、无交易成本与执行接口，故不可直接作为可执行策略或组合模块；N/M 被作者声明为内部常量，不应把默认值当作运行配置（实际运行值未知）。

## 输入参数与建议

### N · number

默认值：20；类别：constant

含义：均线周期；源码字面常量为20，源码未显式声明类型或单位。

约束：源码固定为20；第1行注释声明N/M为内部常量、非外部参数声明；未声明可调范围、类型或外部入口（未知）。

变化影响：按代码依赖，N改变BASE:=MA(C,N)的均线窗口，进而影响DEV与BUY；窗口增大使均线更长（AI推断）。

候选建议（待验证）：作者已声明为内部常量，不建议作为收益优化参数；如需研究变体，应明确标注为非原配置并做样本外验证，具体范围未知。

来源依据：第1行：{N=20, M=5 are internal constants, not external parameter declarations.}；第2行：N:=20;

### M · number

默认值：5；类别：constant

含义：SMOOTH的平滑周期；源码字面常量为5，源码未显式声明类型或单位。

约束：源码固定为5；第1行注释声明N/M为内部常量、非外部参数声明；未声明可调范围、类型或外部入口（未知）。

变化影响：按代码依赖，M只改变SMOOTH:MA(DEV,M)的平滑窗口，不进入BUY表达式；对BUY信号无直接影响（AI推断）。

候选建议（待验证）：作者已声明为内部常量，且仅影响SMOOTH显示列；显示参数不进入收益优化，不建议据此调参。

来源依据：第1行：{N=20, M=5 are internal constants, not external parameter declarations.}；第3行：M:=5;

### BASE · number

默认值：未知；类别：state

含义：收盘价C的N周期均线状态变量；单位为价格单位。

约束：由第4行BASE:=MA(C,N)计算；MA的精确口径、N不足时边界行为均未知。

变化影响：BASE变化会通过DEV:=C/BASE-1影响偏离度，并可能影响BUY。

候选建议（待验证）：无可调参数建议；保持源码计算，待确认MA口径后再评估。

来源依据：第4行：BASE:=MA(C,N);

### DEV · number

默认值：未知；类别：state

含义：收盘价相对N周期均线的偏离度，C/BASE-1，量纲为比例（非百分数）。

约束：由第5行DEV:=C/BASE-1计算；BASE=0时存在除零风险，平台处理未知。

变化影响：DEV是BUY上穿零轴判断的核心序列；其变化改变BUY触发时点。

候选建议（待验证）：无可调参数建议；需先验证BASE=0及数据频率、复权等口径。

来源依据：第5行：DEV:=C/BASE-1;

### SMOOTH · number

默认值：未知；类别：display

含义：DEV的M周期平滑输出，使用冒号显示列。

约束：由第6行SMOOTH:MA(DEV,M)计算；M不足时边界行为未知；冒号输出为显示列。

变化影响：改变M会改变SMOOTH显示平滑程度；按代码依赖不进入BUY信号计算（AI推断）。

候选建议（待验证）：显示参数不进入收益优化；若仅用于观察，保持源码默认M=5。

来源依据：第6行：SMOOTH:MA(DEV,M);

### BUY · boolean

默认值：未知；类别：signal

含义：DEV由非正转为正（上穿零轴）的布尔信号输出。

约束：由第7行BUY:DEV>0 AND REF(DEV,1)<=0定义；REF口径、首根历史不足行为、是否重绘均未知。

变化影响：DEV与上一根DEV决定BUY；N改变会改变DEV，从而改变信号。

候选建议（待验证）：仅为信号输出，未包含仓位、止损、成本或下单接口；不应直接视为可执行策略或做收益优化。

来源依据：第7行：BUY:DEV>0 AND REF(DEV,1)<=0;

## 来源事实

- 平台与语言：来源元数据声明 language=tongdaxin、platform=通达信（非由函数名或语言推断）；该代码共 7 行，imports 为空，无外部依赖声明。本机解析结果为 parser=lexical-v1、status=partial，diagnostics 提示“仅词法结构候选，未调用原平台编译器”；因此只能确认词法可读，不构成编译或运行证据。
- 参数与常量：第 1 行为注释，逐字为“{N=20, M=5 are internal constants, not external parameter declarations.}”，这是作者主张，即 N/M 为内部常量、非外部参数声明；第 2 行“N:=20;”、第 3 行“M:=5;”与之一致。是否存在平台外部可调入口属未知。
- 计算结构：第 4 行“BASE:=MA(C,N);”、第 5 行“DEV:=C/BASE-1;”，即以收盘价 C 与其 N 周期均线之比减一作为偏离度；第 6 行“SMOOTH:MA(DEV,M);”对偏离度再做 M 周期平滑，SMOOTH 使用冒号输出（显示列）。MA、REF 仅为 syntactic name candidates（reference_semantics 明确同名引用不证明运行时依赖），未加载原平台实现，故其口径与边界处理未知。
- 信号定义：第 7 行“BUY:DEV>0 AND REF(DEV,1)<=0;”，即偏离度由非正转为正（上穿零轴）时给出 BUY 输出；材料未包含任何仓位、止损、资金管理、手续费、滑点或下单接口，故不能视作可执行策略（usage:signal 仅指信号模块）。
- 机制归类（AI 推断，非作者主张）：以价格相对均线的偏离位置及上穿零轴为核心，归为价格结构（mechanism:price_structure）与时序单序列计算（structure:time_series）；材料未区分该式用于趋势延续还是均值回归，也未验证任一方有效性，故不主张 mechanism:momentum 或 mechanism:mean_reversion。
- 数据与频率：公式仅使用 C（收盘价），可归类 data:price；未出现成交量或盘口字段，故不标注 data:ohlcv/data:orderbook。标的、市场、资产类别与数据频率（日线/分钟等）均未在材料中声明，属未知，不做猜测。
- 材料完整性：description 为空、url 为空、fetch_status=not_fetched、provenance=intake；无样本区间、无回测、无收益、无风险指标、无最优参数。tags 仅为分类提议，不代表有效性、适用性或实证晋级。

## 分析假设

- 【AI 推断】C 指当前 bar 的收盘价，BASE 为对同一 C 序列的滚动平均；依据：第 4–5 行写法“MA(C,N)”“C/BASE”，且 tags 仅含 data:price；材料未逐字说明 C 的定义，MA 算法亦未知。
- 【AI 推断】SMOOTH 不参与 BUY；依据：第 6 行“SMOOTH:MA(DEV,M);”与第 7 行“BUY:DEV>0 AND REF(DEV,1)<=0;”中没有出现 SMOOTH，故 M 只影响显示。
- 【AI 推断】BUY 为“事件型”一次触发而非“状态型”持续为真；依据：第 7 行包含 REF(DEV,1)<=0 的边沿条件。该信号未定义持有期或退出条件。
- 【AI 推断】信号最早已可在第 t 根 bar 价格确定后计算；依据：第 7 行同时依赖 DEV_t 与 REF(DEV,1)。这只是逻辑时序推断，未验证平台是否重绘或含未来函数。
- 【作者主张】N/M 为内部常量、非外部参数声明（第 1 行逐字）；是否存在外部可调入口、实际运行是否为 20/5 属未知。
- 【AI 推断】机制归为价格结构 + 时序：依据第 5–7 行以价格相对均线位置及其穿越为核心，材料未提供趋势/反转取向证据。
- 【AI 推断】该式对均价基准的偏离度与“距离均线百分比”类因子同类；这只是形式相似性判断，不构成对任何既有因子有效性的引用或背书。

## 缺失信息

- N/M是否存在平台外部可调入口，实际运行值是否仍为20/5
- 通达信MA/REF的精确口径、边界处理与首根REF行为
- 数据频率、复权方式、停牌处理、标的/市场/资产类别
- BASE=0时平台的实际行为与异常处理
- SMOOTH是否仅用于显示，是否参与未展示的其他逻辑
- BUY是否重绘或包含未来函数
- 实际运行配置、样本区间、回测、交易成本、收益与最优参数
- 源码是否还有未展示的外部参数或隐藏调用
- 是否通过通达信编译器或实盘环境验证

## 问题与限制

静态检查仅基于7行源码和lexical-v1/partial解析，未调用通达信编译器；MA、REF仅为同名语法候选，运行时口径、边界处理和作用域未验证（第4-7行）。数据仅依赖C收盘价（第4-5行），频率、复权、停牌、标的、市场、资产类别与样本区间均未声明。第5行DEV:=C/BASE-1;在BASE=0时存在除零风险，平台处理未知；MA在N不足、REF在首根历史不足时的行为未知。第6行SMOOTH:MA(DEV,M)为冒号显示输出，可能随当前bar收盘更新；第7行BUY:DEV>0 AND REF(DEV,1)<=0;是否重绘或含未来函数未验证。N/M在第1-3行声明为内部常量而非外部参数，实际运行配置与是否存在外部入口未知，不能用默认值冒充实际配置。材料无仓位、止损、手续费、滑点、下单接口、回测与收益证据，BUY仅为信号输出，不能视作可执行策略。

## 验证计划

1) 口径确认（前置，当前全部未知）：在通达信环境实际编译并运行，记录 MA 与 REF 的算法口径、N/M 窗口不足时的边界行为、首根 REF 的返回值、第 6 行冒号输出是否随当前 bar 更新、第 7 行是否重绘；用构造序列（含 BASE 接近 0 的极端值、含缺口与停牌段）验证第 5 行除零行为。未完成此步前，任何下游结果只视为候选。
2) 数据口径记录：明确标的、市场、资产类别、数据频率、复权方式、停牌与缺失处理、样本区间，并对每项标注来源；材料当前均为未知，不得在报告中补造。
3) 双实现对齐：将第 4–7 行重写为独立脚本，与平台逐 bar 对齐输出 BASE、DEV、SMOOTH、BUY，做逐点一致性检验并统计不一致 bar 数量；这是区分实现差异与策略差异的必要步骤。
4) 可得性与前视检验：比较“t 收盘计算、t 收盘成交”“t 收盘计算、t+1 开盘成交”等时序约定下的信号统计差异；若信号在 t 与 t+1 结果差异显著，说明存在时序假设敏感或前视风险。
5) 敏感度（研究性质，非推荐参数）：对 N、M 做小范围网格，明确标注为“非原配置变体”，报告信号数量、事件间隔分布、与简单基准的相关性等描述性统计；按频率（若可得日频/日内）与复权方式分层重复，观察结论是否随口径翻转。不得把任一网格点称为最优参数，除非有样本外与成本后证据。
6) 样本外与稳健性：采用时间切分（样本内定式、样本外检验）与滚动窗口，避免重叠样本；按标的、波动区制分层；补充对称对照（DEV 下穿零轴）与不含平滑/含平滑的消融对照。
7) 若进入收益评估阶段（本材料不支持）：需另行补充仓位规则、止损、手续费与滑点、成交假设，并报告样本外与多市场结果；在此之前只能报告信号结构与触发频率，不得给出收益、胜率或夏普等结论。

## 自动提取的研究候选

提取范围仅限提供的 7 行通达信源码与 previous 的识别/参数记录；未执行源码、未访问工具、无回测、无收益、无最优参数。parser=lexical-v1/status=partial，仅表示词法可读，不构成编译或运行证据。提取 DEV 为 factor、SMOOTH 为 display、BUY 为 signal；BASE 作为 DEV/SMOOTH/BUY 的中间依赖，不单独建候选。N/M 按 previous 记录为内部常量而非外部可调参数。expression 仅在 DEV 以 BASE 为输入时可声明；MA/REF 未由本词汇定义，SMOOTH/BUY 保留 expression=null 并说明平台依赖。

### DEV

收盘价 C 相对 N 周期均线 BASE 的比例偏离度，源码以 C/BASE-1 构造，量纲为比例而非百分数。

DEV_t = C_t / BASE_t - 1，其中 BASE_t = MA(C,N)_t，N=20；MA 的具体算法、边界处理与 C 的逐字定义未知。

限制与待验证项：源码事实仅能确认第4-5行的赋值结构；MA 未由本词汇定义，无法确认均线算法、是否含当前 bar、N 不足时行为。第5行 BASE=0 时存在除零风险，平台处理未知。数据频率、复权、停牌、标的与市场未知。expression 将 BASE 视为 input，不展开 MA(C,N)，因 MA 精确语义未确认；不能据此声称因子有效或可编译。

### SMOOTH

对 DEV 再做 M 周期平滑的显示列；源码使用冒号输出，按代码依赖未进入 BUY 表达式（AI 推断，非作者主张）。

SMOOTH_t = MA(DEV,M)_t，M=5；DEV_t = C_t/BASE_t - 1，BASE_t = MA(C,N)_t；MA 口径未知。

限制与待验证项：源码仅显示 SMOOTH:MA(DEV,M) 为冒号显示输出；是否仅用于显示、是否随当前 bar 更新、是否参与未展示逻辑均未知。MA 未由本词汇定义，不能编造等价可执行表达式；因此 expression=null。材料无频率、标的、回测或收益证据，不能声称该显示列有效或最优。

### BUY

DEV 由非正转为正的上穿零轴事件，源码输出布尔 BUY；仅为信号模块，不含仓位、止损或下单接口。

BUY_t = 1 若 DEV_t > 0 且 REF(DEV,1) <= 0，否则 0；DEV_t = C_t/BASE_t - 1，BASE_t = MA(C,N)_t，N=20；REF 口径未知。

限制与待验证项：REF 未由本词汇定义，且平台可能重绘、首根历史不足行为未知，故 expression=null，不把 REF 冒充为已支持算子。BUY 仅由 DEV 与其上一根值构成事件型信号，未定义持有期、退出、仓位、止损、手续费、滑点或下单映射；不能视作可执行策略。材料无回测、收益或最优参数。

## AI 定义修订

原始提取保留；以下是独立修订假设，不能把结构通过当作原平台修复、等价或收益证据。研究质量分仍评价原资料。

### SMOOTH · 尚未解决

无法将 SMOOTH 修订为受控表达式。源码仅给出 SMOOTH:MA(DEV,M)，而材料没有 MA 的函数正文、窗口边界、缺失值、是否含当前 bar 或权重规则；DEV 又依赖 BASE:=MA(C,N) 中同样未知的 MA。把 MA 改写为 sma 或其他平均会引入未经原文支持的等价假设，因此保留原候选并明确未解决项。

仍待核对：MA 的精确算法、权重、是否包含当前 bar、窗口不足和缺失值处理均未提供，不能确认其与任何受控平滑算子等价。；SMOOTH 的输出时点、是否重绘、是否仅用于显示，材料未明确。；DEV 依赖 BASE:=MA(C,N)，BASE 的 MA 口径未知，因此 DEV 序列的精确计算仍不完整。；C 的复权、停牌、数据频率和缺失处理未逐字定义。；M=5 的数值类型、单位及平台是否允许外部覆盖未知；仅能确认源码字面赋值和内部常量注释。；BASE 为零时 DEV 的除法行为及平台异常处理未知。；M 窗口不足时 MA(DEV,M) 的返回值或截断规则未知。

原文依据（code）：

> SMOOTH:MA(DEV,M);

原文依据（code）：

> M:=5;

原文依据（code）：

> DEV:=C/BASE-1;

原文依据（code）：

> BASE:=MA(C,N);

原文依据（code）：

> {N=20, M=5 are internal constants, not external parameter declarations.}

### BUY · 尚未解决

无法将 BUY 修订为受控表达式。源码给出 BUY:DEV>0 AND REF(DEV,1)<=0，但材料未提供 REF 的函数正文，无法确认 REF(DEV,1) 是否等价于受控 lag(DEV,1)，也无法确认首根历史不足、缺失值和重绘行为。DEV 还依赖未展开的 BASE:=MA(C,N)，其中 MA 语义同样未知，因此不构造替代定义。

仍待核对：REF 的精确语义未提供，不能确认 REF(DEV,1) 等价于 lag(DEV,1)。；REF 在首根或历史不足时的返回值、缺失值传播规则未知。；BUY 是否重绘或含未来函数未知。；DEV 依赖 BASE:=MA(C,N)，而 MA 的算法、边界和缺失规则未知。；C 的复权、停牌、数据频率和缺失处理未逐字定义。；BASE 为零时 DEV 的除法行为及平台异常处理未知。；源码的比较与布尔 AND 在缺失值或非数值上的平台规则未知。；N=20 仅能确认源码字面赋值及内部常量注释，平台是否允许外部覆盖未知。

原文依据（code）：

> BUY:DEV>0 AND REF(DEV,1)<=0;

原文依据（code）：

> DEV:=C/BASE-1;

原文依据（code）：

> BASE:=MA(C,N);

原文依据（code）：

> {N=20, M=5 are internal constants, not external parameter declarations.}

## 首轮实验规划

源码事实：factor:0 的受控表达式仅把 BASE 当作输入（“DEV:=C/BASE-1;”），而 BASE 来自“BASE:=MA(C,N);”且未展开；portable_qualification 将 C、BASE 列为 inputs_requiring_mapping，automatic_experiment_ready=false。C 在材料中被称为“收盘价”，但未逐字定义频率、复权、停牌口径；BASE 不是 open/high/low/close/volume 之一，MA 口径、是否含当前 bar、N 不足与 BASE=0 行为均未知。factor:1 “SMOOTH:MA(DEV,M);” expression=null 且为显示列；factor:2 “BUY:DEV>0 AND REF(DEV,1)<=0;” expression=null，REF 首根、缺失与重绘行为未知。N=20、M=5 仅为源码字面常量，第1行作者主张“N=20, M=5 are internal constants, not external parameter declarations.”，不能当作外部调参入口或实际运行配置；且 M 按文本不进入 BUY（AI推断）。因不存在全部输入可明确映射到 OHLCV 且表达式受控的 factor/signal/filter，无法构造合规 seed；亦不能据此设置 evolution/walk_forward、阈值、费用或止损止盈。可检验范围（待补齐后）：先确认 MA/REF 语义与 C 数据契约，双实现对齐 DEV/BUY，检查 BASE=0、首根、重绘和 t→t+1 成交；再讨论 N 的样本外敏感性与事件频率。缺什么：BASE 的 OHLCV 可计算定义或平台 MA 正文；REF 语义；C 的明确映射与频率/复权/停牌；平台外部参数入口与实际配置；可用于收益评价的仓位/成本假设。历史扫描为0（experiments/feedback/comparisons/fixed_validations 均0），无历史实验可提出下一轮独立假设，不能补造结果。

## 历史研究依据与判断

本次 research_memory 扫描 experiments=0、feedback=0、comparisons=0、fixed_validations=0，eligible 均为0，scan_limits 未触及预算；暂无历史实验、反馈、直接对照或固定公式评价可引用，memory_assessment 为空数组。不能据历史相似性补造表现分或外推当前候选有效性。
