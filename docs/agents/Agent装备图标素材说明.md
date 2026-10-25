# Agent 装备图标素材

装备图鉴、独立装备行囊、装备槽、战利品及市场共用 `EquipmentPortrait.tsx`。当前内置素材按稳定模板 ID 分派：下述103个条目采用48×48整数像素绘制，长剑等已确认武器继续复用 `professionConcepts.ts`，新手护甲/手套/靴子及吊坠继续使用 `art/equipmentIcons.ts` 的透明PNG。未知ID保留原绘制或占位回退，不根据中文名称猜测模板。

## 当前装备绘制（2026-10-25）

对照已确认长剑和炼金药水，使用深棕轮廓、左上方亮面、明确的材质色阶及紧凑透明留白；不使用平滑渐变或抗锯齿路径。SVG只承载整数像素格，48格细节在图鉴和小尺寸装备槽内共用。

| 范围 | 稳定ID | 数量与区别 |
| --- | --- | --- |
| 布甲 | `equip.armor.cloth.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；法袍垂褶、分片衣摆、织物手套与软靴，增加符纹及星辉纹样 |
| 皮甲 | `equip.armor.leather.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；缝线、交叠皮片、斜带、腰包与扣具，高阶使用兽纹/鳞纹 |
| 重甲 | `equip.armor.heavy.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；宽肩、厚叠钢片、铆钉、关节护手与铁底靴 |
| 轻甲 | `equip.armor.light.{body,hands,feet}`及`.50/.70/.90` | 12件；短身非对称护肩、灵活叠片与轻巧腰片 |
| 板甲 | `equip.armor.plate.{body,hands,feet}`及`.50/.70/.90` | 12件；曲面胸铠、中脊、分层裙甲、金属手甲及护胫 |
| 分类头部 | 布甲`equip.head`系列；其他`equip.head.{leather,light,heavy,plate}`及`.30/.50/.70/.90` | 25件；法帽、皮帽、轻盔、战盔、面盔各五档；新系列名字与造型不再按冠冕处理 |
| 乐器 | `equip.instrument`及`.30/.50` | 3件；旅人／吟风／月弦竖琴；高两档不再进入当前目录，旧快照仍保留图标回退 |
| 盾牌 | `equip.offhand.{magic,small,large}_shield` | 3件；符文镶晶法盾、橡木拼板圆盾、厚钢中脊塔盾 |
| 戒指、双手剑、训练木剑 | `equip.ring`、`equip.two_handed_sword`、`equip.training_sword` | 3件；透空金戒；非对称钩刃巨剑、锯齿背、剑根缺口与长握柄；带木纹、收尖剑头、平直双刃、木护手和缠带的训练剑 |

`art/equipmentArtProfile.ts`负责模板识别；`equipmentArtPalette.ts`负责材质与等级配色；`equipmentPixelPainter.ts`负责整数遮罩与亮暗倒角；`equipmentArmorArt.ts`、`equipmentRelicArt.ts`、`equipmentHeadArt.ts`、`equipmentInstrumentArt.ts`负责轮廓、结构与纹样；`equipmentArtDrawing.ts`合成并缓存可见像素，按颜色压为少量SVG路径；`EquipmentRedesignArt.tsx`只负责显示。各等级保留原名称和身份，同时在相应阶段增加肩饰、缝线、纹样、护片、嵌石或甲片。

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

旧 `equipment-head-v1.png` 已退出头饰运行时映射，当前 `equip.head` 使用48格学徒法帽。保留素材和新绘制都随前端代码发布，不进入业务持久化或WebDAV；装备实例、随机属性、历史事实与规则保持原数据。图标修改不代表角色穿戴分层或战斗中武器动画改变。

## 检查记录

2026-10-24：`npm run test:equipment-art`验证生产CSV中的79个条目覆盖、实际像素唯一性、透明留白及边界，五类衣身、三面盾与五款头饰轮廓互异，戒指保留透空中心，双手剑保留长握柄。Node22类型检查、局部ESLint及生产构建通过。

纯local使用 `scripts/test-equipment-art-browser.py` 与类型化 `mocks/agentWorld/equipmentArtSamples.ts`：在1440/390/320px逐个选择79个图鉴条目，检查图鉴列表/详情；316个公共图标实例对照模板完整元数据、只有模板ID、真实实例ID+模板快照的市场商品，以及明确携带模板ID的旧格式记录；另核对全部79件装备卡片、装备槽、战利品格子及双手剑掉落详情、市场详情。空筛选、加载、错误均通过；API响应全部来自MSW，无501、页面异常或横向溢出。此记录不代表真实后端或生产部署验收。

完整适用性与缺口见[物品图片维护说明](./Agent物品图片维护说明.md)。特别是只有实例ID而没有模板信息的真实交易历史继续原占位；不得用本地显式模板样例声称该链路已修复。

## 2026-10-25 头部分类基础验证记录（第一阶段）

五类头部共25款，沿用用户确认等级和命名。布甲五款为学徒／秘纹／月纹／星辉／苍穹法帽，轮廓均为软布帽顶和帽檐。皮甲为旅者／猎手／影豹／雷隼／龙蜥皮帽；轻甲为轻钢护额、精钢／影纹／秘银／星陨轻盔；重甲为铆铁／锁鳞／赤钢／玄铁／龙鳞战盔；板甲为铸铁／精钢／壁垒／圣铠／不朽面盔。原稳定ID沿用布甲系列，新增20个模板ID。公共绘制覆盖99件条目，像素回归5项和Node22类型检查通过；114项相关隔离后端回归通过。1440／390／320px纯local核对25个头部的图鉴、99件共用图标／装备行囊／装备槽，以及学徒法帽战利品和市场详情；空筛选／加载／错误四态无缺失mock或页面异常，12次API均由MSW处理。诗人职业和乐器仍在实施，见对应执行检查表。历史2026-10-24的79件验收保留其原范围，不表示本次新增部分已完成验收。


## 2026-10-25 吟游诗人接入

新增五档乐器后维护104个模板，公共图标仍从稳定模板ID分派。角色实握素材`equipment-instruments-v1.svg`复用同一48格琴体，七套服装为`player-bard-outfits-v1.svg`；静态图鉴、动态职业详情、14个技能预览和组队场景分别使用既有合成与分层注册。原生SVG素材随前端发布，无新媒体上传或同步字段。装备页诗人系不再落到战士默认立绘。

5项装备像素检查、职业／技能覆盖与Node22类型检查通过。三种屏宽检查五款竖琴图鉴详情，104件行囊／装备槽公共绘制、同源四处图标一致、竖琴奖励与市场详情，以及七职业形象／音乐HUD／战报与14主动预览。当前部署和远端同步状态以执行检查表为准，不将本地浏览器当作生产验收。

## 2026-10-25 武器修订

训练木剑与双手剑改用公共48格绘制，图鉴、行囊、装备槽、战利品、市场及带模板ID的交易记录共用新图。当前目录为三档竖琴；以上五档乐器验收记录是移除前的历史范围。旧乐器图标解析保留，仅供冻结快照兼容。素材修订不改变角色战斗武器动作。

## 法杖轴线修订（2026-10-25）

`equip.mage_staff`沿用`equipment-mage-staff-v1.svg`与32×56画布，将紫晶、金属托座、直柄和尾箍统一在x=16轴线，去除悬空碎饰。共享图标入口和稳定ID不变；角色握点同步为(16,48)，法术发射位置改到杖头中心，避免替换图后握空或偏移。素材随前端发布，无持久化或同步变化。

木剑连接修正：握柄先绘制并穿入护手和剑根，护手覆盖接合处；剑头改收尖、剑身改直边双斜面。新增四邻域连通检查，保证全部实色像素属于一个连通整体，防止握柄断开或缠带出现悬空像素。六项像素检查通过。

双手剑当前轮廓：沿左下至右上对角线展开，剑尖回钩，一侧锯齿背、一侧弧形宽刃，剑根保留开放缺口；偏置铆接底座直接连接长握柄，不再使用对称双刃或十字护手。保持48格公共绘制及原稳定模板ID，装备数值与角色动作不变。
