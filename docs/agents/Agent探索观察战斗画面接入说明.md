# 探索观察：像素场景与交替动作

2026-10-22 核对：探索观察复用已确认背景，新芽草甸四只魔物接入已确认的像素动作与击败粉碎。2026-10-11 的首轮接入及验证记录保留在文末。

## 接入范围

`CombatObservation.tsx` 负责观察 Hook 与召回/恢复命令，`CombatObservationView.tsx` 编排正式弹窗和示例预览共用的左右布局。桌面左侧为固定 720:423 比例的场景，不再限制为 290px 高度；地图和播放控制叠在画面上方，职业、等级、HP/MP 与持续状态由 HTML HUD 叠在画面底部。窄屏 HUD 紧接场景放在同一画面框内，防止遮挡人物；记录栏排到下方。

探索状态、有效/计划时长、体力、经验、击败与药剂使用并入弹窗顶部标题行，原因/剩余时长与演示说明放在标题下方，召回/恢复仍调用原命令。画面下方不再放摘要卡片，桌面场景按左右布局中剩余的宽高空间等比缩放，整幅场景无需单独滚动。右侧独立滚动栏用胶囊按钮切换战斗动态、掉落和击败记录；右侧记录独立滚动，窄屏上下排列时允许内容区域滚动，所有内部滚动条隐藏。

战斗动态按确认战报展示动作卡片、行动双方、伤害/治疗与暴击。相邻同一有效战斗时间的事实归为一组，保持原始顺序；时间以带时钟图标的橙色边框加粗标签显示，当前分组时间在组内滚动时吸顶。击败记录使用事件内稳定怪物 ID 对应图鉴缩略图、等级、时间和经验，不用名称猜测素材；缺少旧事件 ID 时保留通用图标。掉落复用 EquipmentPortrait 与 MaterialPortrait，材料按 SKU 叠放，随机装备逐件保留；点击格子打开只读详情，装备属性及词条使用掉落实例快照，材料展示回收价、数量和获得时间。这里不是另一套可操作库存，也不修改实际奖励。

七张确认后的背景由 `Combat/art/battleBackgroundArt.ts` 按地牢 ID 注册，状态均为 approved。场景复用 160×94 最近邻纹理，脚底位置与图鉴形象/武器源素材独立。原图鉴 SVG 出没地背景未替换。

2026-10-17 增加新芽草甸的背景候选 `dungeon.sprout_meadow`；2026-10-19 用户确认该图并发现正式探索观察缺少背景后，将其登记进正式 `battleBackgroundArt`，状态 `approved`，同时删除仅供预览的 `sproutMeadowBackgroundCandidate.ts` 与 `backgroundCandidate` 参数链路，预览页与其他地牢共用同一注册表。`dungeon.sprout_meadow` 从此按地牢 ID 直接取用背景，不再需要额外传参。

## 展示与结算的边界

- 后端继续按原先 15 秒逻辑回合结算，观察 Hook 继续每 2 秒读取快照。
- 前端本地循环轮流展示玩家和魔物动作，动作间停顿约 0.55 秒；此时间轴不决定伤害、血量、技能学习、药剂、收益或战斗结果。
- 玩家动作从普通攻击和 `snapshot.player.skills` 中已学且有已登记特效的主动技能选择。不会按当前职业凭空赋予技能。
- 普通攻击依赖实际出发武器模板：剑/斧/匕首挥动、弓箭弹道、法杖魔力弹。技能仍使用角色已学列表；装备武器不由技能或职业强制替换。
- 武器绕登记握点旋转，皮肤、衣服和手掌保持原分层。法术发射点读取武器实时变换，水晶法杖从杖顶发射。
- 普通受击展示短暂闪红、约 10 逻辑单位轻微后退与上飘数字；数字明确为演示值，不回写 HP/MP 或战报。
- 仅挂载后的快照确认击败计数增加，才让当前旧魔物进入击败动画；刷新不补播历史死亡。新芽草甸四只播放完整的原色像素粉碎，至少保留 4 秒动画，并在落地后保留碎片直到不同遭遇到来；重复快照不让同一只魔物复活。其他魔物沿用原有碎片消散。
- 暂停探索、连接中断、没有敌人、角色 HP 为零或探索结束时停止随机交战，保留可读场景。窗口不可见、标签页隐藏或用户暂停画面时停止 ticker；关闭观察不会停止后端探索。

新芽草甸的软泥怪、绒耳兔、叶壳甲虫、晨光萤按稳定魔物 ID 使用 `meadowPixels/` 的 128×128 像素绘制及局部动作：软泥怪果冻变形与闪光，绒耳兔耳朵和尾巴，甲虫触角和足部，晨光萤翅膜和腹部流光。观察舞台控制近身位移，角色控制内部变形；晨光萤使用远程光弹普攻。四只目录均没有额外主动技能，不新增技能 ID 或战斗规则。

右侧魔物统一面向左侧玩家，但镜像根据原图朝向决定：绒耳兔原图向右，需要镜像；叶壳甲虫和晨光萤原图向左，保留原向，避免将背部翻向玩家。角色缩放由场景控制，不改变原始像素数据；粒子与主体使用相同缩放。

洞穴蝙蝠、苔石兽、苔冠巨兽继续复用原有 Actor 和姿态采样；其他魔物继续使用已确认 PNG 的整体待机、前冲、受击与同源碎片。所有交替动作与攻击示意均不代表后端真实行动选择。同日后续将四只的图鉴缩略图与详情待机动画统一到同一像素绘制；其他魔物资源保留。

## 只读接口与同步

`queries.snapshot()` 新增只读 `visual` 投影：`dungeon_id`、`job_id`、`weapon_id`、`monster_id`、`encounter_id`。它们从现有 `Exploration.snapshot` 出发计划、冻结职业/装备和 `Exploration.state` 当前遭遇中派生；HTTP 按既有规则转为驼峰。形象登记使用稳定 ID，不通过显示名称猜测。

未新增数据库模型、字段、持久化动画状态或迁移。`visual` 为每次响应时重建的投影，不需要纳入 WebDAV 同步或额外同步管理；跨设备读取时由已同步的探索状态派生。本次没有改变已有快照/事实的持久结构或战斗规则。击败卡片补充前端 monster.id / rank 可选类型，后端击败事实已返回这些字段，不新增 API 数据或同步字段。

## 源码职责

| 文件 | 职责 |
| --- | --- |
| CombatObservationView.tsx / CombatObservationSummary.tsx | 左右布局与标题栏紧凑摘要、命令入口 |
| CombatObservationSidebar.tsx | 标签切换、独立滚动与详情选择 |
| CombatObservationFeed.tsx / CombatObservationLoot.tsx | 确认战报卡片、击败缩略图、掉落格子与只读详情 |
| observationRecords.ts | 稳定 SKU 堆叠、同时间事实归组、击败记录提取与系统文案 |
| CombatBattleStage.tsx | 按可用宽高等比适配的固定比例场景、懒加载、React 生命周期、暂停按钮与 HUD 装配 |
| CombatFighterStatus.tsx | 画面内的真实快照 HP/MP、等级、职业与状态 HUD |
| animation/observation/observationPresentation.ts | 快照到视觉模型、演示技能选择和纯动作采样 |
| animation/observation/ObservationBattleScene.ts | 单个 Pixi Application、交替编排、背景与人物装配、资源生命周期 |
| animation/observation/ObservationMonsterActor.ts | 魔物形象/姿态适配与同源消散 |
| animation/meadowPixels/MeadowMonsterActor.ts / meadowSprites.ts / meadowSlime.ts | 新芽草甸四只像素角色、局部动作、逐行变形与最近邻纹理生命周期 |
| animation/meadowPixels/meadowTypes.ts / meadowMotion.ts / meadowAttack.ts | 稳定 ID 与原图朝向、纯姿态采样、普攻视觉反馈 |
| animation/meadowPixels/MeadowShatter.ts / meadowSpriteData.ts | 模板原色粉碎与落地碎片、由 demo 编码脚本共生成的精灵数据 |
| queries.py | 从已有冻结探索状态派生稳定视觉 ID |

异步魔物加载使用版本号阻止旧素材覆盖新遭遇，旧实例和自有纹理及时释放。共享角色/装备源纹理由 Assets 缓存管理，不随单个观察窗口销毁。

## 展示入口与当前验证范围

接入预览为 `frontend_react/combat-observation-preview.html`，复用正式 `CombatObservationView` 及场景、HUD、摘要与右侧记录栏，使用标明的示例快照，可切换职业、地图与魔物、模拟确认击败及下一遭遇；不调用探索 API 或写入世界资料。新版展示截图保存于 `docs/agents/assets/combat/combat-observation-integrated-v2.png`；同目录 `combat-observation-loot-v2.png`、`combat-observation-loot-detail-v2.png` 与 `combat-observation-kills-v2.png` 分别记录格子、详情与击败卡片。v1 截图保留作布局迭代记录。

2026-10-22 已在同组件浏览器预览核对四只朝向、暂停稳定性、快照确认击败、碎片保留及下一遭遇清理；桌面和 390px 窄屏均可显示。移植绘制与用户确认的 HTML 预览在四只角色、左右朝向和五组动作时刻上进行 40 组逐像素对照，全部一致。对应回归检查位于 `animation/meadowPixels/meadowPixels.test.ts`，覆盖原图镜像方向与 0.26 秒全尺寸粉碎边界。真实探索 API 到动画的完整链路未在本轮验证；本轮无需新增后端接口，继续依赖既有 `visual` 投影。示例页面只有缺失站点 favicon 的 404，没有战斗素材加载错误。

同轮 `npm run type-check`、涉及文件的 ESLint、两个回归测试和 `npm run build` 均通过；构建仍提示大分包和部分模块混用静态/动态导入。保存了[甲虫面向玩家](./assets/combat/observation-meadow-beetle-v1.png)与[软泥怪击败粉碎](./assets/combat/observation-meadow-shatter-v1.png)的正式组件截图。

首次背景接入（2026-10-11）按当时要求仅作人工预览，未运行测试、类型检查、lint 或构建；需要具备提供 `visual` 投影的后端。历史记录已结束且当前敌人为空时，不补造敌人或补播击败。

## 记录入口与弹窗切换修复（2026-10-11）

每日动态的 exploration 目标直接按记录 ID 打开 `CombatObservation`，不先打开 `CombatDialog`。`AgentWorldPage` 对冒险档案与探索观察实行互斥挂载，各自的 `WorldDialogSuspense` 标题与内容标题一致，避免生成第二个 Portal 卡片。从档案或历史进入观察时，保留当前居民 ID；关闭观察后重新打开档案并读取最新资料。从每日动态直接查看时，关闭后回到动态列表。

冒险档案优先观察 `activeExplorationId`；没有活动探索时，使用当前居民第一页历史中的最新记录 ID，显示“查看上次探索”。切回档案会恢复历史第一页，避免将旧分页第一条误当最近记录。倒地、完成和召回不限制记录读取，观察窗的结束文案改为可查看战报、掉落与击败记录；继续复用现有读取接口及事实游标，不新增持久字段或同步内容。

预览增加“查看倒地记录预览”，仅使用示例数据；未运行测试、类型检查、lint 或构建，真实页面入口未作本轮浏览器链路验证。窄屏左右栏改为按内容高度纵向排列，避免摘要被记录栏挤压覆盖。

## 顶部摘要与时间标签修订（2026-10-11）

摘要通过 `WorldDialog.titleAction` 并入现有标题栏，不增加场景下方区域。标题栏支持内容换行并保留关闭按钮；`CombatObservation` 稳定缓存摘要节点，沿用 `WorldDialogSuspense` 的同标题卡片复用，仍只打开一个窗口。桌面布局左列使用尺寸容器，场景宽度取可用宽度与可用高度所允许宽度的较小值，保持 720:423 比例；较矮窗口也完整显示画面，记录栏继续独立滚动。窄屏保留上下布局。

新版截图为 `docs/agents/assets/combat/combat-observation-header-timeline-v3.png`。仅作同组件示例快照的人工视觉预览，未运行测试、lint、类型检查或构建。
