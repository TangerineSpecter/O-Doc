"""种植输入兼容和库存边界；只处理意图，不产生采购或播种事实。"""


def seed_sku(value: object, crops: dict) -> str:
    if not isinstance(value, str):
        raise ValueError(f'种植项目必须引用现有种子SKU（当前值：{value!r}）')
    kind = value
    if value.startswith(('seed.', 'crop.')):
        kind = value.split('.', 1)[1]
    if kind not in crops:
        raise ValueError(f'种植项目必须引用现有种子SKU（当前值：{value!r}）')
    return 'seed.' + kind


def inventory_plan(specification: object, comparisons: list[dict]) -> dict:
    """模型的目标不能超出现有种子；采购意向沿用采购上限和活动原因。"""
    if not isinstance(specification, dict):
        raise ValueError('农场日程须同时提供farm_plan种植意图（允许空队列）')
    entries = specification.get('entries')
    if not isinstance(entries, list) or len(entries) > 32:
        raise ValueError('种植队列须为最多32项的列表')
    stocks = {row['seed_sku']: row['seed_quantity'] for row in comparisons}
    crops = {sku[5:]: {} for sku in stocks}
    result = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('种植项目须为对象')
        sku = seed_sku(entry.get('sku'), crops)
        count = entry.get('quantity')
        if type(count) is not int or not 1 <= count <= 1000:
            raise ValueError('种植目标须为1至1000的整数')
        count = min(count, stocks[sku])
        stocks[sku] -= count
        if count:
            result.append({**entry, 'sku': sku, 'quantity': count})
    return {**specification, 'entries': result}
