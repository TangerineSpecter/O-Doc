# 四元素预览

2026-10-27：四处地牢的魔物形象与动作方向和四张背景已获确认，正式素材由图鉴和战斗共用。此处保存独立演示页面及其专用代码，位于 Docker 构建排除的 `docs/agents/demo/` 下。

在仓库根目录安装前端依赖后，使用 Node 22 启动独立演示服务：

```bash
cd frontend_react
npx vite --config ../docs/agents/demo/vite.config.mjs --configLoader native
```

浏览以下页面；切换待机、移动、攻击与技能可查看动作。服务只用于本机预览，不连接业务 API。

| 地牢 | 独立预览 |
| --- | --- |
| 潮汐浅湾 | [泡泡寄居蟹](../tidal-shoal/element-crab-preview.html)、[小潮水灵](../tidal-shoal/element-spirit-preview.html)、[礁壳守卫](../tidal-shoal/element-reef-preview.html)、[潮冠海兽](../tidal-shoal/element-tide-boss-preview.html) |
| 琥岩地窟 | [砂晶鼹鼠](../amber-cave/element-earth-mole-preview.html)、[岩芽蜗牛](../amber-cave/element-earth-snail-preview.html)、[琥岩甲兽](../amber-cave/element-earth-amber-preview.html)、[晶脊地龙](../amber-cave/element-earth-dragon-preview.html) |
| 浮岚高地 | [云绒鸟](../cloud-highland/element-wind-bird-preview.html)、[风铃精](../cloud-highland/element-wind-bell-preview.html)、[岚羽猎隼](../cloud-highland/element-wind-falcon-preview.html)、[云冠风鹫](../cloud-highland/element-wind-gryphon-preview.html) |
| 熔羽火山 | [火绒蜥](../ember-volcano/element-fire-lizard-preview.html)、[炭壳龟](../ember-volcano/element-fire-turtle-preview.html)、[熔角兽](../ember-volcano/element-fire-horn-preview.html)、[焰羽炎鸟](../ember-volcano/element-fire-firebird-preview.html) |
| 装备 | [四元素武器图标](../element-equipment/element-equipment-preview.html) |

例如访问 `http://127.0.0.1:43138/docs/agents/demo/tidal-shoal/element-crab-preview.html`。预览通过仓库内 `frontend_react/src/assets/combat/element-preview/` 读取正式素材，武器图标复用正式 `EquipmentPortrait`；请勿移动这些运行时文件。焰羽炎鸟第一、二版草稿存于 `ember-volcano/`，正式形象为第三版。
