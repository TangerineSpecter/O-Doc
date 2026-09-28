# 旅行城市 CSV

已填价版本为 `travel_cities_seed.csv`，共 34,146 条，244 个国家/地区代码，所有价格已填写并通过严格校验。保留原来的 `travel_cities_template.csv` 作为空价格模板；两份文件除价格列外完全一致。

## 数据库初始化

先运行 `.venv/bin/python manage.py migrate` 创建表，迁移完成后自动导入正式 CSV；正常服务启动时也会检查导入状态。不联网、不调用 AI。`TravelDestination` 保存来源城市 ID、国家代码、国家、省/州、城市、城市原名、世界币价格、启用状态和更新时间。

使用文件 SHA-256 作为本机导入版本，重复启动跳过已成功导入的文件。CSV 变更时只补入新城市，保留已有名称、价格和启用状态，跳过有同步删除记录的城市；不会自动覆盖旧城市的价格。全部校验和事务提交成功后才保存导入标记，失败不留半份数据。初始城市的更新时间固定，避免新设备默认价覆盖另一设备的手动改价。

需要手动重试时运行 `.venv/bin/python manage.py initialize_travel_destinations`。可用 `--csv-path /absolute/path/filled.csv` 指定其他已填价文件；正式导入要求每行都有正价格，包括禁用城市。普通 `check`、`makemigrations`、`shell` 和测试不触发后台初始化。测试使用临时数据库，不向开发数据库导入。

`TravelSeedState` 仅记录各设备的导入散列、行数和时间，不参与 WebDAV 同步。城市业务数据已确认参与同步，具体范围见 `docs/数据同步逻辑说明.md`。

价格统一为世界币，含普通旅行、游览和美食体验，纪念品另买。当前范围 2100–23000；185 个主要城市单独估价，其余 33,961 条按 AI 判断的国家基价、来源城市人口档和首都修正批量估算，取整到 100。它们是娱乐模拟值，不是逐城查询的真实旅行报价。人口不能代表旅游价值或准确费用。

例如深圳 4800、惠州 2800、成都 5000、曼谷 2800、纽约 20000。城市修正按来源 ID 匹配，同名城市不共用单独修正。候选城市仍须结合地方素材和旅行适宜性筛选，不能因为有价格就宣称适合现实出行。

定价假设保存在 `travel_price_assumptions.json`，文件版本、散列、方法数量和按 ID 解析后的城市修正保存在 `travel_cities_seed.provenance.json`。这些假设方便后续校准，不需要新系统运行时调用 AI；实际初始化读取 CSV 已存金额即可。

`travel_cities_template.csv` 是待填写价格的模板，不能直接作为已完成的系统初始数据。国家、城市、省/州和来源 ID 从 GeoNames 导出；没有中文别名时保留来源原名，不自动猜译。

| 表头 | 填写方式 |
| --- | --- |
| 城市ID | GeoNames ID，稳定匹配键；请保留，不能重复 |
| 国家代码 | 来源国家/地区的两位代码，请保留 |
| 国家 | 显示名称 |
| 省/州 | 区分同一国家内的重名地点，可以为空 |
| 城市 | 中文别名优先；缺失时为原名 |
| 城市原名 | 用于确认地点身份，请保留 |
| 价格 | 需回填的旅行总价，单位为世界币；正数，最多两位小数 |
| 启用 | 1 为启用，0 为禁用；未完成填价的条目可以先禁用 |

CSV 为 UTF-8 BOM 编码，方便 Excel 打开。请保持 CSV 格式和列顺序，主要填写「价格」，需要时改「启用」。不要按城市名称去重；同名但 ID 不同的城市会分别保留。带公式起始字符的来源名称已经按文本转义，不能作为电子表格公式执行。

价格是娱乐模拟旅行总开销，包含普通游览、用餐和当地美食体验；纪念品在旅行中单独买。不需要分列机票、住宿或日期，不能标成真实商家报价。正式种子文件随应用发布，初始化及升级不覆盖已有手动改价。

## 重新导出

下载下列官方文件到本机临时目录，不将完整原始 ZIP 附带到应用：

- [cities15000.zip](https://download.geonames.org/export/dump/cities15000.zip)
- [countryInfo.txt](https://download.geonames.org/export/dump/countryInfo.txt)
- [admin1CodesASCII.txt](https://download.geonames.org/export/dump/admin1CodesASCII.txt)
- [alternateNamesV2.zip](https://download.geonames.org/export/dump/alternateNamesV2.zip)

在项目根目录运行（替换为本机数据路径，输出路径必须尚不存在）：

```sh
.venv/bin/python manage.py export_travel_cities \
  --data-dir /tmp/odoc-geonames \
  --output /tmp/travel_cities_template.csv
```

导出命令不联网、不调用 AI、不写数据库，且拒绝覆盖已有文件，避免误删填写成果。网络下载独立于离线测试；测试不依赖第三方网站或会变动的城市数量。

```sh
.venv/bin/python manage.py test system_settings.test_travel_csv
```

回填检查使用 `validate_city_template(source, require_prices=True)`；此模式拒绝启用城市的空价格、非正数、非法数值、重复 ID 和表头不一致。禁用城市可以暂不填价。导出模板时允许价格为空，但不会自动填成 0。

## 来源与覆盖

来源：[GeoNames 下载说明](https://download.geonames.org/export/dump/readme.txt)，CC BY 4.0；使用时保留 GeoNames 署名。`cities15000` 收录人口阈值以上的城市/聚落以及首都等地点，并非全球全部城市、旅游目的地白名单或中国官方行政城市名录。需要旅行适宜性筛选时使用「启用」字段，不凭记录数量声称全覆盖。

具体下载时间、文件散列、导出数量和中文名称覆盖记录在 `travel_cities_template.provenance.json`。CSV 模板尚未包含正式价格；不是完整可发布的旅行初始数据库。
