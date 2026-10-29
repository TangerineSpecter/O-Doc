# Agent 装备图标素材

装备图鉴、独立装备行囊、装备槽、战利品及市场共用 `EquipmentPortrait.tsx`。当前内置素材按稳定模板 ID 分派：下述 150 个目录条目采用 48×48 整数像素绘制；1～30 级无属性基础武器（`equip.sword`、`equip.axe`、`equip.bow`、`equip.dagger`、`equip.mage_staff`、`equip.staff`、`equip.holy_staff`）继续保持原已确认素材（`professionConcepts.ts` 与 `equipment-mage-staff-v1.svg`），新手护甲/手套/靴子及吊坠继续使用 `art/equipmentIcons.ts` 的透明 PNG。未知 ID 保留原绘制或占位回退，不根据中文名称猜测模板。

## 当前装备绘制（2026-10-29）

对照已确认基础长剑和炼金药水，使用深棕黑轮廓（`#261513`）、左上方亮面、部件级内部分隔轮廓、明确的材质色阶及紧凑透明留白；不使用平滑渐变或抗锯齿路径。SVG 只承载整数像素格，48 格细节在图鉴、小尺寸装备槽及角色持握切片（`equipment-instruments-v1.svg`）内共用。

| 范围 | 稳定ID | 数量与区别 |
| --- | --- | --- |
| 布甲 | `equip.armor.cloth.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；法袍垂褶、分片衣摆、织物手套与软靴，增加符纹及星辉纹样 |
| 皮甲 | `equip.armor.leather.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；缝线、交叠皮片、斜带、腰包与扣具，高阶使用兽纹/鳞纹 |
| 重甲 | `equip.armor.heavy.{body,hands,feet}`及`.30/.50/.70/.90` | 15件；宽肩、厚叠钢片、铆钉、关节护手与铁底靴 |
| 轻甲 | `equip.armor.light.{body,hands,feet}`及`.50/.70/.90` | 12件；短身非对称护肩、灵活叠片与轻巧腰片 |
| 板甲 | `equip.armor.plate.{body,hands,feet}`及`.50/.70/.90` | 12件；曲面胸铠、中脊、分层裙甲、金属手甲及护胫 |
| 分类头部 | 布甲`equip.head`系列；其他`equip.head.{leather,light,heavy,plate}`及`.30/.50/.70/.90` | 25件；法帽、皮帽、轻盔、战盔、面盔各五档；新系列名字与造型不再按冠冕处理 |
| 乐器（竖琴） | `equip.instrument`、`equip.instrument.element_low`、`.30/.50` 及四元素竖琴 | 9件目录模板（8种独立像素图，其中 `equip.instrument.element_low` 与 `equip.instrument` 同为10级无属性旅人竖琴，保持原外观）；高阶无属性为青羽天风 `吟风竖琴` 与弯月星辉 `月弦竖琴`；四元素竖琴分别为海螺珊瑚 `潮汐旅人竖琴`、玄岩原石 `琥岩旅人竖琴`、黑金龙脊 `琥岩吟风竖琴`、纯白四翼 `岚羽吟风竖琴`、炽凰火羽 `熔羽吟风竖琴` |
| 精制无属性武器（Lv.31～50） | `equip.{sword,axe,bow,dagger,mage_staff}.30` | 5件；采用秘银蓝钢、皇家鎏金翼饰与蓝宝石核心，包含金翼宽刃 `精制长剑`、皇家双翼战戟 `精制战斧`、金翼复合弓 `精制长弓`、锯背双血槽 `精制猎手短刃`、星轨金环 `精制法杖` |
| 四元素武器（潮汐/琥岩/岚羽/熔羽） | `equip.{sword,axe,bow,dagger,mage_staff,staff,holy_staff}` 及其 `.30` 的 `.element.{water,earth,wind,fire}` | 36件；不再复用10级基础武器轮廓，按元素与阶位绘制独立外形：潮汐系采用海浪齿刃、扇贝巨浪斧、珊瑚珍珠与旋涡水球；琥岩系区分10级玄武裂岩原石晶簇与31级黑金龙脊切割琥珀巨晶；岚羽系结合苍翠风刃、纯白层叠飞羽与破风金铃；熔羽系采用黑曜金甲、赤橙黄三阶凤凰火羽与炽白烈阳火核 |
| 盾牌 | `equip.offhand.{magic,small,large}_shield` | 3件；符文镶晶法盾、橡木拼板圆盾、厚钢中脊塔盾 |
| 戒指、双手剑、训练木剑 | `equip.ring`、`equip.two_handed_sword`、`equip.training_sword` | 3件；透空金戒；非对称钩刃巨剑、锯齿背、剑根缺口与长握柄；带木纹、收尖剑头、平直双刃、木护手和缠带的训练剑 |

`art/equipmentArtProfile.ts` 负责模板识别；`equipmentArtPalette.ts` 负责材质与等级配色；`equipmentPixelPainter.ts` 负责整数遮罩与亮暗倒角；`equipmentArmorArt.ts`、`equipmentRelicArt.ts`、`equipmentHeadArt.ts`、`equipmentInstrumentArt.ts`、`equipmentBladeArt.ts`（精制与四元素长剑、战斧、猎手短刃对角线像素绘制）、`equipmentBowStaffArt.ts`（精制与四元素长弓、单手法杖、双手秘法杖与晨祷权杖像素绘制）负责轮廓、结构与纹样；`equipmentArtDrawing.ts` 合成并缓存可见像素，按颜色压为少量 SVG 路径；`EquipmentRedesignArt.tsx` 负责图标渲染。`EquipmentPortrait.tsx` 优先匹配具体模板 ID 的独立重绘形象，保留右下角元素徽标。

角色持握与战斗场景同步：`equipment-instruments-v1.svg`（2544×48，共53帧）收录全部竖琴、训练木剑、双手剑及 46 款精制/四元素武器切片，在 `professionConcepts.ts`、`playerWeaponRegistration.ts`、`LayeredPlayerActor.ts`、`ObservationBattleScene.ts`、`PartyBattleScene.ts` 与 `observationPresentation.ts` 中按具体武器 ID 注册握点坐标、缩放、旋转角、镜像及施法/普攻锚点，使角色在分层换装、头像预览、单人与组队探索观察战斗中握持对应外观的精制与元素武器。

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

## 2026-10-29 精制武器、四元素武器与高阶竖琴重做及角色持握接入

除 1～30 级无属性基础武器（`equip.training_sword`、`equip.sword`、`equip.axe`、`equip.bow`、`equip.dagger`、`equip.mage_staff`、`equip.staff`、`equip.holy_staff`、`equip.two_handed_sword`、`equip.instrument` 及共享基础旅人竖琴外观的 `equip.instrument.element_low`）保持原确认素材不变外，其余 48 款武器（2 款高阶无属性竖琴 `吟风竖琴`/`月弦竖琴`、5 款 31 级精制无属性武器、6 款潮汐水系武器、14 款琥岩土系武器、13 款岚羽风系武器、8 款熔羽火系武器）全部重做为独立 48×48 像素造型，并同步生成 53 帧 `equipment-instruments-v1.svg` 切片供角色持握与探索观察战斗场景使用。

- 单元测试：`npm run test:equipment-art`（7 项测试）验证全部 150 个内置像素模板 ID 解析、149 幅独立栅格唯一性（`equip.instrument.element_low` 与 `equip.instrument` 同为 10 级旅人竖琴）、48 款重做武器的 48 种独立剪影轮廓、100% 四邻域连通性（无悬空像素或断柄）以及手部握持锚点必落于实心柄部像素。
- 跨入口与持握浏览器验证：纯 local 模式下通过 `scripts/test-equipment-art-browser.py` 在 `1440px`、`390px`、`320px` 视口验证 150 个模板的图鉴列表与详情弹窗、600 个公共展示图标（图鉴大/小图标、市场挂单、显式模板交易记录同源一致性）、900 个装备行囊卡片与装备槽实例、150 个战利品格子与掉落详情、双手剑与熔羽精制长剑市场详情，以及图鉴空搜索、加载中、错误状态；另在 `player-layered-preview.html` 验证角色持握各系重做武器的握点、比例、旋转与手部遮挡协调性。所有 API 请求均由 MSW 处理，无 501 或真实后端落盘。
