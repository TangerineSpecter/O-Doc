# Agent 物品图片维护

入口：Agent 世界管理 → 物品图片。物品列表支持角色、名称、配图状态筛选，默认未配图优先；图标库支持上传、搜索、改名和删除未使用图片。

## 使用

点击“设置图片”或“更换图片”，上传新图或选择库中已有图标，最后点击“保存关联”。上传成功会展示实际尺寸和大小，但不会直接修改物品。规范化完整名称匹配提供“同名推荐”，仍需人工选择和保存；只忽略首尾空白、连续空白和明确的“虚拟商品”末尾后缀。搜索提供名称关键词结果，不使用 AI 判断物品身份。

数量大于一的同一物品记录共用图片；不同记录可人工复用。替换只改变当前记录，清除关联不删除库中图片。旅行格子、角色行囊和物品详情共用关联，完整居中显示；无图或加载失败时使用原占位。旅行卡片保持 130px、高度固定、两行铺满的方格布局。

## 图片规则

接受静态 PNG、JPEG、WebP，最大 20MB、1600 万像素；拒绝损坏、动画、SVG 等文件。后端 Pillow 纠正 EXIF 方向，按比例缩到最长边不超过 256px，小图不放大，非正方形内容放入 256×256 透明画布，输出质量 90 的 WebP，并移除原始元数据。只保存压缩图；按结果 MD5 在当前账号内去重，文件大小由图像内容决定。

## 接口与职责

- `GET/POST /api/settings/agent-world/item-icons/`：分页、搜索、itemId 推荐、上传。
- `PATCH/DELETE /api/settings/agent-world/item-icons/<assetId>/`：改名、删除未使用图标。
- `GET /api/settings/agent-world/inventory/manage/`：page/pageSize、agentId、search、picture=all/missing/set；返回 list、agents、分页信息。
- `PATCH /api/settings/agent-world/inventory/<itemId>/icon/`：`{assetId: "资源ID"}` 绑定，`{assetId: null}` 清除。
- 原背包接口仍返回列表，增加 iconAssetId 和 iconUrl。

后台 `item_icon_images.py` 处理图片，`item_icons.py` 负责资源保存与关联，`item_icon_views.py` 负责接口。前端 API、类型、列表和选择 Hook、管理组件及通用图片回退组件分别维护。普通资源上传不能指定 item_icon，已有图标不可经普通资源接口覆盖文件。

图片展示复用认证资源组件，通过携带当前账号 Token 的下载接口获取 Blob，并以对象 URL 展示；组件卸载或资源切换时取消旧请求并释放对象 URL。上传成功预览使用同一组件；无图、下载失败和图片解码失败均保留占位，不放宽资源读取权限。

接口检查账号、有效状态、图片类型与文件存在性；使用中的图标禁止删除。数据与文件参与现有 WebDAV/Blob 同步，设备先升级迁移再恢复新快照，具体见数据同步逻辑说明。

## 验收

后端测试使用 Django 独立测试数据库及临时媒体目录：`python manage.py test system_settings.agent_world.test_item_icons`。第一版提供人工上传、推荐和复用，不包含自动生成、自动绑定、批量绑定或商品模板。
