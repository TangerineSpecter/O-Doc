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
    """规范种植目标；目标数量可以包含待采购部分，由队列等待市场实际成交。

    早期实现把目标裁剪到现有种子，手头没有种子时整条目标会被删掉，队列因此
    永远没有作物、市场也就没有采购缺口。采购额度仍在 ``procurement_limit``
    中约束，执行阶段按真实库存与体力逐批推进。
    """
    if not isinstance(specification, dict):
        raise ValueError('农场日程须同时提供farm_plan种植意图（允许空队列）')
    entries = specification.get('entries')
    if not isinstance(entries, list) or len(entries) > 32:
        raise ValueError('种植队列须为最多32项的列表')
    crops = {row['seed_sku'][5:]: {} for row in comparisons}
    result = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('种植项目须为对象')
        sku = seed_sku(entry.get('sku'), crops)
        count = entry.get('quantity')
        if type(count) is not int or not 1 <= count <= 1000:
            raise ValueError('种植目标须为1至1000的整数')
        result.append({**entry, 'sku': sku, 'quantity': count})
    return {**specification, 'entries': result}
