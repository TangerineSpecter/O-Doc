"""Read-only expected-XP cadence and fertilizer price sensitivity report.

Run with the project Python: .venv/bin/python scripts/analyze_crop_quality.py.
Uses isolated test settings; never reads or migrates the user database.
"""
import os
import sys
from pathlib import Path

os.environ['DJANGO_SETTINGS_MODULE'] = 'book_analysis.test_settings'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import django

django.setup()
from system_settings.agent_world.farm_catalog import DEFAULT_RULES
from system_settings.agent_world.farm_quality import FERTILIZERS, estimate, experience_for, probabilities, skill_progress


def expected_experience(level, rule):
    seconds = rule['growth_seconds']
    return sum(probability * (.95 * experience_for(seconds, stars) +
                             .05 * experience_for(seconds, max(1, stars - 1)))
               for stars, probability in enumerate(probabilities(level), 1))


def duration(kind, plots, frequency):
    """Unlimited inputs and stamina, no fertilizer; harvest then plant, six ops."""
    rule = DEFAULT_RULES['crops'][kind]
    field, experience = [None] * plots, 0
    for event in range(100000):
        at, remaining = event * 86400 / frequency, 6
        ripe = [i for i, crop in enumerate(field) if crop and at - crop[0] >= rule['growth_seconds']]
        for offset in range(0, len(ripe), 4):
            if not remaining:
                break
            for i in ripe[offset:offset + 4]:
                experience += expected_experience(field[i][1], rule)
                field[i] = None
            remaining -= 1
        if skill_progress(experience)['level'] == 99:
            return round(at / 86400, 1)
        empty = [i for i, crop in enumerate(field) if crop is None]
        for offset in range(0, len(empty), 4):
            if not remaining:
                break
            for i in empty[offset:offset + 4]:
                field[i] = (at, skill_progress(experience)['level'])
            remaining -= 1
    raise RuntimeError('Simulation limit exceeded')


def report():
    print('| 作物 | 地块 | 每日机会1次 | 每日机会2次 | 每日机会4次 |')
    print('|---|---:|---:|---:|---:|')
    for kind in ('potato', 'sunflower'):
        for plots in (4, 16):
            days = ' | '.join(str(duration(kind, plots, f)) + '天' for f in (1, 2, 4))
            print(f"| {DEFAULT_RULES['crops'][kind]['name']} | {plots} | {days} |")
    print('PRICE CROSSOVERS')
    for kind, rule in DEFAULT_RULES['crops'].items():
        for level in (1, 25, 50, 75, 99):
            for fertilizer_kind, fertilizer in FERTILIZERS.items():
                extra = estimate(rule, level, fertilizer)['expected_revenue'] - estimate(rule, level)['expected_revenue']
                # Enumerate every possible quote rather than comparing only base prices.
                profitable = [extra > price for price in range(fertilizer['base_price'] - fertilizer['fluctuation'],
                                                              fertilizer['base_price'] + fertilizer['fluctuation'] + 1)]
                if any(profitable) and not all(profitable):
                    print(kind, level, fertilizer_kind, round(extra, 4))


if __name__ == '__main__':
    report()
