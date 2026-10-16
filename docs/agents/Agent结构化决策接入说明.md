# Agent 结构化决策接入

本文说明当前决策连接、跨场景策略、文本模型路由和同步边界；2026-10-16 静态对照 `system_settings/decision/` 与前端 API。市场内的多步选择和工具执行从[市场决策说明](./Agent市场决策执行说明.md)继续阅读。

## 场景和模型分工

世界设置统一管理启用状态、排除场景和连接选择。当前注册的有限选择场景为：市场选择、生活活动选择、生活预算选择、美食菜谱/份数/继续/用料策略、社交行为选择、旅行目的地、游览与遭遇、迷宫探索准备、探索装备挂牌定价，实际枚举见 `routing.SCENES`。启用字段仍使用兼容名称 `jev_enabled` / `jev_excluded_scenes`，连接不限于 JEV。

有限选择只接收服务端合法候选；普通文字生成、复杂计划和工具业务由相应文本流程承担。无候选不调用选择服务；单一候选直接选定；单个问题最多设置 255 个候选选项，超过时共享选择入口转普通模型。市场的分页和有限轮次另见市场说明。

普通文本请求按有效配置顺序尝试：任务指定模型；未指定且属于决策请求时使用世界文本决策模型；随后为居民模型、系统默认对话模型，并去重。具体使用范围由调用方的 `decision` 参数和场景决定。

模型错误或输出校验失败按当前阶段时限回退；停止、授权失效和业务工具失败由原执行流程处理。回退不能重放已经提交的交易、奖励或其他写入。

## 连接与协议

连接在“AI 模型接入 → 决策模型连接”管理，保存稳定连接 ID、名称、协议、服务地址和模型 ID。JEV 是保留的内置连接，自定义连接按协议扩展：

| 协议 | 请求和响应 |
| --- | --- |
| `systemone` | 发送 `{state, questions}`，读取并校验 `answers` |
| `openai_chat_json` | 用 Chat Completions 外层把相同结构写入 `messages[0].content`，从返回正文解析问题 ID 对应的选择结果 |

适配器统一校验候选、概率分布与置信度。协议不匹配的服务应实现独立适配器；置信度不作为未经验证的回退阈值。

2026-10-16 用户实测 `openai_chat_json` 连接 `startlux-decision`：单个药剂数量选择问题提供 20 个候选，响应同时返回选择项、置信度和各候选概率；本次 `choice` 为“2瓶”，置信度约 `0.297556`。该次响应的 usage 报告为 prompt 384、completion 0、total 384 tokens。测试只覆盖 20 个候选；255 项上限按共享选择入口配置记录。

关闭或排除场景时，调用方按场景进入普通文本路径；迷宫探索准备使用原整套文本规划，挂牌价格由文本模型决定。探索结构化决策连接临时不可用时，探索仍可按代码回退方案出发；装备问题跳过且不标记，挂牌价格问题暂缓该件。市场会保留同一机会、会话和已提交事实。连接检测不提交市场交易，也不证明真实业务质量或节省比例。

## 账号、持久化与同步

- 连接元数据在 `SystemSetting.system_decision_connections`，API Key 按账号与连接 ID 保存在 `system_decision_credentials`；世界选择在 `LifeConfig.settings.decision_connection_id`。
- 上述连接元数据、世界选择及密钥均按现有 WebDAV 业务范围同步。配置读取仅返回密钥是否已设置，不回传密钥；远端快照包含凭证字段。
- 旧 `AgentTask.market_config.decision_enabled/decision_provider` 保留历史兼容，当前策略读取世界设置。
- 新协议及连接沿用既有存储，是否新增同步字段须按[同步说明](../数据同步逻辑说明.md)逐项确认。

## 接口与代码入口

接口前缀为 `/api/settings/decision-models/`：GET/PATCH 管理内置 JEV 配置，`connections/` 新建自定义连接，`connections/<id>/` 编辑/删除，`connections/<id>/test/` 检测；内置连接保留 `test/` 检测入口。准确字段见前端 [api/decision.ts](../../frontend_react/src/api/decision.ts)和[类型](../../frontend_react/src/types/api/decision.ts)。

- 后端：`system_settings/decision/config.py`、`views.py`、`routing.py`、`jev.py`、`adapters/`、`restore.py`、`diagnostics.py`。
- 前端：`hooks/useDecisionConfig.ts`、`components/Settings/DecisionSettings.tsx`、`DecisionConnectionModal.tsx`；世界策略在 `components/AgentWorld/WorldDecisionModelSettings.tsx`。
- 决策用量按 `decision:<connection_id>` 记录真实版本、状态和已知 Token；未知用量保持为空。详见[Token 用量说明](./AgentToken用量统计说明.md)。

阶段验收、市场上下文迭代和旧测试命令见[历史记录](../archive/agents/Agent结构化决策阶段记录.md)。真实费用、耗时、行为质量与多设备接续需要对应证据，不能由字符缩减或连接成功推导。

生活规划每个时段串行决定活动及预算，使用代码过滤后的有限候选。美食最多三轮菜谱选择，每轮还有份数和必要的用料选择，后两轮前可选择是否继续；三轮不表示总共仅调用模型三次。空候选由代码处理，唯一候选不调用供应商。普通模型回退也只能返回提供的候选ID。
