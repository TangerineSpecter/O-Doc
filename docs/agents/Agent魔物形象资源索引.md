# Agent 魔物形象资源索引

制作规范见[魔物形象与战斗动画设计规范](./Agent魔物形象与战斗动画设计规范.md)。新增角色在此登记资源与确认状态；验收记录写在对应角色小节中。路径相对仓库根目录。

## 角色与接入状态

| 魔物 ID | 名称 | 预览入口 | 形象与基础动作 | 图鉴 | 技能特效 | 正式战斗动画 |
| --- | --- | --- | --- | --- | --- | --- |
| `monster.slime` | 软泥怪 | `frontend_react/slime-preview.html` | 已确认；五个基础动作 | 已接入 | 仅有预览落地波纹、水滴样例；通用技能特效待设计 | 待接入 |
| `monster.cave_bat` | 洞穴蝙蝠 | `frontend_react/cave-bat-preview.html` | 已确认；五个基础动作 | 已接入 | 已有“闪身”动作与残影示意；正式效果待接入 | 待接入 |

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
