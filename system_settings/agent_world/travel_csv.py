"""GeoNames 城市模板导出与回填文件校验，不写入业务数据库。"""
import csv
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import TextIO
from zipfile import ZipFile
from io import TextIOWrapper

HEADERS = ('城市ID', '国家代码', '国家', '省/州', '城市', '城市原名', '价格', '启用')
CITY_NAME_CORRECTIONS = {
    '5884051': 'Alliston', '4366476': '蘭道斯敦', '4938048': 'Grafton',
    '4995197': '哈姆特拉米克', '2317397': '班顿杜', '1805093': '旧县镇',
}
# 不把片区、已经不存在的地点及多个聚落集合当作独立旅行目的地。
EXCLUDED_FEATURE_CODES = frozenset({'PPLX', 'PPLH', 'PPLCH', 'PPLQ', 'PPLW', 'PPLS'})
# 原始主名本身仍指向县/区且未确认具体城镇，暂不作为自动旅行候选。
UNCONFIRMED_SETTLEMENT_IDS = frozenset({'6089125', '7931312', '12492660', '12492669', '12326384', '1620919'})


def administrative_alias(name: str, country_code: str) -> bool:
    return bool(re.search(r'(省|自治区|自治州|行政区|地区|居委会|县|郡)$', name)
        or country_code == 'TH' and name.endswith('府')
        or country_code == 'US' and name.endswith('州'))


@dataclass(frozen=True)
class City:
    source_id: str
    name: str
    country_code: str
    region_code: str
    feature_code: str


def read_cities(path: Path) -> list[City]:
    cities = []
    seen = set()
    with ZipFile(path) as archive, archive.open('cities15000.txt') as data:
        for line_no, fields in enumerate(csv.reader(TextIOWrapper(data, encoding='utf-8'), delimiter='\t'), 1):
            if len(fields) != 19 or fields[6] != 'P' or not fields[0].isdigit():
                raise ValueError(f'城市数据第 {line_no} 行格式不正确')
            if fields[0] in seen:
                raise ValueError(f'城市数据重复 ID：{fields[0]}')
            seen.add(fields[0])
            cities.append(City(fields[0], fields[1], fields[8], fields[10], fields[7]))
    if not cities:
        raise ValueError('城市数据为空')
    return cities


def read_countries(path: Path) -> dict[str, tuple[str, str]]:
    countries = {}
    with path.open(encoding='utf-8') as source:
        for fields in csv.reader((line for line in source if not line.startswith('#')), delimiter='\t'):
            if not fields:
                continue
            if len(fields) < 17:
                raise ValueError('国家数据格式不正确')
            countries[fields[0]] = (fields[4], fields[16])
    return countries


def read_regions(path: Path) -> dict[str, tuple[str, str]]:
    regions = {}
    with path.open(encoding='utf-8') as source:
        for fields in csv.reader(source, delimiter='\t'):
            if len(fields) != 4:
                raise ValueError('省/州数据格式不正确')
            regions[fields[0]] = (fields[1], fields[3])
    return regions


def read_chinese_names(path: Path, wanted: set[str], *, city_countries: dict[str, str] | None = None) -> dict[str, str]:
    """仅选中文且非历史/俗称的别名；优先官方首选名，缺失时保留原名。"""
    selected = {}
    scores = {}
    with ZipFile(path) as archive:
        members = [item for item in archive.infolist()
                   if not item.is_dir() and Path(item.filename).name == 'alternateNamesV2.txt']
        if len(members) != 1:
            raise ValueError('别名压缩包缺少唯一的 alternateNamesV2.txt')
        with archive.open(members[0]) as data:
            for fields in csv.reader(TextIOWrapper(data, encoding='utf-8'), delimiter='\t'):
                if len(fields) < 8:
                    raise ValueError('中文别名数据格式不正确')
                _, source_id, language, name, preferred, short, colloquial, historic = fields[:8]
                if source_id not in wanted or language not in {'zh', 'zh-CN', 'zh-Hans'} or not name:
                    continue
                if city_countries and source_id in city_countries and administrative_alias(name, city_countries[source_id]):
                    continue
                if historic == '1' or colloquial == '1':
                    continue
                score = (preferred == '1', language in {'zh-CN', 'zh-Hans'}, short == '1')
                if source_id not in selected or score > scores[source_id]:
                    selected[source_id], scores[source_id] = name, score
    return selected


def _spreadsheet_text(value: str) -> str:
    # Source names are data; do not let a spreadsheet execute them as formulas.
    return "'" + value if value.lstrip().startswith(('=', '+', '-', '@')) else value


def export_city_template(data_dir: Path, output: Path) -> dict:
    cities = read_cities(data_dir / 'cities15000.zip')
    countries = read_countries(data_dir / 'countryInfo.txt')
    regions = read_regions(data_dir / 'admin1CodesASCII.txt')
    wanted = {city.source_id for city in cities}
    wanted.update(value[1] for value in countries.values())
    wanted.update(value[1] for value in regions.values())
    names = read_chinese_names(data_dir / 'alternateNamesV2.zip', wanted, city_countries={city.source_id: city.country_code for city in cities})
    rows = []
    for city in cities:
        if city.country_code not in countries:
            raise ValueError(f'城市 {city.source_id} 缺少所属国家：{city.country_code}')
        country, country_id = countries[city.country_code]
        region, region_id = regions.get(f'{city.country_code}.{city.region_code}', ('', ''))
        rows.append({
            '城市ID': city.source_id, '国家代码': city.country_code,
            '国家': _spreadsheet_text(names.get(country_id, country)),
            '省/州': _spreadsheet_text(names.get(region_id, region)),
            '城市': _spreadsheet_text(CITY_NAME_CORRECTIONS.get(city.source_id, names.get(city.source_id, city.name))),
            '城市原名': _spreadsheet_text('Bandundu' if city.source_id == '2317397' else city.name), '价格': '',
            '启用': '0' if city.feature_code in EXCLUDED_FEATURE_CODES or city.source_id in UNCONFIRMED_SETTLEMENT_IDS else '1',
        })
    rows.sort(key=lambda row: (row['国家代码'], row['省/州'], row['城市'], int(row['城市ID'])))
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8-sig', newline='') as target:
        writer = csv.DictWriter(target, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(rows)
    return {'cities': len(rows), 'countries': len({city.country_code for city in cities}),
            'cities_with_chinese_name': sum(city.source_id in names for city in cities)}


def validate_city_template(source: TextIO, *, require_prices: bool = False) -> list[dict]:
    reader = csv.DictReader(source)
    if tuple(reader.fieldnames or ()) != HEADERS:
        raise ValueError('CSV 表头或顺序不正确')
    result, seen = [], set()
    for line_no, row in enumerate(reader, 2):
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f'第 {line_no} 行列数不正确')
        source_id = row['城市ID'].strip()
        if not source_id.isascii() or not source_id.isdigit() or source_id in seen:
            raise ValueError(f'第 {line_no} 行城市 ID 无效或重复')
        seen.add(source_id)
        code = row['国家代码'].strip()
        if len(code) != 2 or not code.isascii() or not code.isupper() or not code.isalpha():
            raise ValueError(f'第 {line_no} 行国家代码无效')
        if not row['国家'].strip() or not row['城市'].strip() or row['启用'] not in {'0', '1'}:
            raise ValueError(f'第 {line_no} 行国家、城市或启用值无效')
        price = row['价格'].strip()
        if not price:
            if require_prices and row['启用'] == '1':
                raise ValueError(f'第 {line_no} 行启用城市尚未填写价格')
        else:
            try:
                amount = Decimal(price)
            except InvalidOperation as exc:
                raise ValueError(f'第 {line_no} 行价格不是有效数字') from exc
            if (not amount.is_finite() or amount <= 0 or amount >= Decimal('10000000000')
                    or amount.as_tuple().exponent < -2):
                raise ValueError(f'第 {line_no} 行价格须为正数，最多两位小数且小于 100 亿')
        result.append(row)
    if not result:
        raise ValueError('CSV 没有城市数据')
    return result
