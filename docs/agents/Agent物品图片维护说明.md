# Agent 物品图片维护

入口：Agent 世界 → 物品图鉴。选中条目后可设置或更换图片；搜索框旁的“图标库”用于上传、搜索、改名和删除未使用图片。萝卜、土豆、玉米及其种子的生长秒数、种子价、产量和回收价也从对应图鉴条目的“编辑作物规则”入口维护，不再放在农场配置弹窗里。

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

图片展示复用认证资源组件，通过携带当前账号 Token 的下载接口获取 Blob，并以对象 URL 展示；组件卸载或资源切换时取消旧请求并释放对象 URL。上传成功预览使用同一组件；无图、下载失败和图片解码失败均保留占位，不放宽资源读取权限。

接口检查账号、有效状态、图片类型与文件存在性；被图鉴或背包物品引用的图标禁止删除。未设置自定义图时，图鉴继续显示现有像素图标；自定义农作物图只改变图鉴卡片，不改变农场地块的像素生长形象。关联数据与图片文件参与现有 WebDAV/Blob 同步，无新增数据库字段或迁移，具体见数据同步逻辑说明。

## 验收

后端测试使用 Django 独立测试数据库及临时媒体目录：`python manage.py test system_settings.agent_world.test_item_icons`。第一版提供人工上传、推荐和复用，不包含自动生成、未来新购记录自动绑定或商品模板；图鉴支持现有同组记录统一绑定。
