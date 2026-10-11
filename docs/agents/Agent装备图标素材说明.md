# Agent 装备图标素材

装备图鉴通过 `EquipmentPortrait.tsx` 共用列表与详情展示。武器继续复用 `professionConcepts.ts` 中的原素材，其余装备由 `art/equipmentIcons.ts` 按目录稳定 ID 关联透明 PNG；未知 ID 保留原图标回退。

## 素材目录

文件统一保存在 `frontend_react/src/assets/combat/`，使用内置 imagegen 生成，参考 `player-weapons-concept-v1.png` 的像素风格。

| 装备 ID | 文件 | 主体提示词 |
| --- | --- | --- |
| equip.head | equipment-head-v1.png | 银色头环、金边、蓝色宝石 |
| equip.body | equipment-body-v1.png | 银钢胸甲与肩甲、皮革系带、金铆钉 |
| equip.hands | equipment-hands-v1.png | 成对棕色皮手套、钢护腕、金扣 |
| equip.feet | equipment-feet-v1.png | 成对棕色冒险靴、翻折靴口、钢鞋头、金扣 |
| equip.charm | equipment-charm-v1.png | 金色吊坠、青色菱形宝石、短皮绳 |
| equip.boss.moss_cave | equipment-boss-moss-cave-v1.png | 翠绿宝石、金色冠尖、苔叶 |
| equip.boss.abandoned_mine | equipment-boss-abandoned-mine-v1.png | 棱角铁框、琥珀矿晶、金铆钉 |
| equip.boss.mist_forest | equipment-boss-mist-forest-v1.png | 银月、绿叶、紫色宝石 |
| equip.boss.sunken_ruins | equipment-boss-sunken-ruins-v1.png | 金色贝壳框、蓝色珍珠、海浪纹 |
| equip.boss.ember_fortress | equipment-boss-ember-fortress-v1.png | 火焰形铁框、橙红宝石、金边 |
| equip.boss.star_rift | equipment-boss-star-rift-v1.png | 紫色宝石、金星、银色月牙 |

通用生成提示词：Use case: stylized-concept. Create exactly ONE isolated RPG inventory equipment icon. Input reference image is STYLE REFERENCE ONLY, do not reproduce weapons. Match the weapon sprites closely: chunky square hard-edged pixels, dark brown almost black 1-2 logical pixel outline, very limited palette, bright upper left metal highlight, simple 3-tone pixel shading, charming classic 32-bit RPG pixel sprite. Design on approximately 48x48 logical pixel grid enlarged with nearest-neighbor. Square canvas, centered item, compact silhouette, visible detail at 74px UI size. Item occupies about 75% of canvas width and height, generous transparent margin. No background, floor, shadow, text, labels, cards, border, watermark, smooth gradients, antialiasing or realism. Transparent PNG.

本次只补充随前端发布的静态图片与 ID 映射，不新增数据库字段、装备条目或同步数据，无需扩展 WebDAV 同步。不代表已完成角色穿戴分层或战斗装备外观绑定。
