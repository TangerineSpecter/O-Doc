# Agent 决策模型迁移评估与演示记录

- 记录日期：2026-10-10
- 状态：官方 API 和模拟农场演示已验证；正式任务尚未接入决策模型
- 目的：把适合的高频判断从通用大模型迁移到 TypeSafe Jev，降低通用大模型的 Token 使用量，同时保留居民性格、业务约束和执行一致性
- 本文为评估及后续实施依据，不表示批准一次性替换全部任务

## 1. 分工与收益边界

| 能力 | 建议承担方 |
| --- | --- |
| 从明确候选中选择动作、分类、语义评分、判断是否需要响应 | 决策模型 |
| 余额、数量、时间比较、成本、资源冲突、权限、幂等与实际结算 | 代码 |
| 完整复杂计划、检索词、自然语言理由、评论、文章、日记、生图提示词 | 通用大模型 |

一次原由通用大模型完成的决策请求，完整迁移后，该环节的通用大模型输入与输出 Token 均可归零；Jev 仍有自己的用量及费用。若迁移后又调用大模型生成理由，或把原来一次组合决策拆成多次请求，应分别统计，不能宣称整个任务不再使用大模型或总 Token 必然下降。

减少提示词中的无关信息可同时降低两类模型的输入用量，属于上下文精简收益，不应全部归因于更换模型。当前尚无同一真实任务在两种模型下的完整对照数据，不给出整体节省比例。

## 2. 当前任务迁移评估

以下以记录日期的本地代码为依据；农场和日程已有其他在进行的工作，实际实施前需重新核对调用与执行契约。

| 任务 | 可迁移判断 | 保留部分与实施限制 | 顺序 |
| --- | --- | --- | --- |
| 农场经营 | 收获、照料、播种、休息及经营策略选择 | 当前可选多个操作，必须由代码生成可行组合或逐步更新状态，保留整份预算与资源校验；自然语言 reason 需调整契约或保留生成环节 | 第一批 |
| 美食制作 | 食谱、日常/精品材料策略、制作或休息 | 制作数量、共享材料分配、成本与体力由代码计算；保留 build_plan 校验，处理 reason 契约 | 第一批 |
| 旅行 | 候选城市或不去、景点动作、遭遇应对、美食选择 | 行程资料整理、自由文本感受、日记与生图提示词仍需生成；购物篮数量组合及预算不能直接交给独立判断 | 第一批局部环节 |
| 阅读帖子并评论打分 | 互动/休息、立场、语义评分、事件理解类别 | 评论生成保留大模型；Score 的语义等级需映射现有评分契约，不能当作精确数学结果 | 第二批 |
| 居民社交 | 回复/发布/阅读/忽略/休息、点赞与配图选择、事件理解类别 | 内容和生图提示词仍需生成；忽略/休息可跳过大模型，需比较拆分后的额外请求和上下文成本 | 第二批 |
| 自主选题并发帖 | 分类、新闻/专题模式、素材相关性、重复性及充分性 | 搜索词、表达角度、核实查询与正文继续生成；判断仅基于提供的证据，不能替代搜索或保证事实真实 | 第二批 |
| 生活日程 | 可行活动或完整候选计划的选择、目标偏好评估 | 当前同时安排多个时段、预算、种植目标、目标更新，需先拆分；跨时段约束由代码/规划器协调 | 后续 |
| 市场交易 | 入场/不去，从实时可行交易候选中选买/卖/等待 | 当前为多轮工具会话，需重组候选和状态更新；数量、定价、预算调整、request_id 与结算由代码负责 | 后续 |
| A 股模拟投资 | 新闻相关性、语义风险分类等辅助判断 | 不整体替换行情查询、分析和买卖工具流程；语义评分不能代表收益预测或正确交易依据 | 暂不优先 |
| 自定义任务 | 明确分类、筛选和有限候选选择 | 任意 MCP 工具参数、自由写作与复杂推理按具体任务评估 | 逐个评估 |

### 对应代码入口

- 农场：[`farm_runner.py`](../../system_settings/agent_world/farm_runner.py)，`decide`；预算校验：[`farm_planning.py`](../../system_settings/agent_world/farm_planning.py)。
- 美食：[`cooking_runner.py`](../../system_settings/agent_world/cooking_runner.py)，`decide`、`validate_decision`；整份制作计划：[`cooking_plan.py`](../../system_settings/agent_world/cooking_plan.py)。
- 旅行：[`travel_steps.py`](../../system_settings/agent_world/travel_steps.py)，目的地、站点、遭遇、美食、购物及日记节点。
- 阅读评论：[`action_runner.py`](../../system_settings/agent_world/action_runner.py)，`evaluate`；当前帖子选择 `choose_post` 已使用代码权重，不属于可直接节省的大模型调用。
- 社交：[`social_runner.py`](../../system_settings/agent_world/social_runner.py)，`decide`。
- 发帖：[`publish_workflow.py`](../../system_settings/agent_world/publish_workflow.py)，选题、素材评估、写作阶段。
- 日程：[`life_planner.py`](../../system_settings/agent_world/life_planner.py)，`plan_items`、`apply_plan`。
- 市场/投资：[`market_runner.py`](../../system_settings/agent_world/market_runner.py)、[`investment_runner.py`](../../system_settings/agent_world/investment_runner.py)。
- 自定义任务：[`agent_task_scheduler.py`](../../system_settings/agent_task_scheduler.py)，`_run_task_for_agent_body`。

## 3. Jev 接口及能力边界

- 官方接口：`POST https://api.typesafe.ai/v1/systemone`，使用 `Authorization: Bearer` 认证；密钥仅从 `TYPESAFE_API_KEY` 读取，不写入代码、文档或日志。
- 请求包含 `model`、`state`、`questions`；默认 `jev-latest`，本轮实际返回 `jev-1.13.0`。
- Choice 返回候选选择、概率分布和置信度；Score 返回语义评分及分布；Noul 返回判断为真的概率。
- 不把概率或置信度当作已证明的正确率，也不把最高分当作多步计划的全局最优解。
- 模型不生成自由文本理由；不能将人工观察提示或动作说明冒充模型解释。
- 官方列出的限制包括精确数学、日期时间比较、复杂间接推理、无关上下文、候选顺序偏差和生成能力。英文为主要训练语言，中文业务需通过真实内容验证。
- 多个问题独立判断，不能假定模型会自动协调共享预算、材料、地块或互斥时段。

## 4. 已有演示与实测结果

### 4.1 API 连通性

用户已运行 [`test/test_typesafe_api.py`](../../test/test_typesafe_api.py) 的真实调用：返回 `jev-1.13.0`、`noul=0.97`、输入 293 Token、输出 23 Token、耗时 0.633 秒，测试通过。证明该次环境、密钥和官方接口可正常调用，不证明复杂业务决策质量或长期可用性。

### 4.2 菲伦农场演示

测试：[`test/test_typesafe_farm_demo.py`](../../test/test_typesafe_farm_demo.py)；素材：[`test/typesafe_farm_demo_data.py`](../../test/typesafe_farm_demo_data.py)。

素材来源：完整角色提示词由用户提供；精简决策画像从中提取性格、经营相关偏好和生活节奏；农场状态、可行条件、候选动作及人工观察提示为编写的模拟资料。没有读取真实居民、农场、库存或余额，也不执行操作。

完整/精简模式共 10 次真实 API 调用，用户返回的结果如下：

| 模拟场景 | 精简画像选择 | 完整提示词选择 |
| --- | --- | --- |
| 精力充足，作物已成熟 | 收获 | 收获 |
| 现有作物需要照料，也可以播种 | 照料 | 照料 |
| 农场已照料妥当，有空地与种子 | 播种 | 播种 |
| 有些疲惫，农场暂无紧迫事务 | 休息 | 休息 |
| 收获、照料、播种都可行 | 收获 | 收获 |

| 5 个场景合计 | 精简画像 | 完整提示词 |
| --- | --- | --- |
| 输入 Token | 4,413 | 8,278 |
| 输出 Token | 192 | 192 |

精简画像输入减少约 46.7%，五个场景的动作选择一致。单次请求耗时范围为 0.703–1.897 秒，不能据此推断长期速度。

这轮验证了合法候选选择与输出契约，但没有证明性格导致差异：场景本身有较明显的常识倾向，其中休息场景还明确描述了休息意愿。后续应固定相同状态，对比菲伦、其他性格和不传性格的基线，并倒序候选、重复运行，观察稳定性。

### 4.3 运行方式

在项目根目录通过环境变量设置密钥后运行；不要把真实密钥写入命令示例或提交到仓库。

```bash
# 离线校验，不发送请求
.venv/bin/python -m unittest test.test_typesafe_api test.test_typesafe_farm_demo -v

# 精简画像，5 次真实请求
RUN_TYPESAFE_LIVE=1 .venv/bin/python -m unittest test.test_typesafe_farm_demo.TypeSafeFarmDemoTest -v

# 完整/精简对照，10 次真实请求
RUN_TYPESAFE_LIVE=1 TYPESAFE_DEMO_PROFILE=both \
.venv/bin/python -m unittest test.test_typesafe_farm_demo.TypeSafeFarmDemoTest -v

# 倒序候选，检查顺序影响，5 次真实请求
RUN_TYPESAFE_LIVE=1 TYPESAFE_DEMO_REVERSE=1 \
.venv/bin/python -m unittest test.test_typesafe_farm_demo.TypeSafeFarmDemoTest -v
```

未设置 `RUN_TYPESAFE_LIVE=1` 时真实调用测试跳过；设置后应使用有效密钥。`TYPESAFE_MODEL` 可覆盖默认模型，比较效果时应固定版本，避免 alias 更新影响结果。

## 5. 后续实施与验收

1. 首先用隔离的农场/美食状态对照现有大模型与 Jev，记录完整输入、合法候选、最终选择和整份计划校验结果，不操作真实资产。
2. 明确现有 `reason` 等字段如何兼容；需要自由文本的节点保留生成模型，不能伪造理由。
3. 先接农场和美食，再迁旅行候选选择，再拆社交“是否需要生成内容”；日程与多轮市场会话另行设计。
4. 保留候选 ID、居民归属、权限、锁、幂等、事务、预算与资源校验；模型不能直接写余额、库存或执行任意操作。
5. 对超时、服务错误、非法选择、低置信度分别定义策略；回退大模型或休息是待实现的配置策略，不表示当前已经支持。执行必须避免回退造成重复提交。
6. 分别统计通用大模型与 Jev 的请求数、输入/输出 Token、费用、耗时、失败/回退和无效计划率。模拟 API 结果不代替正式任务、真实服务、部署和同步验收。
7. 若后续新增决策服务配置、模型记录或用量字段，实施前确认是否纳入 WebDAV 同步，遵循现有同步边界；本次仅新增文档和独立测试，不新增业务持久化字段。

## 6. 官方参考

- [介绍与能力](https://docs.typesafe.ai/introduction)
- [API 参考](https://docs.typesafe.ai/api)
- [模型、价格与语言支持](https://docs.typesafe.ai/models)
- [Jev 1.13 已知限制](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

价格、模型别名和计费规则可能变化，实施时重新核验。响应 `usage` 是 Token 用量，不等于账单页面已完成记账；当前未确认官方账单刷新时效。
