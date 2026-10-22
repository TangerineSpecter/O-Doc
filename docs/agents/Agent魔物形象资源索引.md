# Agent 魔物形象资源索引

制作规范见[魔物形象与战斗动画设计规范](./Agent魔物形象与战斗动画设计规范.md)。新增角色在此登记资源与确认状态；验收记录写在对应角色小节中。路径相对仓库根目录。

**后续共用效果约定（2026-10-22）：受击和倒下统一使用当前新芽草甸像素版，不再为其他魔物另做设计或重复确认。** 受击采用现有短暂闪白、回震与恢复；倒下采用闪白裂纹后原色像素炸开、弹跳落地并保留碎片。后续只适配体型、原色、锚点和朝向，新增形象/待机/移动/攻击及已有技能仍按需制作。复用入口与规则见[设计规范第 4 节](./Agent魔物形象与战斗动画设计规范.md#4-基础动作规范)。下文旧角色的独立受击/倒下记录仅作历史说明，不表示本次已批量替换旧角色代码。

## 角色与接入状态

2026-10-22 洞窟 PNG 更新：用户确认将洞穴蝙蝠、苔石兽（重做第二版）、苔冠巨兽接入图鉴。列表与详情统一使用 `frontend_react/src/assets/combat/monster-cave-bat-v1.png`、`monster-moss-beast-v2.png`、`monster-moss-king-v1.png`，在 `art/monsterPixelArt.ts` 注册为 `approved`。三只详情当前显示静态 PNG，不再播放旧矢量待机；旧独立动作预览保留，不能视为新 PNG 已有动作。洞穴晶蜥继续使用已有 PNG。本次仅替换前端内置图鉴资源，无持久字段及同步变更。

| 魔物 ID | 名称 | 预览入口 | 形象与基础动作 | 图鉴 | 技能特效 | 正式战斗动画 |
| --- | --- | --- | --- | --- | --- | --- |
| `monster.slime` | 软泥怪 | `docs/agents/demo/SproutMeadow_v1.html?monster=slime` | 新像素版已确认；五个基础动作 | 新版静态帧与待机动画已接入 | 无额外主动技能 | 已接入探索观察演示及确认击败粉碎 |
| `monster.fuzzy_ear_rabbit` | 绒耳兔 | `frontend_react/combat-atlas-preview.html?tab=monsters&monster=monster.fuzzy_ear_rabbit` | 新像素版已确认；五个基础动作 | 新版静态帧与待机动画已接入 | 无额外主动技能 | 已接入探索观察演示及确认击败粉碎 |
| `monster.leafshell_beetle` | 叶壳甲虫 | `frontend_react/combat-atlas-preview.html?tab=monsters&monster=monster.leafshell_beetle` | 新像素版已确认；五个基础动作 | 新版静态帧与待机动画已接入 | 无额外主动技能 | 已接入探索观察演示及确认击败粉碎 |
| `monster.dawnfire_glowbug` | 晨光萤 | `frontend_react/combat-atlas-preview.html?tab=monsters&monster=monster.dawnfire_glowbug` | 新像素版已确认；五个基础动作 | 新版静态帧与待机动画已接入 | 无额外主动技能 | 已接入探索观察演示及确认击败粉碎 |
| `monster.cave_crystal_lizard` | 洞穴晶蜥 | `frontend_react/combat-atlas-preview.html?tab=monsters&monster=monster.cave_crystal_lizard` | 静态像素形象已接入 | 已接入 | 无 | 动作未制作 |
| `monster.cave_bat` | 洞穴蝙蝠 | `frontend_react/combat-atlas-preview.html?tab=monsters&monster=monster.cave_bat` | 新 PNG 已确认；新动作待制作 | 新 PNG 静态图已接入 | 旧矢量“闪身”示意保留 | 待接入 |
| `monster.moss_beast` | 苔石兽 | `frontend_react/combat-atlas-preview.html?tab=monsters&monster=monster.moss_beast` | 新 PNG 第二版已确认；新动作待制作 | 新 PNG 静态图已接入 | 旧矢量“护体”示意保留 | 待接入 |
| `monster.moss_king` | 苔冠巨兽 | `frontend_react/combat-atlas-preview.html?tab=monsters&monster=monster.moss_king` | 新 PNG 石鹿已确认；新动作待制作 | 新 PNG 静态图已接入 | 旧矢量“重击”“护体”示意保留 | 待接入 |

## 新芽草甸像素动作（2026-10-22，已接入探索观察与图鉴）

用户指定参考 `demo/MonsterTemplate_v1.html`，新增独立 [新芽草甸演武场](./demo/SproutMeadow_v1.html)。第六版已获用户确认并按要求接入探索观察，形象沿用第五版：采用模板灰烬领主同类的完整 128×128 索引像素精灵，使用项目现有绒耳兔、叶壳甲虫、晨光萤精细原图保留毛发、叶脉、甲片、翅膜与分节结构，64 色调色板保留材质层次。软泥怪保留模板水滴轮廓与变形动作、第四版圆眼睛；恢复鲜亮水蓝色、亮白弧面高光、青色透光边缘与上浮气泡，增加缓慢闪亮的四角星芒和底部细光带，表达晶亮果冻质感。独立舞台保持 320×180，提供 `idle / move / attack / hit / defeat` 五个动作。随后同步替换四只的图鉴列表静态帧与详情待机动画，图鉴和探索观察复用相同像素绘制。

- 独立审阅参数：`?monster=slime`、`?monster=rabbit`、`?monster=beetle`、`?monster=glowbug`。
- 当前四只静态对照：[第五版预览](./demo/sprout-meadow/preview-v5.png)；[软泥怪光泽调整前后](./demo/sprout-meadow/slime-v5-comparison.png)。此前静态图保留作迭代记录。
- 绒耳兔分别驱动左右垂耳和绒尾；甲虫分别驱动触角与足部；晨光萤分别驱动翅膜、触角与腹部流光。部位按原图像素遮罩采样，待机保持原生尺寸并关闭插值，避免缩放模糊材质。四只都使用普通攻击，不新增技能或战斗规则。
- 角色配置、角色绘制、舞台绘制、动作采样、粒子特效、页面控制与样式分别保存在 `demo/sprout-meadow/{monsters,characters,renderer,motion,effects,studio}.js` 和 `studio.css`；软泥材质位于 `template-slime.js`。`sprite-data.js` 保存三只完整精灵，可运行 `.venv/bin/python docs/agents/demo/sprout-meadow/build-sprites.py` 从原图重新编码。缩略图与动画使用同一绘制源，四只共用演示草甸背景。
- 支持暂停、重置、连续演示、0.25–1.5 倍速、左右朝向、图鉴尺寸、素色舞台、夜色、网格、材质分层及可选音效；数字 1–5 切动作，空格暂停，R 重置。倒下保持终态，连续演示结束后也不自动复活。
- 第六版按用户要求直接移植模板的击败粉碎流程：0.26 秒闪白、裂纹与震颤后，完整角色立刻消失，按 2 像素步长取原图颜色炸成 2–3 像素碎块；沿用模板径向初速度、260 重力、0.6 阻力、2–3 次弹跳及 0.5 秒地面冲击环，碎片落地后保留。独立实现位于 `pixel-shatter.js`，图鉴尺寸同比缩放，暂停同时停止碎片与震屏，切换或重置清空。废除摊平、伏地、淡出和残留水滩；四只共用这一效果。[四只击败粉碎动画](./demo/sprout-meadow/defeat-v6.gif)
- 当前 `monster_actions.csv` 中四只均只配置普通攻击，没有额外主动技能，预览明确展示这一点。软泥怪、绒耳兔、叶壳甲虫的撞击与晨光萤的光弹是普攻视觉表现，不另造技能 ID。角色显示尺寸由场景缩放决定，原始精灵与动作可复用，图鉴尺寸开关用于检查缩小后的辨识度。
- HTML 可直接双击打开，无外部依赖或构建步骤；也可在仓库根目录运行 `.venv/bin/python -m http.server 43139 --bind 127.0.0.1 --directory docs/agents/demo` 后访问 `/SproutMeadow_v1.html`。
- 探索观察代码在 `frontend_react/src/components/Combat/animation/meadowPixels/`，由 `ObservationMonsterActor` 按四只稳定 ID 装配；索引精灵与 demo 由同一 `build-sprites.py` 生成。甲虫、晨光萤原图向左，不再盲目镜像，绒耳兔按原图向右进行翻转。攻击与受击延续本地演示，快照确认击败才播放粉碎，碎片保留到下一遭遇。接入边界与验证见 [探索观察接入说明](./Agent探索观察战斗画面接入说明.md)。
- 图鉴同步四只新版：`MonsterPortrait` 优先选择像素角色；列表通过 `StaticMeadowPortrait` 直接使用 `assets/combat/atlas-*-idle.png` 内置静态帧（由 `meadowStillArt.getMeadowStill` 导出），不为每张卡片分配 WebGL，也不在异步加载期间回退旧 SVG 或旧版 PNG；详情由 `MonsterPortraitRenderer` 复用 `MeadowMonsterActor` 播放待机，按 160×160 安全构图保留耳朵和翅膀。动画与静态帧共用 `meadowBodyDrawing`，减少动态效果或画面离屏时停止 ticker，动画加载失败保留静态帧。其他魔物形象和图鉴信息保持原规则。
- 2026-10-22 修复首帧闪动：四只的列表、详情加载中与 WebGL 失败回退均使用同一新版内置 PNG；更新像素绘制后应重新导出这四张静态帧。图鉴右侧按目录出没地复用 `battleBackgroundArt` 中七个已确认的像素背景，普通魔物、精英及首领共用地点映射；多出没地取目录顺序中首个已登记场景，星蚀裂隙沿用站位比例修正。无新增持久字段或同步数据。
- 草甸图鉴构图调整：右侧四只角色的场景缩放由 2.2 调整为 1.55（缩小约 30%），同比收缩阴影并保留脚底锚点，让兔耳、触角与顶部标签留出空间。静态首帧与动画共用 `art/meadowPortraitFrame.ts`，保持切换时构图一致；列表缩略图、战斗场景与背景素材不变。
- 本次首帧/背景验证：连续切换四只 12 次，DOM 变更观测未发现旧版形象；七个区域（含首领）背景加载正确；模拟动画初始化失败仍显示新版静态 PNG；390px 无横向溢出。类型检查、相关 ESLint 与差异空白检查通过。使用本地 fixture 图鉴预览验证，未操作真实居民探索记录。
- 图鉴验证：四张卡片的缓存图片与共用绘制输出一致，四只详情均播放待机；切换后仅保留一张动态画布；减少动态效果时画面稳定；WebGL 不可用时仍显示新版静态帧；390px 无横向溢出。类型检查、两项既有像素回归和生产构建通过；相关 ESLint 无错误，`MonsterAtlasView` 保留 14 项原有 Hook 依赖警告。截图：[新版软泥怪与列表](./assets/combat/atlas-meadow-pixels-v1.png)、[绒耳兔详情](./assets/combat/atlas-meadow-rabbit-v1.png)。
- 独立预览生命百分比和特效只用于演示；正式场景 HP/MP 与结果继续取快照。没有新增持久字段或同步实体，不涉及 WebDAV；正式场景复用已确认的新芽草甸背景，demo 背景不替换正式背景。

## 剩余 20 只像素首版

按本轮用户要求，废弃矿坑、迷雾林地、沉没遗迹、灰烬堡垒、星蚀裂隙剩余 20 只采用与人物、装备一致的透明 PNG 像素素材。完整资源、生成提示词与状态见[像素魔物首版素材](./Agent像素魔物首版素材.md)。

总览入口为 `frontend_react/monster-pixel-preview.html`；通过 `combat-atlas-preview.html?tab=monsters` 查看同源缩略图和详情。2026-10-11 用户确认接入图鉴，20 只首版状态均为 `approved`，正式图鉴默认显示对应像素素材，预览复用默认展示路径；前四只已确认形象保留原版。五个基础动作、技能特效、新区域背景与正式战斗动画接入待后续制作。

## 共用出没地资源

| 地牢 ID | 名称 | 背景资源 | 确认状态 |
| --- | --- | --- | --- |
| `dungeon.moss_cave` | 苔石洞窟 | `frontend_react/src/assets/combat/moss-cave.svg` | 已确认；预览与图鉴共用 |

## 软泥怪原版预览与历史验收

以下为原矢量版本保留入口。2026-10-22 起正式图鉴与探索观察改用上节的新像素版本；旧预览与 SVG 保留作历史参考和加载兜底。

- 角色绘制：`frontend_react/src/components/Combat/animation/SlimeActor.ts`。
- 动作采样：`frontend_react/src/components/Combat/animation/slimeMotion.ts`。
- 静态形象：`frontend_react/src/assets/combat/slime.svg`。
- 预览页面逻辑与样式：`frontend_react/src/previews/slimePreview.ts`、`slimePreview.css`。
- 图鉴入口：`frontend_react/src/components/Combat/atlas/MonsterPortrait.tsx`；详情生命周期由共用的 `AnimatedMonsterPortrait.tsx` 与 `MonsterPortraitRenderer.ts` 管理。
- 背景注册：`frontend_react/src/components/Combat/atlas/monsterHabitats.ts`，按地牢 ID 查找。
- 已完成动作：`idle / move / attack / hit / defeat`；支持左右朝向、素色/洞窟、图鉴尺寸、暂停与继续。
- 已确认参考图：[软泥怪预览页](./assets/combat/slime-preview-approved.png)。

### 2026-10-11 验收与确认

用户确认当前软泥怪形象、预览页设计及苔石洞窟背景，后续魔物沿用此风格并逐只制作。

- 预览与图鉴使用同一角色绘制和配色，图鉴缩略图已去掉未遭遇卡片的整体透明度与灰度处理。
- 右侧详情保留待机动画；洞穴蝙蝠与苔冠巨兽验证复用洞窟背景，矿洞鼠保持其他区域默认展示。
- 桌面与 390px 窄屏验证；详情可独立滚动，无页面横向溢出。
- 切换怪物、搜索无结果与关闭图鉴后，软泥怪动画画布释放；重新打开可继续播放。
- 类型检查与生产构建通过；相关 ESLint 无错误，`MonsterAtlasView.tsx` 保留既有 Hook 依赖警告。
- 上述为形象、预览和图鉴验收，不代表正式战斗动画或各技能特效已完成。

## 洞穴蝙蝠

- 稳定目录标识：`monster.cave_bat`，普通魔物，Lv.10–20；出没地 `dungeon.moss_cave`。
- 角色绘制：`frontend_react/src/components/Combat/animation/CaveBatActor.ts`；灰紫渐变身体、圆头、大耳朵、带弧形边缘的蝠翼、两颗小尖牙。左上高光、描边与表情沿用软泥怪风格。
- 动作采样：`frontend_react/src/components/Combat/animation/caveBatMotion.ts`；`idle / move / attack / hit / defeat`，分别为悬停振翅、轻盈掠飞、抬升后俯冲、失衡后回稳、收翅落地。
- 静态形象：`frontend_react/src/assets/combat/cave-bat.svg`；使用相同轮廓和配色，图鉴列表与预览加载兜底共用。
- 图鉴详情：`AnimatedMonsterPortrait.tsx` 与 `MonsterPortraitRenderer.ts` 按需加载角色并播放悬停振翅待机，使用同一个 `CaveBatActor` 与 `caveBatMotion`；加载失败保留静态形象。
- 预览生命周期：`frontend_react/src/components/Combat/animation/CaveBatPreviewScene.ts`；页面入口与角色配置为 `frontend_react/src/previews/caveBatPreview.ts`。
- 预览与软泥怪共用 `frontend_react/src/previews/mountMonsterPreview.ts` 控件、快捷键和清理逻辑，复用 `slimePreview.css` 页面布局、`slimeStage.ts` 舞台及已确认的 `moss-cave.svg` 背景。
- 既有目录技能 `skill.monster.evasion`（闪身）：侧掠、淡残影与回位；预览只表现动作，不计算技能数值、命中或伤害。
- 已确认参考图：[洞穴蝙蝠预览页](./assets/combat/cave-bat-preview-approved.png)。

### 2026-10-11 首版验证

- 桌面与 390px 窄屏运行验证，小尺寸、朝向与背景切换可用，无横向溢出。
- 攻击、受击、闪身播放后恢复悬停；倒下保持终态，选择待机可恢复。
- 暂停后两次画布截图一致；继续播放、数字动作快捷键可用。
- 软泥怪原预览的攻击恢复、暂停与背景切换回归通过；两个预览均无浏览器警告或错误。
- TypeScript 检查、相关 ESLint 和双预览入口的独立生产构建通过。
- 本次仅完成首版形象和独立预览，等待用户确认；图鉴及正式战斗动画尚未接入，无新增持久字段或 WebDAV 同步数据。

### 2026-10-11 用户确认与图鉴接入

用户确认首版形象与动作，并明确要求加入图鉴。

- 列表更新静态形象，详情复用角色的悬停、振翅与眨眼动画；苔石洞窟背景通过现有地牢 ID 关联，无新增目录字段或同步数据。
- 两个已完成角色共用图鉴动画宿主与 renderer 生命周期，保留各自构图、缩放、姿态和阴影；软泥怪显示效果回归通过。
- 在临时数据库的实际 Agent 世界 → 世界图鉴 → 冒险资料 → 怪物图鉴验收桌面与 390px 窄屏：蝙蝠卡片不透明度为 1、滤镜为 none，详情背景为 `dungeon.moss_cave`，无横向溢出。
- 切换软泥怪时只有一个画布，切换矿洞鼠、搜索无结果和关闭图鉴后无残留画布；重新打开可继续播放。
- 类型检查、相关 ESLint 与生产构建通过。本次接入范围为图鉴待机动画；正式战斗事件与技能效果仍待接入。

## 苔石兽

- 稳定目录标识：`monster.moss_beast`，精英魔物，Lv.8–12；出没地 `dungeon.moss_cave`。
- 静态形象：`frontend_react/src/assets/combat/moss-beast.svg`；宽肩、分块岩甲、四足、短石角、苔藓与玉石晶体，琥珀色眼睛和少量金色点缀。与普通软泥怪、洞穴蝙蝠通过剪影和重量感区分，保留后续首领的升级空间。
- 角色绘制：`frontend_react/src/components/Combat/animation/MossBeastActor.ts`；从同一 SVG 分层构造共享不可变 `GraphicsContext`，静态和动态不分别维护轮廓与色板。
- 纯动作采样：`frontend_react/src/components/Combat/animation/mossBeastMotion.ts`；`idle / move / attack / hit / defeat`，分别为警戒呼吸、交替重步、蓄力冲撞、硬甲震颤、屈膝伏地。
- 预览生命周期与局部特效：`frontend_react/src/components/Combat/animation/MossBeastPreviewScene.ts`；复用已确认的 `moss-cave.svg`，管理阴影、落地尘土、冲击环和护盾。
- 页面入口与配置：`frontend_react/moss-beast-preview.html`、`frontend_react/src/previews/mossBeastPreview.ts`；共用 `mountMonsterPreview.ts`、`slimePreview.css`、`skillPreview.css`，角色专属样式为 `mossBeastPreview.css`。
- 既有目录技能 `skill.monster.guard`（护体）：岩甲合拢、额部符石亮起、半透明护罩展开与消退；`mossBeastGuardEffect.ts` 独立绘制前景护罩和后景地面印记，仅为视觉示意，不模拟伤害减免或技能回合时长。
- 首版参考图：[苔石兽预览页](./assets/combat/moss-beast-preview-draft.png)。

### 2026-10-11 首版验证

- 桌面与 390px 窄屏验证，无横向溢出；小尺寸、左右朝向、洞窟/素色切换可用。
- 攻击、受击与护体示意结束后恢复待机；倒下保持终态，选择待机恢复。数字键可切换待机与移动。
- 暂停后两次画布截图一致；重新加载后仅有一个画布，静态兜底隐藏，无浏览器警告或错误。
- 蝙蝠预览共用技能样式抽取后，悬停与闪身示意回归通过。
- TypeScript、相关 ESLint、SVG 唯一分层 ID 检查和三预览入口独立生产构建通过。
- 首版形象与技能示意等待用户确认，图鉴和正式战斗尚未接入；无新增持久字段或 WebDAV 同步数据。

### 2026-10-11 牙齿与护体调整

- 根据用户反馈，獠牙缩短并衔接上唇，移除脱离嘴线的长三角形观感；静态与动态继续来自同一 SVG。
- 护体保留用户偏好的岩石多边形轮廓，半透明表面位于角色前方，保持五官可读。补充向外展开、双层亮边、切面反光与流动光带；光带沿多边形边缘裁切，演示延长为 3.2 秒后恢复待机。
- 调整后的护体参考图：[护罩预览](./assets/combat/moss-beast-guard-draft.png)。形象与技能仍待用户确认。
- 大尺寸、小尺寸与 390px 窄屏检查通过，护罩覆盖角色且五官可读；切回待机清除护罩。TypeScript、相关 ESLint 与苔石兽预览的独立生产构建通过，控制台无警告或错误。

### 2026-10-11 用户确认与图鉴接入

用户确认调整后的形象及多边形岩石护盾，并明确要求更新图鉴。

- 列表使用 `moss-beast.svg`，详情复用 `MossBeastActor` 与 `mossBeastMotion` 播放警戒呼吸、轻微头部运动和眨眼；苔石洞窟通过现有地牢 ID 关联。
- 共用图鉴 renderer 按角色配置构图、比例和阴影，保持软泥怪及蝙蝠原有参数；苔石兽静态回退与动态详情使用相同视框、脚底锚点和展示缩放。
- 临时数据库上的实际世界图鉴验收桌面与 390px 手机：卡片不透明度为 1、滤镜为 none，详情背景为 `dungeon.moss_cave`，无横向溢出，手机详情可独立滚动。
- 切换三个已制作角色时只有一个画布；切换矿洞鼠、搜索无结果和关闭图鉴后无残留画布。软泥怪、蝙蝠显示回归通过。
- 已确认参考图：[预览页](./assets/combat/moss-beast-preview-approved.png)、[图鉴接入](./assets/combat/moss-beast-atlas-approved.png)。
- 类型检查、相关 ESLint 与生产构建通过。本次接入为图鉴待机动画，护体示意继续保留在独立预览；正式战斗事件待接入，无新增持久字段或 WebDAV 同步数据。


## 苔冠巨兽

- 稳定目录标识 `monster.moss_king`，区域首领 Lv.10–12，出没地 `dungeon.moss_cave`。独立预览已确认，图鉴已接入。
- 已确认方案为远古苔冠石鹿：高大四足站姿、宽幅枝状石角、浮空青玉冠石、苔藓披肩、灰白岩石与青玉渐变，少量金色符纹。通过物种和剪影区分苔石兽。
- 同源静态与分层绘制资源：`frontend_react/src/assets/combat/moss-king.svg`。Actor 为 `Combat/animation/MossKingActor.ts`，纯动作采样为 `mossKingMotion.ts`，生命周期与舞台为 `MossKingPreviewScene.ts`，独立技能绘制为 `mossKingEffects.ts`。
- 基础动作包括警戒呼吸、沉稳巡行、抬蹄踏击、岩甲回震、屈膝伏地。重击对应既有 `skill.monster.strike`，展示冠石蓄力、抬蹄、一次接触震波、碎石和短促震动；护体对应 `skill.monster.guard`，展示冠石共鸣和包裹头部与身体的半透明切面护罩。视觉示意不改变伤害、目标范围或技能回合数。
- 预览入口 `frontend_react/moss-king-preview.html`；配置与样式为 `previews/mossKingPreview.ts` / `mossKingPreview.css`。继续共用预览控件、页面布局和已确认的洞窟背景。
- 已确认参考图：[石鹿预览](./assets/combat/moss-king-preview-approved.png)、[棱角护体](./assets/combat/moss-king-guard-refined.png)、[重击碎石](./assets/combat/moss-king-strike-refined.png)。

### 2026-10-11 新方案验证

- 桌面与 390px 手机检查，无横向溢出；小尺寸、左右朝向、素色/洞窟切换可用。方向切换同时调整主渐变和面部高光，使主光仍来自左上。
- 攻击、受击、重击与护体结束后恢复待机；倒下保持终态，选择待机恢复。暂停的两次舞台截图一致。
- 护盾保持棱角轮廓，位于角色前方，包裹头部与躯干，保持五官可读。
- TypeScript、相关 ESLint、SVG 唯一分层 ID 校验和独立预览生产构建通过。
- 未新增目录字段、持久化数据或 WebDAV 同步数据；正式战斗仍待事件播放接入。


### 2026-10-11 双眼与护体修正

- 双眼统一轮廓宽高、水平位置、瞳孔和高光，移除夸大的远近眼大小差异；受击闭眼和倒下表情也同时更新两只眼睛。
- 护体改为顶部收拢的不规则晶石切面护罩，包裹头部与躯干，枝角末端自然伸出。增加背面轮廓、侧面反光和底面折射，移除双层大边框、四个边框金色角标及水平扫光，以沿边流动的亮点表现能量。
- 更新截图：[护体修正](./assets/combat/moss-king-guard-refined.png)。形象与技能仍待用户确认，图鉴尚未接入。
- 左右朝向、大/小尺寸检查通过，类型检查、相关 ESLint 和独立预览构建通过。

### 2026-10-11 鹿角与耳根衔接修正

- 右侧鹿角改为连续主枝与三个细长分叉，移除折板轮廓；角根从头顶立起并压入头骨，两侧耳根由头部轮廓遮挡，右耳缩短并下收，避免角根和耳根混在一起。
- 鹿角、冠石与面部统一放入头部容器，待机、蓄力和护体中的头部位移由同一父级驱动，避免附件脱离。
- 更新参考图：[头部衔接](./assets/combat/moss-king-head-refined.png)。独立预览继续供确认，图鉴尚未接入。
- 左右朝向、重击蓄力、护体与倒下姿态的连接检查通过，浏览器控制台无警告或错误；类型检查、相关 ESLint、SVG 唯一 ID 校验与独立预览构建通过。

### 2026-10-11 重击碎石反馈加强

- 重击落地时，从两只前蹄附近抛起 12 块有轮廓与明暗切面的碎石，增加石块大小和飞起高度，按固定轨迹旋转、下落并消退，便于重复播放与暂停检查。
- 飞石在大部分飞行阶段保持清楚，接触特效延长至 1.35 秒；震波移至前蹄接触点，低矮扬尘补充落地反馈，保持面部可读。技能仍是一次重击的视觉示意，不改变战斗数值。
- 参考图：[重击碎石](./assets/combat/moss-king-strike-refined.png)。图鉴与正式战斗尚未接入。
- 大尺寸连续观察飞起、下落与消退，小尺寸反向重击及结束恢复待机检查通过，无残留飞石或浏览器警告/错误；类型检查、相关 ESLint 与独立预览构建通过。

### 2026-10-11 用户确认与图鉴接入

用户确认鹿角、耳根及重击飞石调整后的石鹿首领，明确要求加入图鉴。

- 列表使用 `moss-king.svg`，详情复用 `MossKingActor` 与 `mossKingMotion` 的警戒呼吸、眨眼和冠石微光；使用已存在的首领地牢关联复用苔石洞窟背景。
- 共用图鉴 renderer 增加苔冠巨兽构图参数，静态回退与动态详情采用预览的 .96 缩放及 .74 脚底位置，保留前三只魔物的参数与生命周期。
- 重击和护体继续保留在独立预览供后续战斗复用；本次图鉴接入仅播放待机，不新增持久字段或 WebDAV 同步数据。
- 临时数据库上的实际 Agent 世界 → 世界图鉴 → 冒险资料 → 怪物图鉴检查通过：列表不透明度为 1、滤镜为 none，首领详情背景为 `dungeon.moss_cave`。桌面及 390px 手机无横向溢出，手机详情可独立滚动。
- 切换四个已制作角色后只有一个详情画布；切换矿洞鼠、搜索无结果和关闭图鉴后画布数为零，重新打开后可继续显示。控制台无警告或错误，类型检查、相关 ESLint 及 Node 22 生产构建通过。
- 已确认参考图：[预览页](./assets/combat/moss-king-preview-approved.png)、[图鉴接入](./assets/combat/moss-king-atlas-approved.png)。


## 玩家、武器、技能与材料图鉴（2026-10-11）

当前共用角色为已确认的新手身份，29 套服装与独立职业氛围使用同一脸、发型、靴子和身体框架。
已按用户授权将全职业氛围、6 件原武器素材和 24 件材料首版接入图鉴；不是逐职业重新生成人物。

| 资源 | 登记与实现 | 接入状态 |
| --- | --- | --- |
| 29 职业外观与独立氛围 | `Combat/art/professionConcepts.ts`、`professionAuras.ts`、`animation/playerAppearance/` | 列表同源缓存图、详情同一 Actor 待机 |
| 6 件武器素材 | `equip.sword`、`equip.axe`、`equip.bow`、`equip.dagger`、`equip.mage_staff`、`equip.staff`、`equip.holy_staff` | 法杖与双手杖共用水晶杖裁片；装备列表/详情展示原源图，未重新设计 |
| 32 目录主动技能 | `Combat/animation/skillPreview/`、`atlas/SkillPreviewDialog.tsx` | 各职业详情与主动技能行可播放，暂停/拖动/换演示武器 |
| 新手基础攻击 | `preview.novice.strike` | 仅前端示意，未加入持久技能目录 |
| 24 现有材料 | `Combat/art/materialVisuals.ts`、`materialArtDrawing.ts`、`atlas/MaterialPortrait.tsx` | 同源列表/详情像素图，价格与掉落不变 |

### 复查记录

- 统一手掌缩为 7 px 网格空手 42×35、持握 56×35；两手等高，衣服完整。图层为身体、服装、头部、武器、手掌，武器在人物前方，手掌盖握柄。参考：[修订预览](./assets/combat/player-layered-hands-weapon-v6.png)。
- 29 个职业总览逐项查看统一比例与不同氛围；[总览上半](./assets/combat/atlas-professions-overview-v1.png)、[总览下半](./assets/combat/atlas-professions-overview-v1-lower.png)。
- [6 武器图鉴](./assets/combat/atlas-weapons-v1.png)、[24 材料图鉴](./assets/combat/atlas-materials-v1.png)已逐项检查。
- 33 个技能演示逐项打开、重播并查看关键帧；自我效果不让敌方受击。召唤效果命中时间已移到魔灵抵达之后，复查新帧通过。
- 390×844 窄屏弹窗完整可操作，无横向溢出；[窄屏技能弹窗](./assets/combat/atlas-skill-mobile-v1.png)。换武器保留暂停进度，Escape 关闭恢复焦点，关闭后仅保留一个职业详情画布，搜索无结果画布数为零。
- 5 个目录覆盖、技能时序、有限绘制几何测试通过；Node 22 TypeScript 与正式应用生产构建通过。相关 ESLint 无错误，保留原 AtlasView Hook 依赖和旧预览警告；构建保留原大包等提示。
- 保存入口 `frontend_react/combat-atlas-preview.html` 使用实际图鉴组件与生产 CSV 的只读目录快照，另保留原分层及单路线预览；没有读写居民资料。详细模块与测试命令见[预览说明](../../frontend_react/src/previews/README.md)。
- 尚未完成全方向逐帧动作、真实装备实例外观绑定和真实战斗事件驱动；本次没有新增持久字段、目录数值或 WebDAV 同步数据。

### 2026-10-11 全职业氛围第二版

- 冰术师的六枝雪花、冰蓝辉光和低位冷雾保留用户确认版；其余 28 个职业（含新手）重做主意象与运动，补充各自配色的渐变辉光和柔光。第二版整体待用户审阅。
- 战士取消两把固定实体剑，采用短战意流痕；炎术师取消灼烧火柱，采用肩后浮焰与暖金流光；游侠取消菱形块，采用带羽轴、羽枝的飘动细羽。其他职业分别使用运动的符印、灵灯、月影、幻牌、祷环、光羽与林叶。
- 共用入口 `playerAppearance/professionAuraDrawing.ts`；四系独立造型在 `warriorAuraDrawing.ts`、`arcaneAuraDrawing.ts`、`rangerAuraDrawing.ts`、`holyNatureAuraDrawing.ts`，光学工具在 `auraDrawingPrimitives.ts`。原人物、服装、武器与技能规则未更换。
- 预览入口 `frontend_react/profession-aura-preview.html`，源码按组件、Hook 与 Canvas 生命周期拆分到 `src/previews/professionAura/`。支持全部 29 个职业的动态总览、四系筛选、暂停及单独预览。
- 图鉴列表缓存同源静态图，动态详情与分层预览复用同源 PixiJS 绘制；实际图鉴已展示新版炎术师。列表缩略图继续采用静态图，不为每张卡片分配 WebGL 场景。
- 展示记录：[战士系](./assets/combat/profession-auras-warrior-v2.png)、[法师系](./assets/combat/profession-auras-mage-v2.png)、[游侠系](./assets/combat/profession-auras-ranger-v2.png)、[牧师系](./assets/combat/profession-auras-priest-v2.png)、[完整总览](./assets/combat/profession-auras-overview-v2.png)、[图鉴同步](./assets/combat/profession-auras-atlas-v2.png)。逐职业造型与运动表见[设计说明](./Agent职业氛围设计说明.md)。
- 按用户要求未运行测试、类型检查、lint 或构建；本轮仅审视真实预览与保存展示画面。无持久字段、目录数值或同步变更。
