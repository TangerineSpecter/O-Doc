# 世界工坊模板预览

核对日期：2026-10-22。范围：独立、可操作的前端模板演示，不代表系统后台已接入。

## 打开与操作

在 `frontend_react` 启动 Vite 后，打开 `/world-studio-preview.html`。当前会话地址为 `http://127.0.0.1:43131/world-studio-preview.html`。原营地演示保留在 `/camp-world-preview.html`。

- 场景编排：选择左侧摆件模板，点击画布放置；拖动已有摆件按 32px 地面网格吸附。右侧可修改名称、X 坐标、翻转、底座碰撞和路灯照明。
- 占格与碰撞：显示占格用于避免摆件重叠；物理阻挡使用独立的底座区间；互动点位于可到达的底座两侧或物体中央。长椅默认位于步行线后方。
- 居民活动：可莉与阿尼亚按前端规则选择可到达的互动点，播放相应姿态和预设气泡。编辑场景后会重新判断障碍；新障碍压到角色时将其移到最近的底座边缘。路灯熄灭时，Agent 到达后可以点亮。
- 小屋内景：独立的横版室内布局，复用家具模板。室内墙体与窗户是程序绘制的示例，不是房屋结构编辑器。
- 角色动画：切换两位角色与动作，调整播放速度、暂停、查看脚底锚点。也可以导入本地 PNG/WebP，按行列等分切片预览；不支持替任意不规则图自动纠偏。
- 布局：支持撤销、重做、复制、移除，以及 v1 JSON 导入导出。导入验证模板、边界、重叠和重复 ID。

## 数据和同步边界

本预览不调用业务接口、不写数据库、不写 localStorage、不加入 WebDAV/WebDev 同步。修改保存在页面内存中，刷新会恢复示例；需要保留时显式导出 JSON。导入文件只在浏览器解析，不上传服务器。角色导入仅供切片查看，不替换当前营地角色。

正式接入时，仍需确认资产、模板、场景实例和布局版本是否进入同步管理，之后再增加持久模型与 API。当前前端碰撞和导入校验不替代正式服务端规则。

## 代码入口

| 文件 | 职责 |
| --- | --- |
| `WorldStudioApp.tsx` | 页面编排、文件导入导出入口 |
| `AssetLibrary.tsx` / `ObjectInspector.tsx` | 模板库与摆件属性 |
| `useStudio.ts` | 布局历史、选中状态、渲染器生命周期 |
| `templates.ts` / `types.ts` | 示例模板、场景布局与契约 |
| `placement.ts` | 网格占用、底座碰撞、导入验证 |
| `StudioStage.ts` / `stageDrawing.ts` | Canvas 渲染、拖动、网格与范围显示 |
| `StudioActors.ts` | 演示居民活动、移动和互动状态 |
| `SpriteLab.tsx` | 动作播放器、本地精灵图切片 |
| `studioArt.ts` | 复用营地素材、路灯透明裁切与尺寸归一 |

路灯源图：`frontend_react/public/previews/camp-world/street-lamp.png`。生成方式为内置 `image_gen`，原生透明 PNG，724×2172；已检查 RGBA alpha 范围为 0–255。完整提示词见 [generation-prompts.md](./generation-prompts.md)。既有角色和场景素材保持不变。

## 验证

- `npm run type-check`
- `npx eslint src/previews/worldStudio src/previews/campWorld/art.ts`
- `node --experimental-strip-types --import ./scripts/register-ts-loader.mjs --test src/previews/worldStudio/placement.test.ts`
- 独立 Vite 生产构建，不修改主应用入口。
- 浏览器验证证据：项目根目录 `outputs/world-studio/verification.json`；桌面、室内、角色与 390px 移动截图保存在同目录。

## 已知限制

仅有单层水平地面，不能在这里搭楼层、楼梯或平台。摆件模板规格来自示例配置；属性编辑针对场景实例。没有模板资产的后台 CRUD，也没有调用系统生图模型或 Agent 决策模型。动作中的两帧姿态循环不等于完整的逐帧过渡动画。角色相互之间暂不作实体碰撞，当前检查的是摆件底座。家具自由旋转、任意碰撞多边形、跨房间寻路、真实座位预约与灯光遮挡仍需正式实现。
