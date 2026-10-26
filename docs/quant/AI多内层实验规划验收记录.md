# AI多内层实验规划验收记录

日期：2026-10-26。应用1.5.53、量化schema56，无新增数据库迁移。当前规则见[多内层时序验证](./多内层时序验证说明.md)，完整目标见[重构规格](../requirements/007-AI量化研究系统重构.md)。本记录覆盖AI主动规划到受控行情计算的一例及合同回归，不表示整体目标完成。

后续1.5.54已接入[全部窗口参数复核](./跨窗口参数稳定性说明.md)及解读12；本记录的提供商调用、原始规划和实验捕获范围保持不变。

## 当前行为与版本边界

来源工作流16/跨源码17的设计阶段、实验解读11/冻结上下文6、反馈选择5共用planning_capabilities v1。能力说明包含v1/v2窗口、最低长度、内层均值选择、预热、总尝试/时限及未知条件。多个参数或公式探索可优先采用多内层，简单研究允许v1或不提出方案。来源和反馈可提出完整config，实验解读的下一轮proposal必须沿用原execution.config，不能擅自改变验证策略。

全部业务JSON沿用户已确认范围进入WebDAV/FTP/SFTP；没有新增执行权限。旧来源14/15、解读10/上下文5、反馈选择4及更早合同保留原提示和字段；旧Python报告续作继续继承原冻结上下文。恢复只校验业务事实，不检索、调用模型、计算行情、执行上传代码或恢复队列。修改后重算哈希也不能扩大冻结能力。

## 一次真实规划调用

使用用户已配置的deepseek-flash，原提供商配置只在内存读取，不导出凭据。使用隔离的内存SQLite与临时媒体；本机Docker PostgreSQL仅以只读事务读取指定模型配置，没有迁移或写入真实业务库。普通沙箱首次读取Docker套接字被拒绝，发生在调用前；随后获准读取，真实提供商调用合计只有1次。

输入来自已保存的真实Python分析：报告`1ca918b801b843e2ba921109367664da`、原任务`e876704812c24e7da605ccfb9e8390f3`、来源`d523c6388cdf3c3e26b5a3aa65e1980f60db1d39`。原任务是工作流14，本次只以其不可变阶段事实和词表构造新的16版plan输入，没有伪造新完整AIRun或重新发布完整报告。源码的未来标签不作为交易信号，受控候选是close/sma(period)-1。

调用上限1次、120秒、禁用提供商重试；实际51.944秒，用量记录完整，总计23152 tokens。AI原始返回通过服务端合同校验：

- 声明默认参数仍为period=14，候选为7/10/20/28；它们是待检验假设，没有把候选写成实际运行值或最优值。
- 3个外折，每外折3个内层，expanding，训练40/验证10/测试10、额外预热28、gap2；总预算16次、2代、30秒，费用和滑点各5bps。
- 最低需要136根：2+28+40+3×10+3×10+2×(2+1)。标的、频率和价格口径未知时明确提出数据要求，不声称已有足够行情。
- 区分受控表达式与原生pandas执行，注明交易方向是假设、内层历史重叠和非独立性，保留失败与未知条件。

这证明一个实际模型能在已有分析上主动给出可校验的多内层方案。没有实测所有代码语言、新完整源码报告、所有模型或多次规划质量。

## 归档真实行情与独立数值核对

零新增模型调用执行该原始方案。行情来自此前已归档的[Binance官方2024年1月BTCUSDT小时K线](https://data.binance.vision/data/spot/monthly/klines/BTCUSDT/1h/BTCUSDT-1h-2024-01.zip)，744行；规范化CSV SHA256为`14b48319e5e446d15d8add8f3cc5d9728c0d96469591265f8e9efbe61eb05b68`，数据快照哈希为`f29e3fbc33c25932cc75d4be125ac792317e8c6e8aa9873ab294fcca619cc199`。

该行情此前已参与研究，本次明确属于开发复核，不能当成新数据、独立验证或证据晋级。生产受控表达式引擎quant-local-search-7完成16次尝试和全部3个外层测试；计算只运行受控表达式，未启动原始源码执行容器或连接交易账户。

三个外层净收益分别为-1.132507%、-0.975475%、-2.087031%，全部亏损。它们是各段独立空仓起止的收益，没有拼接成连续组合，也没有通过挑选外层成绩修改参数或结论。本例不支持参数有效的主张。

独立`nested_planning_reference.py`使用45位Decimal，自行计算限定表达式的SMA、缺失传播、上一已收盘信号到下一开盘成交及现金账本；不导入产品表达式、模拟器或搜索计算。核对全部候选内层及选中外层/同成本基线，共102段，最大指标绝对误差7.494005416219807e-16。另有小型手算两边成本用例。该参考器只适用于这份固定表达式和成本，不能推广为任意公式/策略或平台语义认证。

## 捕获与零调用重放

[清单](./验收记录/2026-10-26-nested-planning-manifest.json)绑定6份原始/派生材料的SHA256：[输入](./验收记录/2026-10-26-nested-planning-input.json)、[模型返回](./验收记录/2026-10-26-nested-planning-response.json)、[校验后方案](./验收记录/2026-10-26-nested-planning-plan.json)、[用量](./验收记录/2026-10-26-nested-planning-usage.json)、[调用摘要](./验收记录/2026-10-26-nested-planning-summary.json)和[独立生成的实验结果](./验收记录/2026-10-26-nested-planning-experiment.json)。原调用摘要与后续行情计算分开，不把派生实验冒充原模型输出。

重放检查旧真实快照哈希、来源/报告/阶段身份、冻结词表、逐字提示和输入指纹，再规范化实际返回、重算受控实验、验证同步结果合同及独立数值参考。无需提供商、网络、数据库读写、源码执行或真实行情重新下载：

```sh
UV_CACHE_DIR=/private/tmp/odoc-uv-cache uv run --python 3.11 python -m quant.acceptance.nested_planning_replay
```

运行强制内存SQLite且关闭执行队列，兼容Django测试运行器的共享内存URI；磁盘/外部数据库或启用执行队列在读取材料前拒绝。原提供商捕获、旧研究和业务库没有因重放改写。

## 自动检查与pure local

新增回归包括三入口能力冻结/原提示兼容、来源方案到实际引擎和同步、复盘全部内层输入、反馈方案保存但不自动执行、能力篡改拒绝及上述实际捕获零调用重放。第一次全量暴露旧版夹具夹带新字段，已纠正夹具，不放宽旧合同；随后新增重放测试暴露内存URI误拒绝，已修正并增加隔离负对照。

最终quant及system_settings.tests.SyncManagerTests共638项通过，175.542秒；新增规划专项7项单独通过。测试使用quant.test_settings、内存SQLite与临时媒体，真实外部服务关闭。日志`/private/tmp/odoc-ai-nested-full-verified.log`和`/private/tmp/odoc-ai-nested-capture-final.log`。旧deepseek-flash原稿续作捕获在schema56下零新调用重放，仍为revise→reject、旧报告不变、0源码执行和0恢复任务；该兼容检查不构成新的模型质量放行，日志`/private/tmp/odoc-ai-nested-native-compat.log`。

Node22量化140项测试通过，type-check、整个量化前端目录及相关Hook/类型/纯逻辑/local样例lint零错误零警告，构建通过并保留既有大chunk提示。全局lint当前有5错误/347警告，错误来自与HEAD无差异且本批未修改的AgentPostShare正则、RecipeAdventureEffects三个条件Hook及vite.config.d.ts解析，本批没有修复无关模块。日志`/private/tmp/odoc-ai-nested-front-final.log`、`odoc-ai-nested-type-final.log`、`odoc-ai-nested-quant-lint.log`、`odoc-ai-nested-build.log`及`odoc-ai-nested-lint.log`。

pure local保留原历史，新增“AI 多内层方案 · 本地验收”，粘贴显式人工标记的Python源码后自动生成报告、候选和3外折×3内层方案，无需用户手写报告。界面中的收益、评分及分析全为人工样例，没有真实模型或行情执行。已在1440/768/390宽度核对方案展示、原始参数组、预热与内外折预填；130行样例少于所需133行时禁用启动，未缩短窗口迎合数据。另核对空数据、接口错误、慢加载刷新期间操作禁用及恢复，切回样例后34条原/新研究和本方案仍在，无501或真实后端透传。

临时截图`/private/tmp/odoc-ai-nested-proposal-1440.png`、`odoc-ai-nested-proposal-768.png`、`odoc-ai-nested-proposal-390.png`、`odoc-ai-nested-prefill-390.png`、`odoc-ai-nested-error-768.png`、`odoc-ai-nested-empty-768.png`及`odoc-ai-nested-loading-768.png`。本轮未连接真实后端浏览器。makemigrations --check --dry-run无变更，git diff --check及新增材料凭据模式检查通过；未运行dev.sh、真实迁移、部署或远端同步。

## 完整目标剩余范围

任意标签跨度剔除及最终留出治理、跨请求搜索家族/多重检验、所有内层联合稳定区域、Pine/MQ4/通达信/聚宽/EA原生执行、全局语义依赖增量、专家质量基线与多模型重复评审、真实后端部署和远端多设备同步仍有待完成内容。本次单例结果不能把整体目标改为“只差验收”。
