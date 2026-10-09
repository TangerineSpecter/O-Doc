"""Read-only balance report; isolated settings, no database or provider access."""
import os
import sys
from decimal import Decimal, ROUND_CEILING
from pathlib import Path

os.environ['DJANGO_SETTINGS_MODULE'] = 'book_analysis.test_settings'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import django

django.setup()
from system_settings.agent_world.cooking_catalog import DEFAULT_RULES
from system_settings.agent_world.farm_catalog import DEFAULT_RULES as FARM_RULES
from system_settings.agent_world.cooking_quality import material_stars, estimate, skill_progress, level_cost, experience_for, probabilities

VALUES = {f'crop.{k}': str(v['sale_price']) for k, v in FARM_RULES['crops'].items()}
VALUES.update({'product.chicken.normal': '30', 'product.cow.normal': '100'})


def materials(rule, strategy):
    rows = []
    for index, ingredient in enumerate(rule['ingredients']):
        sku, quantity = ingredient['sku'], ingredient['quantity']
        stars = (5 if strategy == 'high' else int(strategy) if strategy in ('1', '2', '3', '4', '5') else 1) if sku.startswith('crop.') else 1
        parts = [(quantity, stars)]
        if strategy == 'mixed' and sku.startswith('crop.'):
            parts = [(quantity // 2, 1), (quantity - quantity // 2, 5)] if quantity > 1 else [(1, 1 if index % 2 else 5)]
        for part, grade in parts:
            if not part: continue
            value = Decimal(VALUES[sku])
            if grade > 1:
                value = (value * Decimal(('1', '1.2', '1.5', '1.8', '2.2')[grade - 1])).to_integral_value(rounding=ROUND_CEILING)
            rows.append({'inventory_id': f'{index}:{grade}', 'sku': sku, 'quantity': part, 'stars': grade,
                         'lots': [{'quantity': part, 'price': str(value)}]})
    return rows


def duration(strategy):
    # Always choose the unlocked recipe with highest expected XP. Unlimited raw inputs/stamina;
    # high strategy means five-star crops and ordinary one-star livestock products.
    portions = 0.0
    for level in range(1, 99):
        available = [row for row in DEFAULT_RULES.values() if row['required_level'] <= level]
        rate = max(sum(p * experience_for(rule['experience'], stars)
                       for stars, p in enumerate(probabilities(level, material_stars(materials(rule, strategy), VALUES)), 1))
                   for rule in available)
        portions += level_cost(level) / rate
    return portions


def report():
    print('Assumptions: low=one-star ingredients; high=five-star crops + one-star livestock. Recovery values only; no listing premiums.')
    print('| 食谱 | 等级 | 低星材料均星 | 低星原料成本 | 低星预期差额 | 精品材料均星 | 精品原料成本 | 精品预期差额 |')
    print('|---|---:|---:|---:|---:|---:|---:|---:|')
    signs = set()
    for rule in DEFAULT_RULES.values():
        for level in (1, 10, 25, 50, 75, 99):
            estimates = [estimate(rule, level, materials(rule, strategy), VALUES) for strategy in ('low', 'high')]
            assert all(abs(sum(e['star_probabilities']) - 1) < 1e-12 for e in estimates)
            signs.update(Decimal(e['expected_processing_gain']) > 0 for e in estimates)
            fields = ' | '.join(f"{Decimal(e['material_stars']):.2f} | {Decimal(e['ingredient_value']):.2f} | {Decimal(e['expected_processing_gain']):.2f}" for e in estimates)
            print(f"| {rule['name']} | {level} | {fields} |")
    mixed_cases = 0
    for rule in DEFAULT_RULES.values():
        for level in (1, 10, 25, 50, 75, 99):
            for pattern in ('1', '2', '3', '4', '5', 'mixed'):
                case = estimate(rule, level, materials(rule, pattern), VALUES)
                assert abs(sum(case['star_probabilities']) - 1) < 1e-12
                assert 1 <= Decimal(case['material_stars']) <= 5
                signs.add(Decimal(case['expected_processing_gain']) > 0)
                mixed_cases += 1
    print('Additional material patterns checked:', mixed_cases)
    print('Profit signs:', sorted(signs))
    print('| 用料策略 | 估计总份数 | 每日1份 | 每日3份 | 每日6份 |')
    print('|---|---:|---:|---:|---:|')
    for strategy in ('low', 'high'):
        count = duration(strategy)
        print(f'| {strategy} | {count:.1f} | {count:.1f}天 | {count/3:.1f}天 | {count/6:.1f}天 |')
    print('Cadence is a level-by-level expected-XP approximation, not a promised completion date; ingredient farming, money, stamina and random variation are excluded.')


if __name__ == '__main__':
    report()
