# 软泥怪 PixiJS 预览

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
- `previews/slimePreview.ts` 与 CSS：预览控件与排版。
- `Combat/atlas/MonsterPortrait.tsx`：按稳定魔物 ID 选择形象，其他魔物保留既有图标。
- `SlimePortrait.tsx` 与 `SlimePortraitRenderer.ts`：仅详情按需加载 PixiJS，加载失败保留
  静态形象；离开视口、隐藏页面、减少动态效果时停止播放，切换魔物或关闭弹窗释放资源。

接入时调用 `actor.update(sampleSlimePose(action, seconds, facing), seconds, facing)`。
由场景应用姿态中的水平位移，角色自己处理离地高度、形变、表情与闪白。
攻击、受击播放完毕后由调用方切回待机；倒下保持终态，重新选择待机恢复。
角色动画只做展示，伤害、命中、血量及奖励必须由既有战斗事实驱动，不能从动画推断。
销毁角色时调用 `actor.destroy()` 释放图形；所有软泥怪共享一份不可变渐变纹理，
不随单个角色销毁，GPU 副本由所属 renderer 的销毁流程释放。

## 人工验收

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
10. 搜索无结果、切换非软泥怪或关闭弹窗后无残留动画画布；手机详情可独立滚动。
