# 闪念灵感碰撞、AI 发芽与 Agent 随手记

## 使用与边界

闪念页面保留随机漫步，新增灵感碰撞和发芽记录。抽卡使用当前页面创建人、标签、搜索共同筛选后的集合；默认3张，可切换4/5张，数量仅保存在浏览器。同组不重复，素材不足时按实际数量展示，至少两张才能生成。锁卡、换一张和重抽不修改已经启动的任务素材。

AI 发芽可补充一句方向，默认系统主模型；设置中可选已有对话模型，以及明确的外部搜索/网页读取 MCP 工具。未选调研工具时显示灵感写作。工具必须已启用、开放给 AI 对话，内置写入工具不参与调研。工具选择仅保存在本机任务和浏览器，不同步连接配置或新增凭证。

流程为寻找问题与边界、按需查证、整理短文。搜索后可追加一轮读取或反证，总共最多4次工具调用，整体5分钟；网页和闪念都是素材，不接受其中的指令。查询不主动发送整段闪念原文或身份信息。正文目标600～900字、上限1200；短启发和未找到方向上限400。格式、长度和引用检查最多完整修整一次，不截断冒充文章。只采用实际工具返回的URL；摘要不等于读过全文。需要证据但查证不足时不接受文章结果。

结果自动进入发芽记录，不自动创建文章或新闪念。关闭弹窗不取消，刷新后可恢复查询。取消会撤销本机任务许可；失败、中断可重新发芽，产生独立记录并沿用原始来源快照。记录列表显示最近100条。删除记录产生永久墓碑；已保存文章和原始闪念保留。选择自己的文章文集后可直接保存或进入编辑器；编辑器不弹空白模板，保存时附上来源快照和参考链接。重复保存返回同一文章；删除正式文章后需从回收站恢复，避免隐式重建。

## 领域与接口

- `memos/sprout_models.py`：Sprout同步事实、SproutJob本机任务、MemoCapture同步机会回执、MemoCaptureAuthorization本机自动开关。
- `sprout_services/rules/execution/worker/views/sync`：依次负责事务、纯输出约束、有界生成、本机租约、认证接口和同步校验。
- `system_settings/agent_world/memo_capture.py`：可信Agent上下文、真实近期记忆与社交素材、内置MCP写入。
- 前端 `components/Memos`、`hooks/useMemoCollision/useSprout/useSproutPublication`、`api/sprout`、`types/api/sprout`、`utils/memoCollision` 分离渲染、状态、接口和抽卡规则。

认证API统一沿用 `code/msg/data` 与驼峰转换，ID保持字符串：

| 方法 | 路径（/api/memo/） | 用途 |
| --- | --- | --- |
| GET | sprouts/options | 可选择模型与工具元数据，无连接凭证 |
| POST / GET | sprouts | 从服务端当前账号素材创建 / 列出记录 |
| GET / DELETE | sprouts/{id} | 查看 / 删除自己的记录 |
| POST | sprouts/{id}/cancel | 撤销本机执行许可 |
| POST | sprouts/{id}/regenerate | 使用不可变快照重新生成 |
| POST | sprouts/{id}/save | 原子关联文章，重复保存幂等 |

## 随手记机会语义

内置 `memo_capture` 默认关闭，每个账号一项固定ID任务。每周总共3次机会，可调整总量；人数不增加次数，随机等概率分配，允许同一居民得到多次。随机时间与分配由持久周期快照和确定性种子重建；本机租约与退避不同步。当前周期安排固定，配置更改下周期生效。

一次通常30～150字、最多300字；记录观察、疑问或想法，不要求每日感悟，不编造亲身经历、不复制近期朋友圈。已有单个层级标签优先，不置顶。服务端决定作者，模型不能指定幂等键、所属账号或创建人。主动跳过和相似内容去重均留下机会回执并消耗机会，技术失败在同一机会退避重试。闪念和回执同一事务提交，崩溃后同一机会重试不会重写或创建第二条。手动试记是额外明确触发，不消耗本周自动机会。其他周期任务仍按原成功次数统计。

本机自动开关单独保存，正式任务的同步 `enabled` 固定为false，另一台设备接收后不会自动执行。请只在一台设备启用该任务；一期没有跨设备分布式抢占。执行中租约被撤销或记录被恢复删除时，返回结果不能提交。随手记执行租约使用`memo:`标识；恢复会撤销这些Agent租约及该任务的随机机会租约，并将恢复出的运行记录标为失败以便重试。恢复前的写入或主动跳过不能提交，也不能覆盖恢复后的记录状态，其他任务的租约保留。

## 升级与同步

版本1.1.9；旧设备根据已有app_version检查拒绝新版本快照。所有同步设备升级并执行 `.venv/bin/python manage.py migrate` 后再使用新功能。新增迁移为memos 0004/0005、system_settings 0065。关闭的Agent任务不要默认启用，先完成真实输出评审。

同步Sprout的账号、素材ID/内容/作者/标签快照、方向、模型标识、结果、引用和文章关联；原闪念变更或删除不改变快照。MemoCapture机会回执一起同步。快照带 `memo_sprout_schema_version=1` 和实体哈希，兼容缺少新模型的旧快照，拒绝未来版本/篡改内容/本机执行表混入。恢复撤销SproutJob，未完成记录标为interrupted；接收设备不会自行调用模型。SproutJob、MemoCaptureAuthorization为明确的本机数据，不进入WebDAV。

## 验收记录与待验收

隔离测试数据库覆盖认证与跨账号拒绝、来源修改删除、取消/过期、输出格式修整、长度与引用校验、重复保存、可信作者、机会总量/跳过、真实同步管理器往返与重复恢复、防止同步后自动执行、机会回执防重。抽卡纯规则覆盖筛选集合、唯一性、锁定保留、数量不足。

浏览器使用隔离演示数据和模拟模型响应，验证桌面/390px窄屏、锁卡与重抽、关闭刷新恢复、未配置工具提示、文集下拉、编辑器初值及正式来源保存、Escape关闭。模拟响应只验证流程，不证明内容质量。

本地真实数据库没有闪念、AI模型或搜索MCP配置，尚未进行真实模型质量验收与真实WebDAV双设备联调。上线前用10组真实素材逐篇评审：相关3组、跨领域3组、弱联系2组、重复观点2组；记录启发性、可核验事实、牵强联系、正文长度、是否应拒绝成文。质量不通过时继续保持随手记关闭。

本次验证：后端78项回归、抽卡纯规则4项通过；类型检查、新增前端模块lint、Django检查与生产构建通过（现有大包体积提示仍在）。未迁移真实数据库，未发布部署。

测试命令：

```bash
.venv/bin/python manage.py test memos.test_sprout system_settings.test_agent_random_schedule system_settings.token_usage.test_usage system_settings.token_usage.test_report --settings=memos.test_settings --noinput
cd frontend_react
nvm use 22
npm run type-check
node --experimental-strip-types --import ./scripts/register-ts-loader.mjs --test src/utils/memoCollision.test.ts
npm run build
```
