# 数据目录导航

按要维护的数据选择说明；本目录同时包含应用读取的种子文件、离线设计数据和历史检查报告。

| 任务 | 入口 | 使用边界 |
| --- | --- | --- |
| 旅行城市导入、价格与来源 | [旅行城市数据说明](./旅行城市数据说明.md) | `travel_cities_seed.csv` 由 `system_settings/agent_world/travel_seed.py` 在初始化链路读取；模板和 provenance 文件用于维护与追溯 |
| 旅行城市历史名称清理 | [城市清理报告](./travel_city_cleanup_report.md) | 迁移检查记录，按报告日期理解 |
| 战斗配置设计与离线评估 | [战斗设计包](./combat/README.md) | `design_only`，由 `scripts/combat_design/` 生成与校验，不能作为运行目录安装 |
| 当前运行钓鱼内容 | [居民钓鱼说明](../agents/Agent居民钓鱼说明.md) | `system_settings/agent_world/fishing/catalog.py` 与 `catalog_expansion.py` 为版本化运行目录；local 生成脚本从同一纯规则入口生成样例，稳定ID不得驼峰化 |
| 当前运行战斗内容 | [后端生产包说明](../../system_settings/agent_world/combat/data/README.md) | 安装入口为 `combat/catalog.py`、`store.py`；版本与文件清单见生产 `manifest.json` |

## 调整数据文件前

- 先查找文件路径的代码引用，确认属于启动输入、设计产物还是历史材料。重命名或移动运行输入时同时处理读取入口与发布打包。
- 文档整理只移动说明文件；CSV、JSON 和素材的用途及清理依据需要单独核对。
- 数据身份使用稳定 ID，名称用于显示；修改种子或目录不代表自动覆盖已有数据库记录。
- 数据库写入、版本兼容和 WebDAV 范围以[同步说明](../数据同步逻辑说明.md)及所属业务文档为准。
