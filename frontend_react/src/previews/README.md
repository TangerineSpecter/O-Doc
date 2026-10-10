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
- `AnimatedMonsterPortrait.tsx` 与 `MonsterPortraitRenderer.ts`：三个角色仅详情按需加载 PixiJS，加载失败保留
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
