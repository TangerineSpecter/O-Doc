"""日市场规划的代码候选：数量档位、价格上限、装备部位都在这里算好。

模型只做“选一个档位”的小决策，不做算术、不枚举笛卡尔组合。单题状态
控制在一千字符上下，候选最多 MAX_OPTIONS 个；模型不可用时由代码按缺口
默认值收官，不再回退到付费文本模型。
"""
import logging
from decimal import Decimal

from .inventory_stock import stock_quantity
from .market_models import MarketListing
from .market_shop import shop_payload
from .fishing.constants import MAX_BAIT_STOCK

MAX_OPTIONS = 10
MAX_QUESTIONS = 8
CRAFTING_SIMULATION_ENERGY = Decimal('1000000')
SEED_PREFIX = 'seed.'
FERTILIZER_PREFIX = 'fertilizer.'

logger = logging.getLogger(__name__)


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def quantity_options(missing: int, unit_price, available, *, unit: str = '份',
                     owned: int = 0) -> tuple[dict, dict]:
    """围绕缺口生成 0 / 一半 / 缺口 / 缺口+1 / 缺口+2 档位，去重并过滤买不起的。"""
    missing = max(0, int(missing or 0))
    if missing <= 0:
        return {}, {}
    price = money(unit_price)
    budget = max(Decimal(0), money(available))
    if price <= 0:
        return {}, {}
    half = max(1, (missing + 1) // 2)
    choices, meta = {}, {}
    wanted = sorted({0, half, missing, missing + 1, missing + 2})
    for quantity in [min(99, value) for value in wanted][:MAX_OPTIONS]:
        cost = (price * quantity).quantize(Decimal('0.01'))
        if quantity and cost > budget:
            continue
        choices[str(quantity)] = _quantity_label(quantity, missing, cost, unit, owned)
        meta[str(quantity)] = {'quantity': quantity, 'cost': str(cost)}
    return choices, meta


def bait_quantity_ranges(owned: int, unit_price, available) -> tuple[dict, dict]:
    """十个以内的十位区间；0 表示不买，末尾区间可不足十份。"""
    price = money(unit_price)
    if price <= 0:
        return {}, {}
    maximum = min(MAX_BAIT_STOCK - max(0, int(owned)),
                  int(max(Decimal(0), money(available)) // price))
    maximum = max(0, maximum)
    choices, bounds = {}, {}
    for lower in range(0, maximum + 1, 10):
        upper = min(lower + 9, maximum)
        key = f'{lower}-{upper}'
        label = (f'不买或买1～{upper}份' if upper else '不买') if lower == 0 else f'买{lower}～{upper}份'
        choices[key] = label
        bounds[key] = (lower, upper)
    return choices, bounds


def bait_exact_quantities(lower: int, upper: int, unit_price, missing: int) -> dict:
    """所选区间内逐份列出，最多十个合法整数。"""
    price = money(unit_price)
    return {str(count): ('不买' if count == 0 else
            f'买{count}份（约{(price * count).quantize(Decimal("0.01"))}元）' +
            ('，补齐参考缺口' if count == missing else ''))
            for count in range(lower, upper + 1)}


def _quantity_label(quantity: int, missing: int, cost: Decimal, unit: str, owned: int) -> str:
    if quantity == 0:
        return f'不买，先用现有{owned}{unit}' if owned else '不买'
    if quantity < missing:
        return f'买{quantity}{unit}（约{cost}元），先补一部分'
    if quantity == missing:
        return f'买{quantity}{unit}（约{cost}元），刚好补齐今天'
    return f'买{quantity}{unit}（约{cost}元），多备{quantity - missing}{unit}'


def price_options(min_price, *, unit: str = '件') -> tuple[dict, dict]:
    """按当前最低价生成 不追 / 最低价 / +10% / +20% 四档上限。"""
    base = money(min_price)
    if base <= 0:
        return {}, {}
    values = sorted({base, (base * Decimal('1.1')).quantize(Decimal('0.01')),
                     (base * Decimal('1.2')).quantize(Decimal('0.01'))})
    choices, meta = {'0': '不追，等更合适的'}, {'0': {'price': '0'}}
    for index, value in enumerate(values):
        tag = '当前最低价' if index == 0 else f'加{(value / base - 1) * 100:.0f}%'
        choices[str(value)] = f'≤{value}元/{unit}（{tag}）'
        meta[str(value)] = {'price': str(value)}
    return choices, meta


def _fertilizer_effect(rule: dict) -> str:
    if rule.get('yield_percentage'):
        return f'每袋约 +{rule["yield_percentage"]}% 产量'
    if rule.get('quality_bonus'):
        return f'每袋约 +{round(float(rule["quality_bonus"]) * 100)}% 品质'
    return ''


def need_rows(owner: str, agent, now=None) -> list[dict]:
    """从种植队列和当小时报价计算缺口，只保留今天买得到的种子和肥料。"""
    from .farm_catalog import catalog_for
    from .farm_models import AgentFarm
    from .farm_queue_plan import overview
    farm = AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first()
    queue = overview(farm) or {}
    rules = catalog_for(owner).rules
    shop = shop_payload(owner, now)
    slot_prices = {row['sku']: money(row['price']) for row in shop['slots']}
    supply_prices = {row['sku']: money(row['price']) for row in shop['supplies']}
    seeds, fertilizers = {}, {}
    for entry in queue.get('entries', []):
        missing = int(entry.get('missing_seeds') or 0)
        if missing > 0:
            seeds[entry['sku']] = seeds.get(entry['sku'], 0) + missing
        kind = entry.get('fertilizer')
        missing = int(entry.get('missing_fertilizer') or 0)
        if kind and missing > 0:
            sku = FERTILIZER_PREFIX + kind
            fertilizers[sku] = fertilizers.get(sku, 0) + missing
    rows = []
    for sku, missing in sorted(seeds.items(), key=lambda item: (-item[1], item[0])):
        price = slot_prices.get(sku)
        if not price:
            continue  # 本小时没有报价，今天买不到，不生成采购目标
        kind = sku.removeprefix(SEED_PREFIX)
        crop = rules['crops'].get(kind, {})
        rows.append({'key': 'seed:' + sku, 'kind': 'seed', 'sku': sku,
                     'name': crop.get('name', kind) + '种子', 'missing': missing,
                     'owned': stock_quantity(agent.pk, owner, sku),
                     'unit_price': price, 'unit': '份'})
    for sku, missing in sorted(fertilizers.items(), key=lambda item: (-item[1], item[0])):
        kind = sku.removeprefix(FERTILIZER_PREFIX)
        rule = rules['fertilizers'].get(kind, {})
        price = supply_prices.get(sku) or money(rule.get('base_price', 0))
        if not price:
            continue
        rows.append({'key': 'fertilizer:' + sku, 'kind': 'fertilizer', 'sku': sku,
                     'name': rule.get('name', kind), 'missing': missing,
                     'owned': stock_quantity(agent.pk, owner, sku),
                     'unit_price': price, 'unit': '袋',
                     'effect': _fertilizer_effect(rule)})
    from .fishing.market import needs as fishing_needs
    rows.extend(fishing_needs(owner, agent, shop['supplies']))
    return rows


def crafting_input_domain(sku: str) -> str:
    if sku.startswith(('crop.', 'product.')):
        return 'cooking'
    if sku.startswith('combat.material.'):
        return 'alchemy'
    return ''


def craftable_after_purchase(owner: str, agent, sku: str, quantity: int = 1, *,
                             facts_cache: dict | None = None) -> bool:
    """仅允许能增加美食、炼金或打造产出的原料进入购买候选。"""
    domain = crafting_input_domain(sku)
    if not domain:
        return True
    if type(quantity) is not int or quantity < 1:
        return False

    return sku in craftable_purchase_skus(owner, agent, {sku: quantity}, facts_cache=facts_cache)


def _crafting_facts(owner: str, actor_id: str, domain: str) -> dict:
    """市场仅需等级、规则和扣除制作预留的原料，不重放体力或加载偏好、成品。"""
    if domain == 'cooking':
        from .cooking_catalog import rules_for, skill_progress
        from .cooking_models import CookingSkill as Skill
        from .cooking_queries import validate_actor
        from .cooking_schedule_plan import available_pool
    else:
        from .alchemy_catalog import rules_for, skill_progress
        from .alchemy_models import AlchemySkill as Skill
        from .alchemy_queries import validate_actor
        from .alchemy_schedule_plan import available_pool
    validate_actor(owner, actor_id)
    experience = Skill.objects.filter(pk=actor_id, owner_id=owner).values_list('experience', flat=True).first()
    return {'rules': rules_for(owner), 'level': skill_progress(experience or 0)['level'],
            'pool': available_pool(owner, actor_id)}


def crafting_demand_facts(owner: str, seller_id: str, sku: str) -> dict | None:
    """统计除卖家外，当前会通过该 SKU 采购用途校验的活跃居民。"""
    domain = crafting_input_domain(sku)
    if not domain:
        return None

    from system_settings.models import Agent
    from .social_config import resident_ids
    residents = list(Agent.objects.filter(pk__in=resident_ids(owner), archived_at__isnull=True)
                     .exclude(pk=seller_id).only('id').order_by('id'))
    demand_count, unknown_count = 0, 0
    for resident in residents:
        try:
            demand_count += sku in craftable_purchase_skus(owner, resident, {sku: 1}, strict=True)
        except (KeyError, TypeError, ValueError):
            logger.exception('市场需求用途校验失败 actor=%s sku=%s', resident.pk, sku)
            unknown_count += 1
    return {
        'status': 'partial' if unknown_count else 'complete',
        'domain': domain,
        'crafting_domains': ['alchemy', 'blacksmith'] if domain == 'alchemy' else [domain],
        'resident_count_excluding_self': len(residents),
        'demand_resident_count': None if unknown_count else demand_count,
        'known_demand_resident_count': demand_count,
        'unknown_resident_count': unknown_count,
        'demand_basis': '当前等级、职业路线、配方和可用库存下（不以可恢复体力为门槛），购买1件该SKU会增加至少一种制作配方的可制作数量',
    }


def craftable_purchase_skus(owner: str, agent, quantities: dict[str, int], *,
                            facts_cache: dict | None = None, strict: bool = False) -> set[str]:
    """批量校验挂牌原料，按制作领域各读取一次当前技能与可用库存。"""
    allowed = set()
    cache = facts_cache if facts_cache is not None else {}
    for domain in ('cooking', 'alchemy'):
        candidates = {sku: quantity for sku, quantity in quantities.items()
                      if crafting_input_domain(sku) == domain and type(quantity) is int and quantity > 0}
        if not candidates:
            continue
        if domain == 'cooking':
            from .cooking_schedule_plan import recipe_options
        else:
            from .alchemy_schedule_plan import recipe_options
        try:
            key = (owner, agent.pk, domain)
            if key not in cache:
                cache[key] = _crafting_facts(owner, agent.pk, domain)
            facts = cache[key]
        except (KeyError, TypeError, ValueError):
            if strict:
                raise
            logger.exception('市场制作用途校验失败 actor=%s domain=%s', agent.pk, domain)
            continue

        rules, level, pool = facts['rules'], facts['level'], facts['pool']
        output_limit_key = 'max_portions' if domain == 'cooking' else 'max_bottles'
        before = recipe_options(rules, level, pool, CRAFTING_SIMULATION_ENERGY)
        for sku, quantity in candidates.items():
            after = recipe_options(rules, level, [*pool, {'sku': sku, 'quantity': quantity}],
                                   CRAFTING_SIMULATION_ENERGY)
            if any(any(row['sku'] == sku for row in recipe['ingredients'])
                   and recipe[output_limit_key] > before.get(recipe_id, {}).get(output_limit_key, 0)
                   for recipe_id, recipe in after.items()):
                allowed.add(sku)
    material_quantities = {sku: quantity for sku, quantity in quantities.items()
                           if sku.startswith('combat.material.') and type(quantity) is int and quantity > 0}
    if material_quantities:
        allowed.update(blacksmith_purchase_skus(owner, agent, material_quantities, cache=cache, strict=strict))
    return allowed


def blacksmith_purchase_skus(owner: str, agent, quantities: dict[str, int], *, cache=None, strict=False) -> set[str]:
    """A material may be useful for either alchemy or the resident's forging route."""
    from collections import Counter
    from .blacksmith_candidates import recipe_options, read_catalog
    from .blacksmith_catalog import rules_for
    from .combat.models import CombatProfile
    from .crafting_materials import available_pool
    from .alchemy_queries import validate_actor
    cache = cache if cache is not None else {}
    key = (owner, agent.pk, 'blacksmith')
    try:
        if key not in cache:
            validate_actor(owner, agent.pk)
            profile = CombatProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
            cache[key] = ({'profile': profile, 'catalog': read_catalog(profile),
                           'rules': rules_for(owner), 'pool': available_pool(owner, agent.pk)} if profile else None)
        facts = cache[key]
        if facts is None:
            return set()
        pool, profile, catalog, rules = (facts[field] for field in ('pool', 'profile', 'catalog', 'rules'))
        counts = Counter()
        for row in pool:
            counts[row['sku']] += row['quantity']
        result = set()
        for sku, quantity in quantities.items():
            after = recipe_options(rules, catalog, profile, [*pool, {'sku': sku, 'quantity': quantity}],
                                   CRAFTING_SIMULATION_ENERGY)
            for rule in after.values():
                if not any(row['sku'] == sku for row in rule['ingredients']):
                    continue
                before_count = min(counts[row['sku']] // row['quantity'] for row in rule['ingredients'])
                after_count = min((counts[row['sku']] + (quantity if row['sku'] == sku else 0)) // row['quantity']
                                  for row in rule['ingredients'])
                if after_count > before_count:
                    result.add(sku)
                    break
        return result
    except (KeyError, TypeError, ValueError):
        if strict:
            raise
        logger.exception('市场打造用途校验失败 actor=%s', agent.pk)
        return set()


def listing_rows(owner: str, actor_id: str, limit: int = 2, agent=None) -> list[dict]:
    """按 sku 聚合居民挂牌，先过滤无法加工增产的原料，再排高星与性价比。"""
    best = {}
    for row in MarketListing.objects.filter(owner_id=owner, status='active', remaining_quantity__gt=0).exclude(seller_id=actor_id):
        item = row.item or {}
        source = item.get('source') or {}
        sku = source.get('sku') or ''
        stars = _listing_stars(source)
        if not sku or stars is None or row.unit_price <= 0:
            continue
        entry = best.setdefault(sku, {'sku': sku, 'name': item.get('name', sku), 'count': 0,
                                      'min_price': row.unit_price,
                                      'max_stars': stars,
                                      'value': money(item.get('value')), 'star_quotes': {}})
        entry['count'] += row.remaining_quantity
        entry['min_price'] = min(entry['min_price'], row.unit_price)
        entry['max_stars'] = max(entry['max_stars'], stars)
        entry['value'] = max(entry['value'], money(item.get('value')))
        quote = entry['star_quotes'].setdefault(stars, {'count': 0, 'min_price': row.unit_price})
        quote['count'] += row.remaining_quantity
        quote['min_price'] = min(quote['min_price'], row.unit_price)

    def rank(entry):
        value = entry['value']
        ratio = (entry['min_price'] / value) if value > 0 else Decimal('999')
        return (-entry['max_stars'], ratio, entry['sku'])

    if agent is None:
        from system_settings.models import Agent
        from .life_config import owns_actor
        agent = (Agent.objects.filter(pk=actor_id, archived_at__isnull=True).first()
                 if owns_actor(owner, actor_id) else None)

    input_quantities = {entry['sku']: 1 for entry in best.values()
                        if crafting_input_domain(entry['sku'])}
    craftable = craftable_purchase_skus(owner, agent, input_quantities) if agent else set()
    candidates = []
    for entry in best.values():
        if crafting_input_domain(entry['sku']):
            if entry['sku'] not in craftable:
                continue
        candidates.append(entry)
    return sorted(candidates, key=rank)[:limit]


def _listing_stars(source: dict) -> int | None:
    value = source.get('stars')
    if value is None or value == '':
        value = 1
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None
    try:
        stars = int(value)
    except (TypeError, ValueError):
        return None
    return stars if 1 <= stars <= 5 else None


def listing_star_options(row: dict, available) -> dict:
    """Only actual, affordable star thresholds; never multiply stars and prices."""
    quotes = row.get('star_quotes') or {}
    result = {}
    for stars in sorted(quotes):
        eligible = [quote for level, quote in quotes.items() if level >= stars]
        minimum = min(money(quote['min_price']) for quote in eligible)
        if minimum <= money(available):
            result[str(stars)] = {'min_stars': stars,
                'count': sum(quote['count'] for quote in eligible), 'min_price': str(minimum)}
    return result


def listing_quote(owner: str, actor_id: str, sku: str, min_stars: int) -> dict | None:
    """Refresh only the selected SKU and threshold after the quality decision."""
    count, minimum = 0, None
    rows = MarketListing.objects.filter(owner_id=owner, status='active', remaining_quantity__gt=0,
        item__source__sku=sku).exclude(seller_id=actor_id).values(
            'unit_price', 'remaining_quantity', 'item__source__stars')
    for row in rows:
        stars = _listing_stars({'stars': row['item__source__stars']})
        if stars is None or stars < min_stars or row['unit_price'] <= 0:
            continue
        count += row['remaining_quantity']
        minimum = min(minimum, row['unit_price']) if minimum is not None else row['unit_price']
    return {'count': count, 'min_price': money(minimum)} if count else None
