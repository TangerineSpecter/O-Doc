# 飞书 IM 接入技术说明

本文档说明 Agent 绑定飞书应用后的 IM 通道接入方式，包括长连接配置、消息收发流程、处理中的表情反馈、上下文装载、短期/长期记忆、摘要压缩策略，以及常见排障点。

## 功能定位

飞书 IM 通道用于让一个 Agent 绑定一个飞书开放平台应用，通过飞书官方 SDK 的长连接能力接收机器人消息，并把 Agent 回复发送回飞书会话。

当前实现的边界：

- 一个 Agent 绑定一个飞书应用，需要配置 App ID 和 App Secret。
- 接收事件使用飞书开放平台「使用长连接接收事件」。
- 当前只处理文本消息，非文本消息会返回固定提示。
- 近期对话上下文按飞书 `chat_id + conversation_id` 维护，发送 `/new` 后会开启新的短期对话线程。
- 长期记忆按 `Agent + sender_id` 优先隔离；拿不到 `sender_id` 时回退到 `Agent + chat_id`。
- 短期向量记忆沿用项目现有 ChromaDB，不引入 LanceDB。
- 处理中的反馈使用飞书消息表情反应，不依赖 `message_read` 事件。

相关代码入口：

- 长连接管理：`system_settings/feishu_im_ws.py`
- 消息处理与回复：`system_settings/feishu_im.py`
- Agent 配置模型：`system_settings/models.py`
- Agent 配置 API：`system_settings/serializers.py`、`system_settings/views.py`
- 前端配置入口：`frontend_react/src/components/Settings/AgentSettings.tsx`

## 飞书开放平台配置

在飞书开放平台中创建或选择一个应用，进入应用能力配置：

1. 在「凭证与基础信息」中复制 App ID 和 App Secret。
2. 在「添加应用能力」中启用机器人能力。
3. 在「事件配置」中选择「使用长连接接收事件」。
4. 订阅「接收消息」事件，对应事件类型为 `im.message.receive_v1`。
5. 如果开启了 Verification Token 或 Encrypt Key，需要在 Agent 配置中同步填写。
6. 如需避免 SDK 报 `processor not found`，可订阅或忽略相关事件处理器；当前代码已注册忽略处理器。

系统设置中的菜单名为「Agent 管理」。在 Agent 编辑弹窗中开启「飞书 IM 长连接」，填写 App ID 和 App Secret 后保存。

## 长连接生命周期

应用启动时，`system_settings/apps.py` 会调用 `start_feishu_im_ws_manager()`。管理器启动条件由 `ODOC_ENABLE_FEISHU_IM_WS` 和当前进程类型控制，默认只在服务进程中运行，避免迁移、测试、命令行脚本误启动长连接。

长连接管理器行为：

- 启动时扫描所有 `feishu_im_enabled=True` 的 Agent。
- 每个启用的 Agent 创建一个飞书 WS Client。
- Agent 保存、更新或删除时，会调用 `sync_agent()` 重新同步连接状态。
- 如果 App ID、App Secret、Verification Token、Encrypt Key 发生变化，会先停止旧连接，再建立新连接。
- 停止连接时会关闭 SDK 自动重连、取消 ping task，并在 SDK 使用的同一个 event loop 中执行 `_disconnect()`。

这里不要直接调用飞书 SDK 的 `client.start()`。当前实现使用 SDK 内部 `_connect()` 和 `_ping_loop()`，统一放到一个全局 loop 线程中运行，是为了避免这些错误：

- `This event loop is already running`
- `Future attached to a different loop`
- `coroutine was never awaited`

## 事件接收流程

飞书长连接收到事件后，流程如下：

```text
Feishu WS
  -> lark_oapi EventDispatcherHandler
  -> register_p2_im_message_receive_v1(on_message)
  -> 后台线程 _handle_sdk_event
  -> handle_feishu_sdk_message_event
  -> normalize_feishu_event_payload
  -> handle_feishu_message_event
  -> 创建 AgentIMMessage
  -> 后台线程 _process_feishu_record
  -> 构建上下文并调用模型
  -> 回复飞书消息
```

事件幂等依赖 `AgentIMMessage` 的唯一约束：

```text
platform + message_id
```

如果飞书重试同一条事件，系统会跳过重复处理，避免重复回复。

## 消息处理与回复

每条飞书消息会落库为 `AgentIMMessage`：

- `status=received`：已收到，等待处理。
- `status=replied`：已生成并发送回复。
- `status=failed`：处理失败，记录错误信息。

处理逻辑：

1. 如果 Agent 已关闭飞书 IM，则标记失败。
2. 如果不是文本消息，返回「我现在先支持处理飞书文本消息。」。
3. 如果文本为空，返回「我没有读到可处理的文本内容。」。
4. 如果文本精确等于 `/new`，开启新的短期对话线程并回复「已开启新对话。」。
5. 文本正常时，先添加处理中的表情反馈，再构建记忆和上下文并调用模型。
6. 模型返回后删除处理中的表情，并通过飞书回复 API 回复原消息。
7. 普通文本成功回复后，将本轮 `user + assistant` 写入短期记忆。
8. 如果处理失败，删除处理中的表情，并给原消息添加失败表情。

回复使用飞书接口：

```text
POST /open-apis/im/v1/messages/{message_id}/reply
```

Token 使用 `tenant_access_token`，缓存在 `SystemSetting` 中。缓存时间比较时需要注意 Django 时区对象，当前代码会把缓存时间统一归一化后比较，避免 offset-naive 和 offset-aware datetime 的比较错误。

## 已读反馈和处理标记

飞书里的「机器人正在读/正在处理」效果不是 `im.message.message_read_v1` 实现的。

当前实现使用的是飞书消息表情反应接口：

```text
POST /open-apis/im/v1/messages/{message_id}/reactions
DELETE /open-apis/im/v1/messages/{message_id}/reactions/{reaction_id}
```

处理开始时，在用户原消息上添加：

```text
emoji_type = Typing
```

处理完成后删除这个 reaction。这样用户会看到类似截图中消息气泡下方的机器人反馈标记。

处理失败时，会添加：

```text
emoji_type = CrossMark
```

注意：

- `Typing` 和 `CrossMark` 是飞书内置 reaction emoji 类型，不是系统自定义图片。
- `im.message.message_read_v1` 表示消息已读事件，通常用于监听用户是否读了消息，不用于展示机器人正在处理。
- 为避免飞书 SDK 报 `processor not found, type: im.message.message_read_v1`，当前长连接注册了 `message_read_v1` 的忽略处理器。
- 同理，`reaction_created_v1` 和 `reaction_deleted_v1` 也注册为忽略处理器，避免订阅后产生未注册处理器错误。

## 上下文与记忆策略

飞书 IM 对话不是单次问答。当前使用三层记忆与上下文：

- 近期完整上下文：当前对话线程内的完整 `user + assistant` 轮次。
- 短期向量记忆：30 天 TTL，写入 ChromaDB，按当前问题 RAG 召回。
- 长期结构化记忆：存数据库，可在 Agent 管理中查看和手动编辑。

近期对话线程维度：

```text
Agent + platform + chat_id + sender_id + conversation_id
```

长期记忆读取维度：

```text
优先：Agent + sender_id
回退：Agent + chat_id
```

这样同一个飞书用户和同一个 Agent 聊天时，长期记忆可以跨会话延续；群聊里不同用户的近期上下文、summary 和长期偏好也不会默认混在一起。

Prompt 组装顺序：

1. Agent system prompt。
2. 长期记忆。
3. 短期向量记忆召回结果。
4. 当前对话线程早期历史的压缩摘要。
5. 当前对话线程内最近完整对话轮次。
6. 当前用户消息。

完整轮次指：

```text
user: 用户消息
assistant: Agent 回复
```

历史装载时从最近消息向前选择，一次只选择完整一轮。如果某一轮放不进预算，会停止向前选择，不会只保留 user 或只保留 assistant。

## `/new` 新对话

飞书用户发送精确命令：

```text
/new
```

系统会执行：

- 为当前 `Agent + chat_id + sender_id` 生成新的 `conversation_id`。
- 清空当前 `AgentIMSession.summary`、`summary_until` 和 `summary_token_estimate`。
- 不调用大模型。
- 不写入短期记忆。
- 回复「已开启新对话。」。

`/new` 只切换短期对话线程，不删除长期记忆。后续新问题仍然可以按相关性召回长期记忆和短期向量记忆。

## 48k Token 预算

当前 IM 上下文预算：

```text
MAX_CONTEXT_TOKENS = 48000
TOKEN_SAFETY_MARGIN = 1200
SUMMARY_TARGET_TOKENS = 3000
```

实际装载时会预留 1200 token 安全余量，避免模型 provider 的 tokenizer 与本地估算存在偏差。

本地 token 估算不是精确 tokenizer，而是保守估算：

- 中文、日文、韩文字符按约 1 token 估算。
- 非 CJK 字符按约 4 字符 1 token 估算。
- 每条消息增加少量结构开销。

这能满足上下文裁剪的工程需要，但不是模型厂商 tokenizer 的精确结果。

## 短期向量记忆

普通文本消息成功回复后，系统会把本轮对话写成短期记忆：

```text
用户：...
Agent：...
```

写入位置：

- DB 元数据：`AgentShortTermMemory`
- 向量库：ChromaDB collection `odoc_agent_short_term_memory`

短期记忆关键行为：

- 默认 TTL 为 30 天，由 `ODOC_AGENT_MEMORY_TTL_DAYS` 控制。
- 下次对话前，对当前用户消息生成 embedding，并从 ChromaDB 召回相关短期记忆。
- 召回成功后更新 `recall_count`、`best_score`、`query_sources` 和 `last_recalled_at`。
- 如果没有配置 embedding 模型或向量库写入失败，不影响正常对话，只跳过短期记忆能力并记录日志。
- ChromaDB 没有原生 TTL，过期清理由 Agent Memory scheduler 删除 DB 记录和对应向量。

## 长期记忆

长期记忆保存在数据库表 `AgentLongTermMemory`，不使用 `MEMORY.md` 文件。

来源有两种：

- 用户在 Agent 管理里手动新增、编辑、归档。
- 定时任务从高价值短期记忆中晋升。

长期记忆类型：

```text
preference | fact | project | instruction | other
```

长期记忆状态：

```text
active | archived
```

Agent 管理页面中，每个 Agent 卡片有「记忆」入口，可查看当前 Agent 的长期记忆，并逐条新增、编辑或归档。

## 记忆晋升与清理

Agent Memory scheduler 默认每天 03:00 运行。

晋升筛选默认条件：

- 30 天内。
- `recall_count >= 3`
- `best_score >= 0.8`
- 不同 `query_sources >= 3`

符合条件后，系统会让模型再判断这条短期记忆是否值得长期保存。只有稳定偏好、长期事实、长期项目和明确指令才会晋升；临时任务、寒暄和一次性问题会被跳过。

相关环境变量：

```text
ODOC_ENABLE_AGENT_MEMORY_SCHEDULER=true
ODOC_AGENT_MEMORY_PROMOTION_TIME=03:00
ODOC_AGENT_MEMORY_TTL_DAYS=30
```

## Summary 压缩策略

Summary 现在只作为单个 `conversation_id` 内超长上下文的压缩兜底，不再作为长期记忆核心。

当当前对话线程的历史完整轮次超过预算时，系统会把装不下的旧轮次压缩成摘要，保存到 `AgentIMSession`：

- `summary`：压缩后的长期摘要。
- `summary_until`：摘要覆盖到哪一条历史消息。
- `summary_token_estimate`：摘要 token 粗略估算。

压缩提示词要求模型保留当前线程内仍可能有用的信息：

- 用户偏好。
- 明确事实。
- 重要实体。
- 文件、链接、任务名。
- 未完成事项。
- 已达成结论。
- 输出格式约定。
- 最新状态。

如果已有摘要和新增历史冲突，以新增历史为准。

压缩结果目标控制在约 3000 token 内。模型返回后，系统还会做一次本地估算截断兜底，避免摘要本身过长挤占近期上下文。

同一个 `conversation_id` 后续新消息到来时：

1. 先读取已有 summary。
2. 再装入近期完整轮次。
3. 如果仍有新的旧轮次装不下，且这些轮次晚于 `summary_until`，才会再次压缩。
4. 已经被 `summary_until` 覆盖的历史不会重复压缩。

发送 `/new` 后会生成新的 `conversation_id` 并清空 session summary，旧线程 summary 不再进入新线程上下文。

## 数据模型

### Agent

飞书 IM 配置字段：

- `feishu_im_enabled`
- `feishu_app_id`
- `feishu_app_secret`
- `feishu_verification_token`
- `feishu_encrypt_key`

### AgentIMMessage

用于记录飞书消息处理过程、幂等和排障。

关键字段：

- `platform`
- `event_id`
- `message_id`
- `chat_id`
- `sender_id`
- `conversation_id`
- `message_type`
- `content`
- `response`
- `status`
- `error`
- `raw_event`

### AgentIMSession

用于保存当前 `chat_id + sender_id` 的活跃对话线程和当前线程摘要进度。

关键字段：

- `agent`
- `platform`
- `chat_id`
- `sender_id`
- `conversation_id`
- `summary`
- `summary_until`
- `summary_token_estimate`

唯一约束：

```text
agent + platform + chat_id + sender_id
```

### AgentShortTermMemory

用于保存短期向量记忆的 DB 元数据，向量本体存储在 ChromaDB。

关键字段：

- `agent`
- `chat_id`
- `sender_id`
- `conversation_id`
- `source_message`
- `content`
- `expires_at`
- `recall_count`
- `best_score`
- `query_sources`
- `last_recalled_at`
- `promoted_at`
- `metadata`

### AgentLongTermMemory

用于保存可查看、可编辑的长期结构化记忆。

关键字段：

- `agent`
- `scope`
- `chat_id`
- `sender_id`
- `memory_type`
- `title`
- `content`
- `confidence`
- `source_count`
- `status`
- `last_recalled_at`
- `metadata`

## 环境变量

```text
ODOC_ENABLE_FEISHU_IM_WS=true
```

控制是否允许启动飞书 IM 长连接。测试、迁移或本地临时命令中可以设为 `false`。

```text
ODOC_FORCE_FEISHU_IM_WS=false
```

默认只在服务进程中启动长连接。如果确实需要在非标准进程中强制启动，可以设为 `true`。

```text
ODOC_ENABLE_AGENT_MEMORY_SCHEDULER=true
```

控制是否启动 Agent 记忆晋升与清理调度器。

```text
ODOC_AGENT_MEMORY_PROMOTION_TIME=03:00
```

控制每天执行短期记忆晋升和 TTL 清理的时间。

```text
ODOC_AGENT_MEMORY_TTL_DAYS=30
```

控制短期记忆保留天数。

```text
ODOC_SCHEDULER_INITIAL_DELAY_SECONDS=1
```

控制后台调度器和飞书长连接初始同步在线程启动后的延迟时间，用于避开 Django App 初始化期间访问数据库的 warning。

## 权限与飞书能力要求

飞书应用需要具备机器人能力，并拥有对应消息事件和消息回复、消息 reaction 相关接口权限。权限不足时常见表现：

- 能收到消息，但回复失败。
- 能回复消息，但添加 `Typing` reaction 失败。
- 添加 reaction 失败后消息处理可能进入失败分支并记录错误。

排查时优先查看：

- 飞书开放平台事件订阅是否选择长连接。
- `im.message.receive_v1` 是否已订阅。
- App ID 和 App Secret 是否属于同一个应用。
- 应用是否发布或安装到目标租户。
- 机器人是否被拉入目标会话。
- reaction 接口权限是否已开通。

## 常见错误

### `processor not found, type: im.message.message_read_v1`

原因：飞书推送了已订阅事件，但 SDK 未注册对应 processor。

处理：当前代码已注册 `message_read_v1` 忽略处理器。该事件不是机器人处理中的反馈来源。

### `You cannot call this from an async context`

原因：飞书 SDK 回调处在异步上下文中，直接调用 Django ORM 会报错。

处理：当前代码在 SDK 回调中开启后台线程，再执行 Django ORM 相关处理。

### `This event loop is already running`

原因：直接调用 SDK `client.start()` 时，SDK 内部会对已经运行的 loop 调用 `run_until_complete()`。

处理：当前代码统一使用 SDK 全局 loop 线程，调度 `_connect()` 和 `_ping_loop()`。

### `Future attached to a different loop`

原因：连接与断开不在同一个 event loop 上执行。

处理：当前代码停止连接时通过 `asyncio.run_coroutine_threadsafe()` 把 `_disconnect()` 调回同一个 loop。

### `can't compare offset-naive and offset-aware datetimes`

原因：缓存中的 token 过期时间和 Django 当前时间时区类型不同。

处理：当前代码会归一化缓存时间后再比较。

## 测试

飞书 IM 上下文相关测试位于：

```text
system_settings/tests.py
```

测试类：

```text
FeishuIMContextTests
AgentMemoryTests
```

覆盖点：

- 近期上下文只按完整轮次保留。
- 超预算旧轮次会被压缩成 summary。
- summary 会写回 `AgentIMSession`。
- summary 过长时会按估算 token 截断。
- 普通消息可写入短期记忆。
- 短期记忆召回会更新召回元数据。
- 短期记忆可晋升为长期记忆。
- 过期短期记忆会清理 DB 和 ChromaDB。
- `/new` 会切换 `conversation_id` 并清空当前 summary。
- 长期记忆 API 支持列表、新增、编辑和归档。

建议运行：

```sh
ODOC_ENABLE_FEISHU_IM_WS=false ODOC_ENABLE_AGENT_MEMORY_SCHEDULER=false python manage.py test system_settings
ODOC_ENABLE_FEISHU_IM_WS=false python manage.py check
ODOC_ENABLE_FEISHU_IM_WS=false python manage.py makemigrations --check --dry-run
```

## 后续扩展建议

- 支持图片、文件、富文本消息解析。
- 为 Agent 增加可配置上下文预算和 summary 目标长度。
- 增加短期记忆和长期记忆的可视化召回记录。
- 增加 IM 会话管理页面，支持查看或清空当前 conversation。
- 对 reaction 权限失败做降级处理，避免反馈标记失败影响正常回复。
- 接入其他 IM 通道时，复用 `AgentIMMessage`、`AgentIMSession`、`AgentShortTermMemory` 和 `AgentLongTermMemory`，只替换平台事件适配层。
