# 市场上下文优化与 JEV 决策接入

2026-10-11。市场任务默认使用原文本模型工具循环；在任务配置中打开「使用决策模型」后使用 JEV。其他任务不自动切换。

## 配置与账号

「AI 模型接入 → 决策模型」提供 JEV 密钥保存、清除和连接检测。JEV 不进入文本模型列表，不填写地址或模型 ID。适配器使用官方 `https://api.typesafe.ai/v1/systemone`、`jev-latest`，记录响应实际版本；协议见 [TypeSafe API](https://docs.typesafe.ai/api) 和 [模型说明](https://docs.typesafe.ai/models)。连接检测只 GET 官方 `/v1/models`，不执行选择或交易。

接口为 GET/PATCH `/api/settings/decision-models/` 和 POST `/api/settings/decision-models/test/`。PATCH 接收 `apiKey`，null 清除；读取只返回服务名称、ID、是否配置。账号从认证用户取得，密钥不回传。

密钥按账号保存在本机 `SystemSetting.system_decision_credentials`，属于 `LOCAL_ONLY_SYSTEM_SETTING_KEYS`：不进入 WebDAV、修订、导出快照，完整恢复不覆盖、不清除本机密钥。请求错误不记录供应商原始响应或凭证。数据库本身仍属于本机管理范围。

已有 `AgentTask.market_config` 保存 `decision_enabled`（默认 false）、`decision_provider`（默认 jev）。外部请求/响应为 `marketConfig.decisionEnabled/decisionProvider`。部分保存保留原选择；所属账号由服务端确定。任务选择参与现有 WebDAV 同步，无新增数据库字段或迁移；新设备需自行填写密钥。

## 执行与回退

市场机会认领保留在 `market_runner`，共享生命周期、截止时间和工具执行在 `market_model_execution`；JEV 循环与可行候选分别位于 `market_decision_loop`、`market_decision_candidates`。所有修改继续通过原交易、预算和种植队列服务提交。

JEV 先选择进入或等待，再选择买卖动作、商品、数量。候选保留价格、品质、来源、库存、回收值、版本及相关需求，由代码根据实时余额、后续预留、商品格、建筑容量和采购额度计算可买上限。商品每页20项，可前后翻页和返回动作选择；每一步保留等待、离场和其他方案入口，数量支持1、所需量、当前上限及其他数量。Choice 单次不超过官方255项。

自由挂牌/改价/撤单、复杂预算调整、种植队列或候选外方案调用任务覆盖模型或居民默认文本模型。复杂子流程查询后仅完成一个成功修改，立刻结束并刷新真实状态，再回 JEV；失败修改不算完成。重复请求继续沿用原幂等校验。

缺密钥、认证失败、超时、服务错误、结构或候选 ID 无效时，本次剩余部分永久转文本模型。复用同一机会键、记录、会话及真实资产，携带成交事实和剩余额度，不重复入场扣体力或重放已成交交易。置信度只记录，不作为未经验证的回退阈值。

报价跨小时、挂牌版本和库存冲突刷新后重新选择；条件未变化的重复失败结束。停止、解绑、过期及调用上限也直接结束。两类模型共用5分钟、20次市场调用及24次工具执行限制；JEV 请求超时参数不超过20秒、无自动重试，额外有限选择轮次上限为64，防止只翻页而无业务进展。结束摘要直接取成功操作事实，不追加摘要模型调用。

## 上下文与完整细节

`market_model_context` 构造模型私有投影：初始只保留身份、经营偏好、相关记忆、生活目标、预算、库存首屏及市场/农场需求摘要，消除生活大快照与市场快照的重复。稳定规则放在系统前缀。

`observe_market_detail` 按 topic/page/search 查询库存、逐批价格、挂牌价格历史、完整作物收益概率、农场、装备物资、食谱、生活目标/日程及历史经历。每页20项且明确 total/has_more；物品/挂牌按指定 ID 查询；生活详情从原始数据分页，不继承初始快照的20/50项截断。原始业务数据、市场展示 HTTP 和外部 MCP 契约保持不变。

文本工具循环刷新同一查询时，把旧工具结果替换成最新结果引用，保留 assistant/tool 配对；错误、实际成功写入和必要决策记录保留，旧初始快照在刷新后替换。输入减少依赖具体状态及查询行为，不承诺固定 Token 降幅。

## 用量与验证边界

真实 JEV 请求接入 `Capture`，关联账号、居民、任务、执行、服务、实际版本、输入/输出和状态。阶段分别为 `JEV 市场选择`、`市场复杂操作`、`市场决策回退`；未知用量留空，失败不伪填零。连接检测不计入模型选择请求。

后端在隔离测试数据库模拟外部响应，覆盖关闭/开启、等待、缺密钥、部分成交后回退、复杂修改后回 JEV、调用结束、候选翻页、私有完整详情、工具协议压缩、账号隔离、恢复保留密钥及原市场/用量/同步回归。浏览器使用隔离账号和数据库，核对实际保存请求与回显、清除密钥提示、公共 Select Portal、桌面和390px窄屏；连接检测在该验收环境模拟。

本次未调用付费 JEV、未部署、未修改生产数据库。真实对照需显式启用，分别记录费用、Token、耗时和决策质量；真实多设备接续仍沿用先停旧设备再开启新设备的边界。

验收命令：`.venv/bin/python manage.py test system_settings.agent_world.test_market system_settings.agent_world.test_life_market_schedule system_settings.decision.test_decision system_settings.agent_world.test_market_decision system_settings.token_usage.test_usage system_settings.token_usage.test_report system_settings.tests.SyncManagerTests --settings=book_analysis.test_settings --noinput`，158项通过。新增前端模块 ESLint、排除独立预览目录的正式代码类型检查和 Vite 构建通过；后续审查已修复预览 `AuraReviewRenderer.ts` 的未使用参数属性，全量 `npm run type-check` 通过。
