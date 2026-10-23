# Agent 物品图片维护

核对日期：2026-10-23。本文是物品图标改动的统一维护入口，覆盖内置绘制、自定义图片、接口投影和跨页面展示。下表是改动必查范围，不代表所有入口均已完成实测。

入口：Agent 世界 → 物品图鉴。选中条目后可设置或更换图片；搜索框旁的“图标库”用于上传、搜索、改名和删除未使用图片。萝卜、土豆、玉米及其种子的生长秒数、种子价、产量和回收价也从对应图鉴条目的“编辑作物规则”入口维护，不再放在农场配置弹窗里。

## 开发时先确定图标来源

图标修改必须沿“稳定身份 → 图片来源 → API 字段 → 公共渲染 → 全部展示入口 → local mock → 验收”检查。新增素材文件或只改图鉴，不代表背包、市场和历史记录已接通。

| 类型 | 稳定身份与内置素材入口 | 自定义图片与读取边界 |
| --- | --- | --- |
| 鱼 | 库存 SKU 为 `fish.<id>`；`Fishing/FishPortrait.tsx` 接收去掉 `fish.` 的 ID，复用 `fishVisuals.ts`、`fishArtDrawing.ts` | `FishPortrait` 本身只绘制内置形象；外围是否支持自定义图片需分别核对，不能假定继承 |
| 鱼饵 | `bait.*`；`Fishing/BaitPortrait.tsx`、`baitArtDrawing.ts` | 鱼饵目录、市场、携带清单及背包分别检查 |
| 炼金药水 | `elixir.*`；`Alchemy/ElixirPortrait.tsx` 复用 `Combat/atlas/PotionPortrait.tsx` 及 `Combat/art/potionVisuals.ts`、`potionArtDrawing.ts` | 图鉴图片保存在 `AlchemyCatalog.item_icons`，由 `alchemy_icons.py` 关联、`alchemy_queries.py` 投影；背包是否读取同一映射必须单独检查 |
| 普通战斗药剂 | `potion.*`，库存可带 `combat.` 前缀；`PotionPortrait.tsx` | 与炼金药水是不同类别，不按中文名称或瓶子外形合并身份 |
| 美食 | `dish.*`；`Cooking/RecipePortrait.tsx`、`RecipePixelPortrait.tsx` | `CookingCatalog.item_icons`；库存通过 `travel_views.py` 的 `inventory_context` 和 `InventorySerializer` 投影目录图片 |
| 农牧物品 | 稳定 SKU；`Farm/assets.ts` | `FarmCatalog.rules.item_icons`；农场场景生长精灵与图鉴自定义图片是不同展示规则 |
| 战斗材料、装备 | `Combat/atlas/MaterialPortrait.tsx`、`EquipmentPortrait.tsx` | 检查库存/市场中的前缀转换、装备快照、稀有度和详情入口；装备素材另见[装备图标说明](./Agent装备图标素材说明.md) |
| 旅行纪念品等库存图片 | `AgentInventoryItem.icon_asset_id` | 记录级关联与目录级 SKU 关联分开核对；不能将一条库存记录的设置当成全目录设置 |

上述前端路径相对 `frontend_react/src/components/`，后端路径相对 `system_settings/agent_world/`。SKU、鱼种 ID、配方 ID、资源 ID 不得混用；数量、星级、品质或装备词缀不能意外改变图标身份。

## 跨页面展示检查表

每次修改图标按适用性逐行记录“通过 / 不适用及原因 / 待修”，不能仅验证一个入口。历史与战报可能展示冻结快照，应先确认采用当前素材还是历史图片，不随意改写历史事实。

| 展示位置 | 当前主要代码入口 | 必查内容 |
| --- | --- | --- |
| 居民背包格子及物品详情 | `AgentWorld/InventoryBackpack.tsx`、`InventoryItemDetails.tsx` → `InventoryItemIcon.tsx` | 两处均可显示，SKU 路由正确，自定义图优先且失败回退内置图 |
| 综合物品图鉴列表及详情 | `AgentWorld/ItemCatalogDialog.tsx`，后端 `item_catalog.py` | 列表/详情一致；未拥有、数量为零时是否仍属于目录；不重复收录专属图鉴物品 |
| 钓鱼图鉴与鱼种详情 | `Fishing/FishingSpeciesCard.tsx`、`FishingSpeciesDetails.tsx` | 鱼种 ID 与绘制表覆盖；鱼饵材料图一致 |
| 出钓与鱼饵记录 | `Fishing/FishingTripCard.tsx`、`FishingTripDetails.tsx`、`FishingResidentCard.tsx` | 渔获、鱼王、携带鱼饵和事件明细；记录无图时有合理回退 |
| 炼金图鉴列表及详情 | `Alchemy/ElixirCard.tsx`、`ElixirDetails.tsx` → `ElixirPortrait.tsx` | 自定义图、内置药水、星级数量与详情保持一致；炼金药水不回填综合物品图鉴 |
| 美食图鉴与制作详情 | `Cooking/RecipePortrait.tsx`、`RecipeDetails.tsx` | 列表、详情、材料及制作记录中实际显示图标的位置 |
| 市场商店、补给、挂单及详情 | `Market/MarketShop.tsx`、`MarketSupplies.tsx`、`MarketListingItemIcon.tsx`、`MarketDetailSidebar.tsx` | 商品支持范围、发布后资源字段、SKU 分派；不适用的物品注明不可交易等原因 |
| 交易和收支记录 | `Market/TransactionItemIcon.tsx` 及对应记录调用方 | 当前记录及历史快照使用的字段、图标和回退路径 |
| 探索准备、携带物、战报、奖励和装备槽 | `Combat/` 对应业务组件；搜索 `PotionPortrait`、`MaterialPortrait`、`EquipmentPortrait` 及 SKU | 按本次物品业务逐个列出实际入口，不把“公共组件已改”视为所有调用方已覆盖 |
| 图片维护及资源库 | `AgentWorld/ItemIconPicker.tsx`、`ItemIconLibraryDialog.tsx`，`assets` 资源引用查询 | 上传预览、替换、清除、引用计数、在用删除保护和账号管理边界 |

表格不是封闭名单。提交前还须用 `rg` 搜索本次 SKU 前缀、图标组件、`iconUrl` / `iconAssetId` 及对应后端字段，补充新的调用方。新增展示入口时反向更新本表。

## 每次改动的验收记录

- 写明涉及的物品类型、稳定 ID、内置素材/自定义图片来源，以及本次实际影响的展示位置。
- 核对后端目录、库存、市场、详情和记录的字段投影，以及前端类型和 local mock；仅前端具备渲染分支但接口没有图片字段，仍算未完成。
- 有自定义图片的入口验证：内置默认图 → 设置 → 列表/详情回读 → 替换 → 清除；同时检查资源不存在、下载失败、解码失败、正常 Token 认证与账号管理边界。保留 `ItemIconImage` 的认证下载和失败回退。
- 纯 local 验证有数据、空数据、加载、错误，未知接口仍返回501；列表、详情及关联弹窗必须一起覆盖。真实后端验收另行记录，不能以 mock 代替。
- 浏览器检查宽窄屏、缩放与透明留白、数量/星级徽标是否遮挡；静态图标变化不自动改变战斗动画或农场场景。
- 涉及关联持久化、引用统计或媒体链路时，核对同步导出/恢复、资源读取和在用删除保护；新增字段仍须先确认同步范围。
- 最终说明分别列出已验证入口、明确不适用入口和未完成项；不能只写“图标已更新”。

## 当前已确认的链路缺口

2026-10-23 静态核对：炼金图鉴通过 `AlchemyCatalog.item_icons` 返回自定义图，但背包 `travel_views.py` 的目录图片上下文仅读取 `CookingCatalog.item_icons`，`InventorySerializer` 也仅对 `dish.*` 使用目录映射。`InventoryItemIcon.tsx` 虽支持 `elixir.*` 的内置绘制和库存行的 `iconUrl`，仍不能保证“在炼金图鉴设置图片后，背包自动采用同一图片”。这是接口投影缺口，需要单独修复并按上表验收；本次文档补全没有修改该运行逻辑。

## 使用

在图鉴中点击“设置图片”或“更换图片”，上传新图或选择库中已有图标，最后点击“保存关联”。上传成功会展示实际尺寸和大小，但不会直接修改物品。规范化完整名称匹配提供“同名推荐”，仍需人工选择和保存；只忽略首尾空白、连续空白和明确的“虚拟商品”末尾后缀。搜索提供名称关键词结果，不使用 AI 判断物品身份。

数量大于一的同一物品记录共用图片。从图鉴设置纪念品图片时，按当前图鉴相同的 SKU 或名称、品质和目的地分组，在事务中更新当前账号的所有现有匹配记录；不同分组保持独立。原背包单条记录接口仍只修改当前记录。清除关联不删除库中图片。旅行格子、角色行囊和物品详情共用关联，完整居中显示；无图或加载失败时使用原占位。旅行卡片保持 130px、高度固定、两行铺满的方格布局。

## 图片规则

接受静态 PNG、JPEG、WebP，最大 20MB、1600 万像素；拒绝损坏、动画、SVG 等文件。后端 Pillow 纠正 EXIF 方向，按比例缩到最长边不超过 256px，小图不放大，非正方形内容放入 256×256 透明画布，输出质量 90 的 WebP，并移除原始元数据。只保存压缩图；按结果 MD5 在当前账号内去重，文件大小由图像内容决定。

## 接口与职责

- `GET/POST /api/settings/agent-world/item-icons/`：分页、搜索、itemId 推荐、上传。
- `PATCH/DELETE /api/settings/agent-world/item-icons/<assetId>/`：改名、删除未使用图标。
- `PATCH /api/settings/agent-world/item-catalog/<sku>/icon/`：设置或清除农牧图鉴 SKU 的图片。
- `PATCH /api/settings/agent-world/item-catalog/inventory/<itemId>/icon/`：用图鉴代表记录定位分组，统一设置或清除所有现有匹配库存记录的图片，返回 updatedCount。
- `PATCH /api/settings/agent-world/farm-catalog/crops/<cropKind>/`：编辑作物规则。
- `GET /api/settings/agent-world/inventory/manage/`：page/pageSize、agentId、search、picture=all/missing/set；返回 list、agents、分页信息。
- `PATCH /api/settings/agent-world/inventory/<itemId>/icon/`：`{assetId: "资源ID"}` 绑定，`{assetId: null}` 清除。
- 原背包接口仍返回列表，增加 iconAssetId 和 iconUrl。

后台 `item_icon_images.py` 处理图片，`item_icons.py` 负责资源保存与背包物品关联，`item_catalog_icons.py` 负责稳定 SKU 图鉴关联，`item_icon_views.py` 与 `item_catalog_views.py` 负责接口。图鉴 SKU → Asset ID 映射保存在同步的 `FarmCatalog.rules.item_icons` 中；背包物品仍使用 `AgentInventoryItem.icon_asset_id`；图鉴批量关联逐条调用 save，保留现有同步修订钩子，无新增持久化字段。未来新购记录不会自动继承此批量操作。普通资源上传不能指定 item_icon，已有图标不可经普通资源接口覆盖文件。

图片展示复用认证资源组件，通过携带当前账号 Token 的下载接口获取 Blob，并以对象 URL 展示；组件卸载或资源切换时取消旧请求并释放对象 URL。上传成功预览使用同一组件；无图、下载失败和图片解码失败均保留占位。按现有资源展示规则，背包或图鉴已引用的图标允许展示读取；图标库查询、改名、删除和物品关联仍按账号隔离。仅上传且尚无其他可见内容引用的图标，其他账号或匿名访问返回404；展示读取不授予图标管理权限。

接口检查账号、有效状态、图片类型与文件存在性；被图鉴或背包物品引用的图标禁止删除。未设置自定义图时，图鉴继续显示现有像素图标；自定义农作物图只改变图鉴卡片，不改变农场地块的像素生长形象。关联数据与图片文件参与现有 WebDAV/Blob 同步，无新增数据库字段或迁移，具体见数据同步逻辑说明。

## 验收

后端测试使用 Django 独立测试数据库及临时媒体目录：`python manage.py test system_settings.agent_world.test_item_icons`。第一版提供人工上传、推荐和复用，不包含自动生成、未来新购记录自动绑定或商品模板；图鉴支持现有同组记录统一绑定。
