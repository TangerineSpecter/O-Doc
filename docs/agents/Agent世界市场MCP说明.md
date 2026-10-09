# 世界市场 MCP

设置 → MCP 扫描内置服务可发现「世界市场 MCP」，端点 `/api/system-mcp/market/`。普通Agent对话需显式绑定该服务；内置市场任务直接使用同一适配器和领域服务，只授权市场能力。系统MCP总开关必须开启，服务工具仍沿用现有启用配置。

| 工具 | 用途与关键参数 |
| --- | --- |
| `get_market_shop` | 本小时系统商品位、剩余库存、饲料报价和批次ID |
| `list_market_listings` | 当前账号居民挂牌，`page`、`search`、`seller_id` |
| `get_my_market_listings` | 自己的挂牌及历史，`page`、`status` |
| `get_my_market_transactions` | 自己买卖或管理挂牌的结果，`page` |
| `get_market_context` | 自己的余额、体力、可用背包、农场地块/建筑/动物、挂牌 |
| `enter_market` | `request_id`，成功扣5体力，返回会话ID和剩余调用次数 |
| `buy_market_shop` | `request_id`、`batch_id`、`slot_id`、`quantity`；饲料商品位为 `feed` |
| `buy_market_listing` | `request_id`、`listing_id`、查询所得 `version`、`quantity` |
| `sell_to_market_shop` | `request_id`、`item_id`、`quantity`；仅农作物、畜产品 |
| `create_market_listing` | `request_id`、`item_id`、`quantity`、字符串 `unit_price` |
| `reprice_market_listing` | `request_id`、`listing_id`、`version`、字符串 `unit_price` |
| `withdraw_market_listing` | `request_id`、`listing_id`、`version` |
| `leave_market` | 可选 `session_id`、`request_id`、`reason`，立即结束会话 |

只读工具无需进入；进入后查询也消耗调用次数。所有交易要求有效会话，允许传 `session_id` 指定自己的会话，未传时查自己的当前会话。金额使用精确到分的正数字符串，数量为1至1000000的整数。交易必须提供非空、最多200字符的稳定 `request_id`，网络重试复用同键，另一次操作使用新键。服务端对Agent身份和键做散列，不允许拿别人的请求键重放。

购买应先读取最新报价，使用本小时 `batch_id` 或挂牌 `version`。整点过期、缺库存、改价、部分成交改变版本时返回错误，需要重查，不能自行按旧价格声称成交。失败操作也计入20次上限。进入前只读不扣体力，不想进入可直接结束对话；进入后主动 `leave_market` 关闭，不会退体力或撤销成交。

身份只从系统内部认证的当前Agent上下文取得，所有工具禁止 `actor_id`、`agent_id`、`owner_id` 指定操作身份。`seller_id`仅用于只读筛选。单独拿全局Bearer密钥从外部HTTP调用没有Agent上下文，市场工具会拒绝；不将公共MCP API Key变成任意居民钱包权限。普通Agent通过显式绑定的本机内置MCP调用，现有MCP客户端注入可信Agent上下文。总系统工具集不混入市场写入工具。

更完整的报价、托管、会话、同步及升级规则见[市场一期说明](./Agent世界市场与交易一期说明.md)。

### 采购预算与重复失败保护（2026-10-09）

进入市场、经营上下文及每次成功交易返回实时 `spending`：余额、可消费金额、本小时已购商品格和剩余额度；生活执行时还包含当前安排预算、已支出与其他安排预留。零预算可以浏览，但采购必须先调用 `adjust_life_budget` 分配实际费用；调整成功同样返回实时额度。饲料不占商品格，已经选过的商品格有剩余库存时仍可购买。

购买适配器在计入市场调用前检查预算与商品格。明确不可执行的采购返回 `code`、具体原因和实时额度，不扣款、不改变库存、不写入成交或市场调用记录；真正执行的失败仍沿用原有计数。任务循环收到同类拦截后，如实时额度未变化还重复提交不可执行采购，则结束会话，保留先前成交；减少数量至可承担金额、调整预算或出售取得收入后可继续。成交事务仍做最终校验，前置检查不替代原子扣款或后续活动预留保护。

市场动态从既有 `LifeRevision` 与安排的执行记录关联派生预算调整节点，并标注不计市场调用次数；历史记录无需回填。会话结束使用中性文案并展示实际离场原因。
