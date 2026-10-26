# 逐窗AI参数解读与一次真实请求验收

日期：2026-10-26。适用应用1.5.56、量化schema58；本地实现和隔离验收，未部署。当前计算与评分规则见[跨窗口参数稳定性](./跨窗口参数稳定性说明.md)，整体目标仍以[完整规格](../requirements/007-AI量化研究系统重构.md)为准。

## 本次补齐的行为

实验解读13沿用冻结上下文6、跨窗口计算和experiment-research-v2评分门槛。多内层实验必须提交window_reviews，恰好覆盖每个计划外折×内层窗口，包括未启动或缺测窗口。每项写该窗的AI解释，引用temporal_window:外折:内层及可选的同外折实际尝试；漏窗、重复、错误编号、其他窗口的证据及其他外折尝试均不能发布。它约束覆盖和引用，不能证明每句模型判断正确。

服务端自行复制不可改写的facts：冻结训练/验证区间、已启动数量、本窗完整/部分/缺失指标数、失败状态数，以及每个父代的计划基线、实际配方和执行状态。失败状态与保留的指标可能重叠，不能相加冒充尝试总数。未启动基线的实际配方为未知，不能把计划参数冒充运行值。参数通过name/value列表保存，避免HTTP大小写转换改变变量名。

原始逐窗数值仍只在attempt.inner_evaluation.folds中保存一份，按number匹配，新增事实不重复收益/回撤。报告逐窗展示系统事实与AI解释，并保留总体共同区域说明和原评分限制。解读13的temporal_parameter_review_version为2；旧解读12保持版本1和原提示，旧解读1–11不追加这些事实。评分规则没有因增加文字而升级。

业务JSON按用户已确认范围纳入WebDAV/FTP/SFTP；没有新表或数据库迁移。schema58要求同步端支持新合同。恢复从原行情/计划/检查点重建全部窗口及参数，再核对报告；重算外层哈希也不能改写facts，布尔冒充数值及非有限值拒绝。恢复不授予模型、搜索或源码执行权限，不恢复本机队列。

## 真实调用尝试与失败结果

先在内存SQLite和临时媒体中，通过真实实验API显式复制上一份归档AI方案：period基线14，对照7/10/20/28，3外折×3内层，expanding、训练40/验证10/测试10、warmup28、gap2、费用/滑点各5bps，总预算16次。没有伪造原ExperimentProposal关联，也没有重新发布原始源码报告。已使用过的BTCUSDT小时行情再次完成16次受控尝试，输出与原归档一致，102段由独立Decimal参考核对；三个外层仍全亏损，九窗没有共同参数支持区域。

普通沙箱拒绝读取Docker套接字，自动审批随后因完整研究载荷外发需明确授权而拒绝组合请求；两次均发生在模型调用前。用户查看载荷说明并明确允许后，才只读读取本地Docker PostgreSQL指定的deepseek-flash配置，凭据仅在进程内使用，未写真实业务库。新增逐窗合同沿用同一归档实验和历史材料范围。

真实调用尝试限定1次、120秒、不自动重试。完整提示125875字符、结构化证据117106字符。最终在上限到达后取消，任务于121.542秒记录失败：模型调用超过120秒时限。没有捕获可发布的完整返回，没有新研究报告，没有自动第二次调用。当前材料不能证明超时由模型推理、载荷长度、网络或服务端排队中的哪一项造成。

用量记录status=interrupted、usage_complete=false，input/output/total tokens均为null，实际消耗未知。临时验收脚本最初把空计数求和得到0；[原始脚本汇总](./验收记录/2026-10-26-window-review-execution-summary-original.json)保留该值，[正式汇总](./验收记录/2026-10-26-window-review-summary.json)明确改记null并保留original_harness_counter_total，不能将0解释成免费或无消耗。

原报告、来源、候选、实验结果和方案未改写。人工协议预检可以通过发布校验，但人工输出没有作为这次真实返回导出，不能用它替代模型质量验收。本次失败也没有降低评分门槛或把负收益改成推荐参数。

## 捕获与离线重放

[哈希清单](./验收记录/2026-10-26-window-review-manifest.json)绑定原始资料及本次[冻结输入与完整提示](./验收记录/2026-10-26-window-review-input.json)、[调用上限](./验收记录/2026-10-26-window-review-request-options.json)、[用量](./验收记录/2026-10-26-window-review-usage.json)、正式汇总和[新增业务记录差量](./验收记录/2026-10-26-window-review-delta.json)。差量35条，不重复存整库，排除凭据与本机任务；没有response或成功报告文件。

`python -m quant.acceptance.window_review_replay`强制隔离内存设置：先校验原始捕获并复算一次原受控搜索及102段账本，再恢复本次差量、重建九个窗口与逐字提示，确认失败不生成报告、旧不可变记录不变、恢复后执行队列为空。重放新增提供商/源码调用均为0；其中受控搜索复算与模型调用是不同步骤，不应混称零计算。

本次证明逐窗合同、事实绑定、失败保存和离线恢复；真实模型能否按新合同给出正确且完整解释仍未通过。独立数据验证、专家/多模型基线、任意标签期限、最终留出治理、跨请求多重检验、完整原平台执行、全局语义依赖及真实部署/双设备同步仍有缺口，整体目标未完成。

## 本地检查记录

量化及system_settings.tests.SyncManagerTests全量657项通过（186.690秒），日志`/private/tmp/odoc-window-review-full-corrected.log`。随后新增真实失败捕获回放，并补强布尔/非有限事实拒绝和正文易读格式，逐窗专项7项通过（2.650秒，`odoc-window-review-report-final.log`）；这7项与全量有重叠，不直接相加。最初全量命令误写了不存在的utils.tests标签，保留失败日志`odoc-window-review-full.log`，纠正后才取得全量通过；没有把加载失败写成全绿。

Node22前端143项、type-check、修改范围ESLint及生产构建通过，最后构建28.51秒。日志为`/private/tmp/odoc-window-review-front-final.log`、`odoc-window-review-type-final.log`、`odoc-window-review-lint-final.log`、`odoc-window-review-build-final.log`；保留大包、Browserslist资料过期和既有package.json导入属性警告。定向lint通过不等于全仓lint通过。makemigrations --check --dry-run无变更，差异格式、捕获凭据字段及新增文档链接检查通过。

纯local浏览器另走收集人工源码→人工多内层方案→导入180根人工行情→实验→新解读→完整报告，九个窗口分别保留lookback=20、缺测/失败计数和窗口引用；重新解读保留原稿。1280/768/390宽度无页面横向溢出，390无原生select，检查后恢复视口并停止本轮临时前端。截图`/private/tmp/odoc-window-review-local-desktop.png`、`odoc-window-review-local-768.png`、`odoc-window-review-local-390.png`均为明确标记的人工展示，不能替代真实模型返回。local接口回归覆盖样例/空/慢/错误与刷新恢复；本轮没有声称每种异常态均完成独立浏览器操作。没有运行dev.sh、真实业务库迁移、部署或远端双设备同步。
