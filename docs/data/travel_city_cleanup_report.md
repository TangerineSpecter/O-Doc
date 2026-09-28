# 旅行城市数据清洗 v1

2026-09-28。保留 34,146 条稳定 ID，启用 31,716 条，停用 2,430 条；价格未重新计算。

依据 [GeoNames 分类定义](https://www.geonames.org/export/codes.html)、原始 cities15000 和中文别名档案核对。省/州字段继续保留行政区名，城市字段避免使用行政区别名；缺少可靠中文居民点名时保留原名，不自动编造译名。

停用城市片区 PPLX（2,386）、历史居民点 PPLH（13）、废弃 PPLQ（9）、毁坏 PPLW（5）及聚落集合 PPLS（11）；另有 6 个主名仍指向县/区且范围未确认的记录暂时停用。正常首都、行政中心、城市、城镇与合法同名地点保留。

## 名称修正

| ID | 原名 | 新名 |
|---|---|---|
| 5884051 | 安大略 | Alliston |
| 2317397 | 班顿杜省 | 班顿杜 |
| 1802476 | 易门县 | 龙泉 |
| 1798636 | 平遥县 | 古陶 |
| 1529484 | 哈密地区 | 哈密市 |
| 1529363 | 库车县 | 新城 |
| 1529046 | 新源县 | 新源 |
| 11694038 | 霍城县 | 霍城 |
| 1804979 | 如东县 | Juegang |
| 1784553 | 长兴县 | 雉城镇 |
| 1789030 | 秦安县 | Xingguo |
| 1280003 | 噶尔县 | Gar |
| 2038139 | 昌图县 | 昌图 |
| 1805093 | 旧县 | 旧县镇 |
| 1788207 | 西乡县 | Xixiang |
| 7931312 | 玛沁县 | Maqin County |
| 2038274 | 勃利县 | 勃利 |
| 2038421 | 巴彦县 | 巴彦 |
| 6697759 | 南都柏林郡 | South Dublin |
| 1822214 | 暹粒省 | 暹粒市 |
| 1843082 | 加平郡 | Gapyeong |
| 1303351 | 良乌县 | Nyaung-U |
| 12534340 | 瓜拉尼鲁斯县 | Kuala Nerus |
| 1735889 | 芦楼县 | Julau |
| 1169605 | 穆扎法尔格尔县 | Muzaffargarh |
| 1611439 | 差春骚府 | Chachoengsao |
| 1606590 | 沙没巴干府 | Samut Prakan |
| 744562 | 卡拉比克省 | 卡拉比克 |
| 750938 | 巴伊布尔特省 | 巴伊布爾特 |
| 749780 | 恰纳卡莱省 | 恰納卡萊 |
| 325330 | 阿德亚曼省 | 阿德亚曼 |
| 4995197 | 哈姆特拉米克，密歇根州 | 哈姆特拉米克 |
| 4938048 | 麻萨诸塞州 | Grafton |
| 4366476 | 马里兰州 | 蘭道斯敦 |

## 范围待确认

| ID | 原始主名 |
|---|---|
| 12326384 | District of Taher |
| 12492660 | Longling County |
| 12492669 | Pingwu County |
| 1620919 | Bang Bo District |
| 6089125 | Norfolk County |
| 7931312 | Maqin County |

## 数据库升级

迁移 0041 使用冻结清单同步修正名称并停用对应记录，不改价格，不删除目的地、背包或游记。已经人工改为其他名称的记录保留。旧旅行保留原地点与正文，增加范围歧义说明，并从确定城市到访历史中排除。冻结清单见 `system_settings/migrations/data/0041_travel_city_cleanup.json`。

已确认的原始主名异常 Bandundu Province 修正为 Bandundu；参考 [联合国文件的 Bandundu ville / Kwilu 记录](https://digitallibrary.un.org/record/3864916/files/S_2020_482-EN.pdf)。Randallstown 参考 [美国人口普查局](https://www.census.gov/quickfacts/fact/table/randallstowncdpmaryland/HSG445224)，Grafton 参考 [当地政府](https://www.grafton-ma.gov/274/About)。
