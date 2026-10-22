"""Deterministic new-equipment rolls; restoring history uses saved equipment instead."""
import hashlib
from collections import Counter
from decimal import Decimal
from random import Random

QUALITY_RULES = {'version': 1, 'white': 70, 'blue': 25, 'gold': 5}


def quality_for_roll(value: int) -> str:
    if type(value) is not int or not 0 <= value < 100:
        raise ValueError('打造品质抽样范围无效')
    return 'white' if value < 70 else 'blue' if value < 95 else 'gold'


def validate_snapshot(snapshot: dict, recipe_id: str | None = None) -> None:
    try:
        rule = snapshot['rule']
        from .blacksmith_catalog import validate_rule
        validate_rule(rule, frozen=True)
        if (snapshot.get('version') != 1 or snapshot.get('quality_rules') != QUALITY_RULES
                or not isinstance(rule, dict) or rule.get('energy_cost') != 2
                or (recipe_id is not None and rule.get('id') != recipe_id)
                or type(snapshot['level_min']) is not int or type(snapshot['level_max']) is not int
                or not 1 <= snapshot['level_min'] <= snapshot['level_max'] <= 99
                or not rule['level_min'] <= snapshot['level_min'] <= snapshot['level_max'] <= rule['level_max']
                or any(not isinstance(snapshot.get(key), str) or not snapshot[key]
                       for key in ('catalog_id', 'template_id', 'job'))):
            raise ValueError()
        required = Counter()
        for row in rule['ingredients']:
            if (not isinstance(row.get('sku'), str) or not row['sku'].startswith('combat.material.')
                    or type(row['quantity']) is not int or row['quantity'] < 1 or row['sku'] in required):
                raise ValueError()
            required[row['sku']] = row['quantity']
        actual = Counter()
        seen = set()
        for row in snapshot['materials']:
            identity = row['inventory_id']
            price = Decimal(str(row['price']))
            if (not isinstance(identity, str) or not identity or identity in seen
                    or type(row['quantity']) is not int or row['quantity'] < 1
                    or not price.is_finite() or price < 0):
                raise ValueError()
            seen.add(identity)
            actual[row['sku']] += row['quantity']
        if not required or actual != required:
            raise ValueError()
    except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
        raise ValueError('打造当前件的规则或材料快照无效') from exc


def outcome(key: str, snapshot: dict, catalog) -> dict:
    from .combat.equipment import generate
    validate_snapshot(snapshot)
    seed = hashlib.sha256(f'blacksmith:v1:{key}'.encode()).hexdigest()
    rng = Random(seed)
    level = rng.randint(snapshot['level_min'], snapshot['level_max'])
    quality = quality_for_roll(rng.randrange(100))
    return generate(catalog, snapshot['template_id'], level, quality, rng)
