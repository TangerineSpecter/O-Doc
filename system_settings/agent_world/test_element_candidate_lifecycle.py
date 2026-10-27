"""Exercise candidate dungeons through the real, isolated exploration lifecycle."""
from datetime import timedelta
from copy import deepcopy
import json
import random

from django.core import serializers
from django.test import SimpleTestCase, TestCase
from unittest.mock import patch
from system_settings.models import Agent, AIModel, AIProvider
from scripts.combat_design.element_all_candidates import candidate
from scripts.combat_design.evaluate_engine import progress_at
from .combat import explorations
from .combat.catalog import Catalog
from .combat.models import CombatCatalog, CombatProfile
from .combat.party_models import AdventureParty
from .combat.party_tick import tick
from .combat.profiles import ensure, stats
from .combat.store import digest, install
from .life_time import local_time


class ElementSimulationEquivalenceTests(SimpleTestCase):
    def test_element_variants_keep_ordinary_budgets_and_add_only_fixed_power(self):
        from .combat import equipment
        catalog = candidate()
        examples = [('equip.sword', 'water', 20, 0), ('equip.mage_staff', 'water', 20, .05),
                    ('equip.staff', 'earth', 30, .08), ('equip.instrument.30', 'wind', 35, 0),
                    ('equip.sword.30', 'fire', 43, 0)]
        for base, element, level, power in examples:
            for quality in ('white', 'blue', 'gold'):
                with self.subTest(base=base, quality=quality):
                    ordinary = equipment.generate(catalog, base, level, quality, random.Random(58))
                    variant = equipment.generate(catalog, f'{base}.element.{element}', level, quality, random.Random(58))
                    self.assertEqual(ordinary['affixes'], variant['affixes'])
                    original_stats, variant_stats = dict(ordinary['stats']), dict(variant['stats'])
                    key = f'{element}_power'
                    if power:
                        self.assertAlmostEqual(variant_stats.pop(key) - original_stats.pop(key, 0), power)
                    self.assertEqual(original_stats, variant_stats)
                    self.assertEqual(equipment.effective_snapshot(variant, catalog)['stats'], variant['stats'])

    def test_in_place_rounds_match_snapshot_rounds_with_identical_random_streams(self):
        from scripts.combat_design.evaluate_element_journeys import player
        from .combat.party_engine import alive, step, step_in_place
        from .combat.party_rules import spawn_enemies
        catalog = candidate()
        scenarios = [('dungeon.element.tidal_shoal', 20, ('job.warrior',)),
                     ('dungeon.element.earth', 27, ('job.warrior', 'job.priest')),
                     ('dungeon.element.wind', 35, ('job.swordsman', 'job.elementalist', 'job.cleric')),
                     ('dungeon.element.fire', 43, ('job.swordsman', 'job.elementalist', 'job.archer', 'job.cleric'))]
        for dungeon_id, level, jobs in scenarios:
            for seed in range(5):
                with self.subTest(dungeon=dungeon_id, seed=seed):
                    setup_rng = random.Random(seed)
                    players = {f'p{i}': player(catalog, job, level, setup_rng, f'p{i}', None)[0]
                               for i, job in enumerate(jobs)}
                    state = {'players': players, 'enemies': {}, 'round': 0, 'nonboss_kills': 0, 'boss_seen': False}
                    state['enemies'] = spawn_enemies(catalog, catalog.row('dungeons', dungeon_id), players,
                                                     state, setup_rng, 'test', 1)
                    original, owned = deepcopy(state), deepcopy(state)
                    original_rng, owned_rng = random.Random(seed + 1000), random.Random(seed + 1000)
                    for _ in range(30):
                        snapshot = deepcopy(original)
                        next_original, events = step(catalog, original, original_rng)
                        next_owned, owned_events = step_in_place(catalog, owned, owned_rng)
                        self.assertEqual(original, snapshot)
                        self.assertEqual(next_owned, next_original)
                        self.assertEqual(owned_events, events)
                        original, owned = next_original, next_owned
                        if not alive(original['players']) or not alive(original['enemies']):
                            break


class ElementCandidateLifecycleTests(TestCase):
    def test_long_probe_applies_experience_and_leaves_at_promotion_boundary(self):
        from scripts.combat_design.evaluate_element_journeys import party
        content = candidate()
        progress = progress_at(content, 'job.warrior', 29)
        progress['experience'] = int(content.row('level_experience', 'level.29')['experience_to_next']) - 1
        with patch('scripts.combat_design.evaluate_element_journeys.fixed_progress', return_value=progress):
            result = party(content, content.row('dungeons', 'dungeon.element.earth'),
                           ('job.warrior',), 29, 30, 18, None)
        self.assertEqual(result['levels_gained'], [1])
        self.assertEqual(result['promotion_departures'], 1)
        self.assertTrue(result['survived'])
        self.assertLess(result['elapsed_seconds'], 30 * 60)

    def test_each_dungeon_departs_and_runs_current_solo_party(self):
        install()
        content = Catalog(candidate().tables, 'combat-1.0.35')
        stored, created = CombatCatalog.objects.get_or_create(id=content.version,
            defaults={'digest': digest(content.tables), 'tables': content.tables})
        self.assertEqual(stored.digest, digest(content.tables))
        from .combat.sync import metadata, validate_source
        catalog_data = json.loads(serializers.serialize('json', CombatCatalog.objects.all()))
        self.assertTrue(validate_source(catalog_data, metadata(catalog_data)))
        provider = AIProvider.objects.create(name='element-test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='element-test', type='chat', provider=provider)
        now = local_time()
        areas = [('dungeon.element.tidal_shoal', 20, 'job.warrior'),
                 ('dungeon.element.earth', 27, 'job.warrior'),
                 ('dungeon.element.wind', 35, 'job.swordsman'),
                 ('dungeon.element.fire', 43, 'job.swordsman')]
        for index, (dungeon, level, job) in enumerate(areas):
            with self.subTest(dungeon=dungeon):
                agent = Agent.objects.create(name=f'element-{index}', model=model)
                profile = ensure('admin', agent, now)
                profile.progression = progress_at(content, job, level)
                derived = stats(profile, content)
                profile.hp, profile.mp = derived['hp_max'], derived['mp_max']
                profile.save()
                run = explorations.request('admin', agent, f'element-trip-{index}',
                                           {'adventure_mode': 'solo'}, now=now)
                run = explorations.depart(run.pk, {'dungeon_id': dungeon, 'style_id': 'style.balanced',
                                                   'duration_seconds': 1800, 'potions': {}}, now=now)
                party = AdventureParty.objects.get(pk=run.snapshot['party_id'])
                self.assertEqual(party.catalog_id, content.version)
                self.assertEqual(len(party.state['players']), 1)
                self.assertTrue(all(unit['template_id'].startswith('monster.element.')
                                    for unit in party.state['enemies'].values()))
                tick(party.pk, now=now + timedelta(seconds=15))
                run.refresh_from_db()
                self.assertGreaterEqual(run.elapsed_seconds, 15)
                self.assertEqual(CombatProfile.objects.get(pk=agent.pk).catalog_id, content.version)
