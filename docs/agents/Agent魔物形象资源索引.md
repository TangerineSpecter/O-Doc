# Agent 魔物形象资源索引

制作规范见[魔物形象与战斗动画设计规范](./Agent魔物形象与战斗动画设计规范.md)。新增角色在此登记资源与确认状态；验收记录写在对应角色小节中。路径相对仓库根目录。

## 角色与接入状态

| 魔物 ID | 名称 | 预览入口 | 形象与基础动作 | 图鉴 | 技能特效 | 正式战斗动画 |
| --- | --- | --- | --- | --- | --- | --- |
| `monster.slime` | 软泥怪 | `frontend_react/slime-preview.html` | 已确认；五个基础动作 | 已接入 | 仅有预览落地波纹、水滴样例；通用技能特效待设计 | 待接入 |
| `monster.cave_bat` | 洞穴蝙蝠 | `frontend_react/cave-bat-preview.html` | 已确认；五个基础动作 | 已接入 | 已有“闪身”动作与残影示意；正式效果待接入 | 待接入 |
| `monster.moss_beast` | 苔石兽 | `frontend_react/moss-beast-preview.html` | 已确认；五个基础动作 | 已接入 | 已有“护体”动作与多边形护盾示意；正式效果待接入 | 待接入 |
| `monster.moss_king` | 苔冠巨兽 | `frontend_react/moss-king-preview.html` | 已确认石鹿首领；五个基础动作 | 已接入 | 已有“重击”飞石与“护体”晶石护罩示意；正式效果待接入 | 待接入 |

## 共用出没地资源

| 地牢 ID | 名称 | 背景资源 | 确认状态 |
| --- | --- | --- | --- |
| `dungeon.moss_cave` | 苔石洞窟 | `frontend_react/src/assets/combat/moss-cave.svg` | 已确认；预览与图鉴共用 |

## 软泥怪

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

- 稳定目录标识：`monster.cave_bat`，普通魔物，Lv.3–8；出没地 `dungeon.moss_cave`。
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
| 6 独立武器 | `equip.sword`、`equip.axe`、`equip.bow`、`equip.dagger`、`equip.staff`、`equip.holy_staff` | 装备列表/详情展示原源图，未重新设计 |
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
