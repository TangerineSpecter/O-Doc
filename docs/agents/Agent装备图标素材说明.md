# Agent 装备图标素材

装备图鉴、独立装备行囊、装备槽、战利品及市场共用 `EquipmentPortrait.tsx`。当前内置素材按稳定模板 ID 分派：下述79个条目采用48×48整数像素绘制，长剑等已确认武器继续复用 `professionConcepts.ts`，新手护甲/手套/靴子及吊坠继续使用 `art/equipmentIcons.ts` 的透明PNG。未知ID保留原绘制或占位回退，不根据中文名称猜测模板。

## 当前装备绘制（2026-10-24）

对照已确认长剑和炼金药水，使用深棕轮廓、左上方亮面、明确的材质色阶及紧凑透明留白；不使用平滑渐变或抗锯齿路径。SVG只承载整数像素格，48格细节在图鉴和小尺寸装备槽内共用。

| 范围 | 稳定ID | 数量与区别 |
| --- | --- | --- |
| 布甲 | `equip.armor.cloth.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；法袍垂褶、分片衣摆、织物手套与软靴，增加符纹及星辉纹样 |
| 皮甲 | `equip.armor.leather.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；缝线、交叠皮片、斜带、腰包与扣具，高阶使用兽纹/鳞纹 |
| 重甲 | `equip.armor.heavy.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；宽肩、厚叠钢片、铆钉、关节护手与铁底靴 |
| 轻甲 | `equip.armor.light.{body,hands,feet}`及`.50/.70/.90` | 12件；短身非对称护肩、灵活叠片与轻巧腰片 |
| 板甲 | `equip.armor.plate.{body,hands,feet}`及`.50/.70/.90` | 12件；曲面胸铠、中脊、分层裙甲、金属手甲及护胫 |
| 头饰 | `equip.head`及`.30/.50/.70/.90` | 5件；旅者发饰、羽饰冠带、秘纹冠饰、星辉冠冕、苍穹冠冕分别有独立轮廓 |
| 盾牌 | `equip.offhand.{magic,small,large}_shield` | 3件；符文镶晶法盾、橡木拼板圆盾、厚钢中脊塔盾 |
| 戒指、双手剑 | `equip.ring`、`equip.two_handed_sword` | 2件；透空斜视金戒与多面宝石；宽直刃、长握柄和独立护手的双手剑，不再使用训练剑兜底 |

`art/equipmentArtProfile.ts`负责模板识别；`equipmentArtPalette.ts`负责材质与等级配色；`equipmentPixelPainter.ts`负责整数遮罩与亮暗倒角；`equipmentArmorArt.ts`、`equipmentRelicArt.ts`负责轮廓、结构与纹样；`equipmentArtDrawing.ts`合成并缓存可见像素，按颜色压为少量SVG路径；`EquipmentRedesignArt.tsx`只负责显示。各等级保留原名称和身份，同时在相应阶段增加肩饰、缝线、纹样、护片、嵌石或冠尖。

市场的 `source.equipmentId` 是唯一实例ID，不能当作素材模板。`MarketListingItemIcon.tsx`优先使用既有冻结快照的 `equipmentSnapshot.templateId`，类型补全同名可选字段；老载荷仍保留原回退。没有新增API、数据库字段或同步格式。

## 保留的PNG素材目录

以下保留素材位于 `frontend_react/src/assets/combat/`，原版使用内置 imagegen 生成，参考 `player-weapons-concept-v1.png`。本轮79件装备为代码原生像素绘制，没有调用生图服务。

| 装备 ID | 文件 | 主体提示词 |
| --- | --- | --- |
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

旧 `equipment-head-v1.png` 已退出头饰运行时映射，当前 `equip.head` 使用48格发饰。保留素材和新绘制都随前端代码发布，不进入业务持久化或WebDAV；装备实例、随机属性、历史事实与规则保持原数据。图标修改不代表角色穿戴分层或战斗中武器动画改变。

## 检查记录

2026-10-24：`npm run test:equipment-art`验证生产CSV中的79个条目覆盖、实际像素唯一性、透明留白及边界，五类衣身、三面盾与五款头饰轮廓互异，戒指保留透空中心，双手剑保留长握柄。Node22类型检查、局部ESLint及生产构建通过。

纯local使用 `scripts/test-equipment-art-browser.py` 与类型化 `mocks/agentWorld/equipmentArtSamples.ts`：在1440/390/320px逐个选择79个图鉴条目，检查图鉴列表/详情；316个公共图标实例对照模板完整元数据、只有模板ID、真实实例ID+模板快照的市场商品，以及明确携带模板ID的旧格式记录；另核对全部79件装备卡片、装备槽、战利品格子及双手剑掉落详情、市场详情。空筛选、加载、错误均通过；API响应全部来自MSW，无501、页面异常或横向溢出。此记录不代表真实后端或生产部署验收。

完整适用性与缺口见[物品图片维护说明](./Agent物品图片维护说明.md)。特别是只有实例ID而没有模板信息的真实交易历史继续原占位；不得用本地显式模板样例声称该链路已修复。
