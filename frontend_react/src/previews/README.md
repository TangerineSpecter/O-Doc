# 魔物 PixiJS 预览

后续魔物的风格、预览页面、确认流程和技能特效边界统一遵循
[Agent 魔物形象与战斗动画设计规范](../../../docs/agents/Agent魔物形象与战斗动画设计规范.md)。
本预览页与用户确认的截图均已保存于项目；截图路径为
`docs/agents/assets/combat/slime-preview-approved.png`。

独立视觉样例，入口为 `frontend_react/slime-preview.html`。使用已有 PixiJS 8，
不加载业务 API、不读写世界资料、不新增模型或持久字段，因此无新增 WebDAV 同步数据。
预览页面不进入默认应用构建。软泥怪已接入正式怪物图鉴：列表使用
`src/assets/combat/slime.svg` 静态缩略图，详情使用同一个 PixiJS 角色的待机动画。
尚未接入探索观察界面。

在 `frontend_react` 下用 Node 22 启动 `npm run dev`，打开 `/slime-preview.html`。
本次独立预览服务器为 `http://127.0.0.1:43131/slime-preview.html`。

洞穴蝙蝠首版入口为 `frontend_react/cave-bat-preview.html`，同一服务器下打开
`http://127.0.0.1:43131/cave-bat-preview.html`。源码与首版截图已保存，确认状态见
[魔物形象资源索引](../../../docs/agents/Agent魔物形象资源索引.md)。此形象已确认并接入图鉴：
列表显示 `cave-bat.svg`，详情播放同一角色的悬停振翅待机动画。

苔石兽首版入口为 `frontend_react/moss-beast-preview.html`，同一服务器下打开
`http://127.0.0.1:43131/moss-beast-preview.html`。这是 Lv.8–12 精英魔物，形象已确认并接入图鉴，
列表使用同源 SVG、详情播放警戒呼吸待机；五个基础动作之外包含既有“护体”技能的视觉示意。

各页面共用 `mountMonsterPreview.ts` 的按钮、分段控件、快捷键、加载状态与事件清理，
复用 `slimePreview.css` 的布局；有技能的预览共用 `skillPreview.css`。角色配置、绘制和动作保持独立。

## 动作与接入边界

- `Combat/animation/SlimeActor.ts`：纯 PixiJS 角色容器，脚底锚点为 `(0, 0)`，
  稳定目录标识为 `monster.slime`，可挂载到后续战斗场景的任意 Container。
- `slimeMotion.ts`：按动作、本地经过秒数和朝向采样姿态。
  动作是 `idle / move / attack / hit / defeat`；左右朝向是 `-1 / 1`。
- `SlimePreviewScene.ts`：预览舞台、播放、缩放、可见性暂停及资源释放。
- `slimeStage.ts`：可选洞窟与素色背景，角色不依赖背景。
- `assets/combat/moss-cave.svg`：预览与图鉴共用的苔石洞窟背景。图鉴通过
  `Combat/atlas/monsterHabitats.ts` 按 `dungeon.moss_cave` 关联，包括区域首领；
  后续同区域的怪物形象直接复用，不按显示名称匹配。
- `previews/slimePreview.ts`：软泥怪预览配置；`mountMonsterPreview.ts` 与 CSS：共用控件与排版。
- `Combat/atlas/MonsterPortrait.tsx`：按稳定魔物 ID 选择形象，其他魔物保留既有图标。
- `AnimatedMonsterPortrait.tsx` 与 `MonsterPortraitRenderer.ts`：四个角色仅详情按需加载 PixiJS，加载失败保留
  静态形象；离开视口、隐藏页面、减少动态效果时停止播放，切换魔物或关闭弹窗释放资源。

接入时调用 `actor.update(sampleSlimePose(action, seconds, facing), seconds, facing)`。
由场景应用姿态中的水平位移，角色自己处理离地高度、形变、表情与闪白。
攻击、受击播放完毕后由调用方切回待机；倒下保持终态，重新选择待机恢复。
角色动画只做展示，伤害、命中、血量及奖励必须由既有战斗事实驱动，不能从动画推断。
销毁角色时调用 `actor.destroy()` 释放图形；所有软泥怪共享一份不可变渐变纹理，
不随单个角色销毁，GPU 副本由所属 renderer 的销毁流程释放。

## 洞穴蝙蝠

`CaveBatActor.ts` 的稳定标识为 `monster.cave_bat`，锚点 `(0, 0)` 对应舞台地面；
角色自身处理悬停高度与振翅，水平位移由场景应用。
调用 `actor.update(sampleCaveBatPose(action, seconds, facing), seconds, facing)`。
朝向通过姿态和面部方向表达，左上高光不随朝向翻转。
图鉴用静态 SVG 与 PixiJS 使用相同几何和色板，SVG 也用作加载兜底。

- 待机循环振翅、悬停与眨眼；移动循环掠飞。
- 攻击抬升后俯冲，1.45 秒恢复待机；受击失衡后回稳，0.8 秒恢复待机。
- 倒下收翅落地并保持，点击待机恢复。
- `dodge` 为既有“闪身”技能的独立动作示意，1.1 秒恢复待机。残影与轨迹仅在预览场景绘制，
  角色绘制不依赖这些特效；不模拟闪避判定、伤害或其他战斗结果。
- 支持左右朝向、洞窟/素色、小尺寸、暂停及数字 1–5；窗口隐藏、舞台离开视口时停止 ticker，
  系统减少动态效果时默认暂停，关闭页面与 HMR 更新释放场景和事件订阅。
- `CaveBatActor` 渐变资源也由所有实例共享，不能随残影或单个角色销毁。

## 苔石兽

稳定标识为 `monster.moss_beast`，精英魔物 Lv.8–12，出没地 `dungeon.moss_cave`。
宽肩、四足、厚岩甲、短石角、苔藓背脊和少量玉石晶体形成重装剪影，琥珀眼与克制的金色点缀表达警戒感；
为后续苔冠巨兽保留更大的体型和装饰空间。

- `MossBeastActor.ts`：纯角色容器，地面锚点 `(0, 0)`，调用
  `actor.update(sampleMossBeastPose(action, seconds, facing), seconds, facing)`；场景应用水平位移。
- `assets/combat/moss-beast.svg`：静态形象与动态绘制的唯一轮廓、色板来源。Actor 将可信内置 SVG 的分层
  转为共享不可变 `GraphicsContext`；单个角色销毁不销毁共享上下文，GPU 副本由 renderer 释放。
- `mossBeastMotion.ts`：待机轻微呼吸与眨眼、移动交替踏步、攻击蓄力冲撞、受击硬甲震颤、倒下屈膝伏地。
  攻击 1.8 秒、受击 0.9 秒恢复待机，倒下保持终态，重新选择待机可恢复。
- `guard` 对应既有 `skill.monster.guard`（护体）：岩甲收拢、额部符石亮起，外部薄护盾由
  `mossBeastGuardEffect.ts` 绘制地面印记与覆盖角色前方的半透明多边形护罩，保留岩石棱角，包含展开、亮边、切面反光和扫过的光带；
  3.2 秒的演示时长不代表技能回合数，不模拟减伤结算。场景负责前后层级、站位与缩放。
- 预览继续共用控制器、布局和洞窟背景；支持朝向、背景、小尺寸、暂停、数字 1–5、隐藏暂停与资源清理。
- 已确认参考图为 `docs/agents/assets/combat/moss-beast-preview-approved.png`，确认状态与验证记录见资源索引。

## 苔冠巨兽

入口 `frontend_react/moss-king-preview.html`，打开同一服务器下的 `/moss-king-preview.html`。
已确认远古苔冠石鹿方案：高大站姿、枝状石角、青玉冠石与苔藓披肩，已接入图鉴。
列表使用同源 SVG，详情复用警戒呼吸、眨眼与冠石微光，按 `dungeon.moss_cave` 复用苔石洞窟背景。

- `MossKingActor.ts` 从 `assets/combat/moss-king.svg` 分层构造角色，静态与动态共用几何和配色；
  朝向使用容器镜像，并同步反向主渐变坐标、调整高光，维持世界左上主光源。
- `mossKingMotion.ts` 提供五个基础动作及既有 `strike / guard` 示意，角色以脚底 `(0, 0)` 为锚点。
- `MossKingPreviewScene.ts` 负责舞台、阴影、生命周期与播放；`mossKingEffects.ts` 负责一次重击接触反馈、
  碎石与包裹头部与身体的晶石切面护罩（枝角末端外露）。展示时长与波纹不代表技能回合、伤害或范围。
- 与其他预览共用 `mountMonsterPreview.ts`、`slimePreview.css`、`skillPreview.css` 和洞窟背景。
- 已确认截图 `docs/agents/assets/combat/moss-king-preview-approved.png`，确认状态与验收记录见资源索引。

## 玩家角色：新手 → 法师 → 元素师 → 炎术师

入口 `frontend_react/player-route-preview.html`，同一服务器下打开
`http://127.0.0.1:43131/player-route-preview.html`。沿用已确认的预览页面设计，
将四阶段像素小人放在苔石洞窟与同源 `SlimeActor` 一起比较画风和比例。
四阶段外观与水晶法杖已确认用于图鉴；五种动作与技能演示继续保留在本页，未接入正式角色资料或战斗事件。

- 原图 `docs/agents/assets/combat/mage-route-pixel-concept-v3.png`，提示词同目录。
  前端使用相同 PNG 的仓库副本 `src/assets/combat/player-mage-route.png`，保留透明背景。
- `playerRouteArt.ts`：原图的四套服装、头部、身体/手部、脚部及独立临时法杖的纹理区域。
  切片通过 PixiJS `Texture` 完成，不另外重画已认可的形象；共享纹理源使用最近邻采样。
- `PlayerRouteActor.ts`：脚底为 `(0, 0)` 的角色容器；头部、身体、左右手部与脚部分层控制。
  职业外观与装备分别由 `setJob`、`setWeapon` 切换，武器挂接手部并被手掌像素遮挡。
  衣身保留完整披肩和衣摆；仅按袖口/前臂/手掌的阶梯边界切片，用重叠肘部连接，
  不再旋转包含整条衣服侧边的矩形条。握点与发射点分开：施法锚点读取法杖顶部水晶的实时坐标变换，镜像、换装后仍跟随水晶；空手回退到手部。
  支持空手与一把临时水晶法杖，未制作更多装备，也未绑定正式装备实例。
- `playerRouteMotion.ts`：待机轻微呼吸、交替踏步/摆臂、施法抬手/释放、受击后撤、倒下终态。
  本版是切片部件的动作样例，尚未制作完整逐帧走路、表情与多种武器持握帧。
- `playerRouteEffects.ts`：四个技能 ID 的时序、保留的魔力弹绘制与纯视觉命中/震动反馈。
  魔力弹从实际杖顶水晶蓄能、发射；空手回退手部锚点，像素帧存放于 `playerSkillPixels.ts`。
- `pixelEffectDrawing.ts`：低分辨率色带火焰、弧面、光圈、符文与火星的绘制工具。
  `playerGuardVisual.ts`、`playerBurnVisual.ts`、`playerBurstVisual.ts` 分别定义独立视觉：
  包裹全身的前后屏障、围绕目标持续升腾的灼烧、较长聚能与热核飞行后的径向爆团/放射火舌/冲击环/短暂烟尘。
  炎爆有短暂环境压暗与轻微震动，不结算真实伤害，也不改变目录里的真实技能范围。
- `PlayerSkillRenderer.ts`：三张 300×140 小画布、每个像素对应 3 个场景单位，
  使用最近邻纹理分别插入地面、角色后方、角色前方；同一个 PixiJS Application 负责渲染。
  技能保持与人物接近的颗粒，流动轮廓和分层明暗表达体积，高级技能允许更大的视觉规模。
  资源由预览场景持有并在退出时释放；技能切换或动作结束隐藏全部特效，不遗留压暗或震动。
  技能选择不依赖职业外观或武器，形象切换不清空所选技能。演示库不等于当前等级已解锁这些技能；
  正式接入必须读取角色已学技能并按真实事件播放，不用预览结算伤害。
- `PlayerRoutePreviewScene.ts`：一套 Application，复用洞窟/素色舞台、软泥怪与阴影，
  负责本地播放、朝向、小尺寸、可见性暂停和生命周期；每个演员不单独创建 renderer。
- `playerRoutePreview.ts`：共用动作控件、快捷键与加载状态，独立管理职业、装备、技能按钮。
  手机从下方动作控件播放时返回舞台查看结果。隐藏/离开视口停止 ticker，关闭/HMR 清理事件、
  观察器、实例和局部切片纹理；不销毁共享 PNG 或洞窟纹理源。

本预览无 API 请求、无业务状态写入或新增持久字段，不增加 WebDAV 同步数据。
可在独立构建中指定 `player-route-preview.html` 为 Rollup input，默认应用构建不包含预览。

首版验证（2026-10-11）：Node 22 TypeScript、相关 ESLint、独立生产构建通过；浏览器控制台
无警告或错误。四阶段切换始终只保留一个画布，装备选择持续保留；切换形象或空手后保留所选技能。
已查看五种基础动作、四个技能效果、左/右朝向、洞窟/素色、小尺寸、数字快捷键、暂停与恢复；
暂停画布连续截图一致。1100px 桌面布局与 390px 手机布局通过，手机页面无横向溢出。
截图 `docs/agents/assets/combat/player-route-preview.png`、`player-route-mobile-preview.png`，
四阶段和技能演示截图同目录，均为预览记录而非正式图鉴已接入的证明。

修订验证（2026-10-11）：修复施法时袖口带动衣摆形成裂口，四套服装均已在抬手时查看。
新版四技能在浏览器检查轮廓、弹道、持续火焰、爆团/余火与命中反馈，切换外观和空手后仍保留技能。
Node 22 TypeScript、相关 ESLint 与独立生产构建通过；390px 手机左朝向、小尺寸、空手施法
保持一个画布且无横向溢出。当前截图 `player-route-pixel-magic-v2.png`、`player-route-pixel-burn-v2.png`、
`player-route-pixel-burst-v2.png`、`player-route-pixel-guard-v2.png`、`player-route-pixel-effects-mobile-v2.png`
保存在 `docs/agents/assets/combat/`，均为待确认的修订预览。以前的技能截图是首版记录，不代表最新效果。

技能第三版验证（2026-10-11）：按照用户的战斗参考重做屏障、灼烧和炎爆，保留魔力弹；
将武器握点与杖顶发射点分开。浏览器已查看右/左朝向的水晶蓄能、空手回退、
换职业保留技能、普通/小尺寸效果和动作结束后的清理，页面保持一张可见画布。
390px 手机屏障演示无横向溢出；浏览器无警告或错误。
Node 22 TypeScript、相关 ESLint、独立预览生产构建通过。
当前记录为 `player-route-staff-emitter-v3.png`、`player-route-pixel-guard-v3.png`、
`player-route-pixel-burn-v3.png`、`player-route-pixel-burst-v3.png`、
`player-route-small-left-v3.png` 与 `player-route-mobile-guard-v3.png`，
保存于 `docs/agents/assets/combat/`；v1/v2 仅保留为历史，v3 尚待用户视觉确认。

炎爆第四版（2026-10-11）：去掉与灼烧相似的直立火柱和持续余火，改为压缩热核飞行、
命中后不规则爆团快速向外膨胀、放射火舌与冲击环、碎火星和短暂烟尘。
整体时长缩为 3 秒，视觉受击仅在爆炸命中时触发；不再沿用持续灼烧的重复受击反馈。
浏览器已检查右朝向的爆炸/消散/回到待机与左朝向的小尺寸命中，无控制台警告或错误；
Node 22 TypeScript、相关 ESLint 和独立生产构建通过。当前截图
`docs/agents/assets/combat/player-route-radial-burst-v4.png`，尚待用户视觉确认。

图鉴接入（2026-10-11）：四阶段职业列表使用同源 PNG 静态切片，右侧详情按需加载
`PlayerPortraitRenderer` 复用 `PlayerRouteActor` 的空手待机；不按职业固定装备。
`Combat/art/playerVisuals.ts` 是不依赖 PixiJS 的资源与稳定 ID 登记，`PixelArtSlice` 负责静态裁切，
`EquipmentPortrait` 将 `equip.staff` 展示为同一张图中的独立水晶法杖，圣杖及其他装备保持原展示。
仅新增前端内置视觉资源，无持久字段、数值规则或 WebDAV 同步数据变化。
验收使用正式 `CombatAtlas` 组件与生产 CSV 目录生成的只读本地数据，临时检查入口已清理；
真实应用停在登录页，未修改登录状态或居民数据。桌面 1280px、手机 390px 已检查：
四职业列表/详情同源且形象完整；法师、元素师、炎术师连续切换各保留一个画布，
切到战士或装备图鉴清空画布；法杖列表/详情使用独立水晶素材，页面无横向溢出、控制台无警告或错误。
Node 22 TypeScript、正式应用生产构建通过；新增文件 ESLint 无警告，原两个 AtlasView
保留已有 Hook 依赖告警。记录 `player-route-atlas.png`、`player-route-atlas-mobile.png`、
`crystal-staff-atlas.png`、`crystal-staff-atlas-detail.png` 位于 `docs/agents/assets/combat/`。


## 人工验收

以下 1–4 为软泥怪动作验收，其余为共用行为；其他物种的动作见对应小节。

1. 默认待机能看到呼吸、轻微摇晃、定时眨眼；移动有离地弹跳和跟随阴影。
2. 攻击先下蹲蓄力再跃起，落地有回弹与水滴；约 1.3 秒后回到待机。
3. 受击有挤压、闭眼、短暂闪白；约 0.85 秒后回到待机。
4. 倒下逐渐摊平并保持；点击待机恢复，连续切换不遗留旧动作状态。
5. 左右朝向改变攻击方向；素色、洞窟及图鉴尺寸即时切换。
6. 暂停能冻结动作，继续后从原进度播放；数字 1–5 切换，空格在舞台焦点时暂停。
7. 390px 宽度不横向溢出，动作按钮可触控；系统减少动态效果时默认暂停。
8. 页面隐藏时停止 ticker；关闭页面释放 WebGL、观察器和事件订阅。
9. 世界图鉴 → 冒险资料 → 怪物图鉴：未遭遇的软泥怪缩略图无透明度/灰度滤镜；
   详情显示洞窟场景及待机动画，洞穴蝙蝠和苔冠巨兽复用背景，矿洞鼠不使用该背景。
10. 搜索无结果、切换未制作形象的魔物或关闭弹窗后无残留动画画布；切换软泥怪与蝙蝠后只有一个详情画布，手机详情可独立滚动。
