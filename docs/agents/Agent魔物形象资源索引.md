# Agent 魔物形象资源索引

制作规范见[魔物形象与战斗动画设计规范](./Agent魔物形象与战斗动画设计规范.md)。新增角色在此登记资源与确认状态；验收记录写在对应角色小节中。路径相对仓库根目录。

## 角色与接入状态

| 魔物 ID | 名称 | 预览入口 | 形象与基础动作 | 图鉴 | 技能特效 | 正式战斗动画 |
| --- | --- | --- | --- | --- | --- | --- |
| `monster.slime` | 软泥怪 | `frontend_react/slime-preview.html` | 已确认；五个基础动作 | 已接入 | 仅有预览落地波纹、水滴样例；通用技能特效待设计 | 待接入 |

## 共用出没地资源

| 地牢 ID | 名称 | 背景资源 | 确认状态 |
| --- | --- | --- | --- |
| `dungeon.moss_cave` | 苔石洞窟 | `frontend_react/src/assets/combat/moss-cave.svg` | 已确认；预览与图鉴共用 |

## 软泥怪

- 角色绘制：`frontend_react/src/components/Combat/animation/SlimeActor.ts`。
- 动作采样：`frontend_react/src/components/Combat/animation/slimeMotion.ts`。
- 静态形象：`frontend_react/src/assets/combat/slime.svg`。
- 预览页面逻辑与样式：`frontend_react/src/previews/slimePreview.ts`、`slimePreview.css`。
- 图鉴入口：`frontend_react/src/components/Combat/atlas/MonsterPortrait.tsx`；详情生命周期由 `SlimePortrait.tsx` 与 `SlimePortraitRenderer.ts` 管理。
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
