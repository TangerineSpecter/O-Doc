# 像素战斗背景：六张地图第二版

2026-10-11。用户指出第一批场景纹理过细，与大颗粒 Q 版人物不统一。苔石洞窟第二版得到“这个看着还行”的确认后，沿用其大色块和低密度纹理方向，扩展其余五张地图。

## 当前资源与入口

- 素材：`frontend_react/src/assets/combat/battle-moss-cave-pixel-v2.png`，内置 imagegen 生成，独立 PNG；没有覆盖原先确认的 `moss-cave.svg`。
- 地图登记：`Combat/art/battleBackgroundArt.ts`，六张已由用户确认，状态均为 `approved`；2026-10-22 正式图鉴按目录出没地复用同一注册表的已确认背景。
- 展示：`monster-defeat-preview.html`，默认软泥怪、法师与废弃矿坑，同场停在 0.5 秒站立画面。支持六张地图和简洁舞台切换、站位对照与击败重播。切换怪物保留选中的背景。
- 展示截图：`docs/agents/assets/combat/moss-cave-pixel-v2-in-scene.png`。
- 完整生成提示词：`docs/agents/assets/combat/moss-cave-pixel-v2-generation.json`。

## 风格与构图

洞壁采用大轮廓、块状苔藓和少量明暗层；中央保留两层冷灰绿远景，减少石缝、零散叶片和地面颗粒，边缘保留简单蓝色蘑菇。地面以浅暖灰块面为主，人物站位与弹道空间保持通畅。场景在 720×423 的演示空间使用统一 160×94 逻辑采样网格，再以最近邻纹理展示，与人物像素尺度接近。

人物在左、怪物在右，脚底线沿场景高度 79%；背景、人物、阴影、技能与消散碎片独立。更换场景不会重置当前动画进度，也不会重新生成角色。该洞窟仅在独立预览用于风格对照，切换其他魔物不表示它们的实际出没地发生变化。

## 新增地图

| 地图 ID | 地图 | 主要视觉 | PNG 文件名 |
| --- | --- | --- | --- |
| dungeon.abandoned_mine | 废弃矿坑 | 木支架、旧矿车、青色晶石、暖色矿灯 | battle-abandoned-mine-pixel-v2.png |
| dungeon.mist_forest | 迷雾林地 | 大树干、灰绿远树、雾层 | battle-mist-forest-pixel-v2.png |
| dungeon.sunken_ruins | 沉没遗迹 | 断柱、残拱、后方积水、干燥石台 | battle-sunken-ruins-pixel-v2.png |
| dungeon.ember_fortress | 灰烬堡垒 | 城垛、厚重城门、远火山、后方熔火 | battle-ember-fortress-pixel-v2.png |
| dungeon.star_rift | 星蚀裂隙 | 紫色裂隙、浮岩、少量方星、悬浮石台 | battle-star-rift-pixel-v2.png |

五张素材独立保存于 `frontend_react/src/assets/combat/`，完整提示词及原始生成路径保存于 `docs/agents/assets/combat/battle-backgrounds-pixel-v2-generation.json`。统一以 160×94 最近邻采样呈现。人物脚底始终固定在演示画面高度 79%；裂隙原图石台有可见底面，登记原图站位比例 0.69，纵向调整背景让脚底落在石台上表面，其余图为 0.79。地图切换仅替换背景纹理，不重置动画进度；所有纹理由场景统一释放。

用户确认后，六张已按所在地图接入正式 `CombatObservation` 的本地动作展示。2026-10-22 图鉴背景也复用同一已确认资源注册表；出没地目录关系与战斗结算保持原样，接入边界详见 `Agent探索观察战斗画面接入说明.md`。

五张同场截图保存在 `docs/agents/assets/combat/`：`battle-mine-v2-in-scene.png`、`battle-forest-v2-in-scene.png`、`battle-ruins-v2-in-scene.png`、`battle-fortress-v2-in-scene.png`、`battle-rift-v2-in-scene.png`。

无新增持久数据、战斗规则或同步字段。按用户要求未运行测试、类型检查或构建，只打开同场预览呈现效果。

## 新芽草甸候选背景（2026-10-17）

用户发现新芽草甸战斗画面缺少区域背景，要求参考其他区域补一版查看。新增 `battle-sprout-meadow-pixel-v1.png`，沿用低密度大色块像素风、160×94 最近邻采样与 79% 脚底线；画面以开阔草地、远处草坡、浅蓝天空和两侧少量野花表现新手区域。

2026-10-19 用户确认该背景，并反馈正式探索观察仍显示占位底色。现已登记进正式 `battleBackgroundArt`（状态 `approved`，160×94 最近邻采样、79% 脚底线），`dungeon.sprout_meadow` 探索时直接取用；原 `sproutMeadowBackgroundCandidate.ts` 与 `backgroundCandidate` 预览参数已删除，预览页改为与其他地图共用注册表。

- 素材：`frontend_react/src/assets/combat/battle-sprout-meadow-pixel-v1.png`
- 预览入口：`frontend_react/combat-observation-preview.html`
- 生成提示词：`docs/agents/assets/combat/battle-sprout-meadow-pixel-v1-generation.json`
