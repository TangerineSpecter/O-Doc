from django.test import SimpleTestCase

from ..alchemy_limits import SHARED_COOLDOWN_ROUNDS
from ..elixir_effects import effects_for, describe
from .elixir import use
from .effects import element_multiplier, status


def player(**overrides):
    value = {'name': '居民', 'hp': 100, 'mp': 100, 'stats': {'hp_max': 100, 'mp_max': 100,
             'physical_attack': 10, 'physical_defense': 5, 'critical': .05, 'critical_damage': 1.5}, 'states': []}
    value.update(overrides)
    return value


def carried(recipe, stars=1, count=1, trigger=None):
    effects = effects_for(recipe, stars)
    return {'recipe_id': recipe, 'sku': 'elixir.' + recipe, 'name': recipe, 'stars': stars,
            'count': count, 'remaining': count, 'effects': effects, 'summary': describe(effects),
            'trigger': trigger or {}}


class ElixirEngineTests(SimpleTestCase):
    def test_heal_uses_percent_and_shared_cooldown(self):
        hero = player(hp=20)
        entry = carried('healing', trigger={'kind': 'hp_below', 'value': .35})
        state = {'elixir_cooldown': 0, 'encounter': 1}
        events = use(hero, {'rank': 'normal'}, [entry], state, 5)
        self.assertEqual(hero['hp'], 42)
        self.assertEqual(entry['remaining'], 0)
        self.assertEqual(state['elixir_cooldown'], 5 + SHARED_COOLDOWN_ROUNDS)
        self.assertEqual(events[0]['kind'], 'elixir')
        self.assertEqual(use(hero, {'rank': 'normal'}, [entry], state, 6), [])

    def test_attack_buff_only_on_elite_or_boss_first_round(self):
        hero, entry = player(), carried('fury', trigger={'kind': 'elite_first'})
        state = {'elixir_cooldown': 0, 'encounter': 7}
        self.assertEqual(use(hero, {'rank': 'normal'}, [entry], state, 0), [])
        self.assertEqual(entry['remaining'], 1)
        self.assertTrue(use(hero, {'rank': 'elite'}, [entry], state, 0))
        self.assertEqual(entry['remaining'], 0)
        self.assertEqual(state['elixir_used_encounter'], 7)
        self.assertTrue(any(s.get('stat') == 'physical_attack' for s in hero['states']))
        # A second boss later in the same run is a new encounter and can trigger again.
        later = carried('fury', trigger={'kind': 'elite_first'})
        state.update(encounter=8, elixir_cooldown=0)
        self.assertTrue(use(hero, {'rank': 'boss'}, [later], state, 20))

    def test_attack_buff_skips_after_first_round(self):
        hero, entry = player(), carried('fury', trigger={'kind': 'elite_first'})
        state = {'elixir_cooldown': 0, 'encounter': 3, 'round_in_encounter': 1}
        self.assertEqual(use(hero, {'rank': 'elite'}, [entry], state, 5), [])
        self.assertEqual(entry['remaining'], 1)

    def test_aegis_skips_when_shield_is_already_active(self):
        hero = player(hp=50, states=[{'code': 'shield', 'group': 'holy', 'stat': 'hp_max',
                                      'value': .2, 'remaining': 20, 'expires': 9}])
        entry = carried('aegis', trigger={'kind': 'hp_below', 'value': .6})
        state = {'elixir_cooldown': 0, 'encounter': 1}
        self.assertEqual(use(hero, {'rank': 'normal'}, [entry], state, 4), [])
        self.assertEqual(entry['remaining'], 1)

    def test_regen_skips_while_same_effect_is_active(self):
        hero = player(hp=50, states=[{'code': 'hot', 'group': 'elixir:regen', 'stat': 'hp_max',
                                      'value': .05, 'expires': 9}])
        entry = carried('regen', trigger={'kind': 'hp_below', 'value': .7})
        state = {'elixir_cooldown': 0, 'encounter': 1}
        self.assertEqual(use(hero, {'rank': 'normal'}, [entry], state, 4), [])
        self.assertEqual(entry['remaining'], 1)

    def test_purify_cleanses_and_blocks_new_negative_states(self):
        hero = player(states=[{'code': 'dot', 'group': 'poison', 'value': -.1, 'remaining': 3, 'next_tick': 1},
                              {'code': 'modifier', 'group': 'weaken', 'stat': 'attack', 'value': -.2, 'expires': 5}])
        entry = carried('purify', trigger={'kind': 'debuff_count', 'value': 2})
        state = {'elixir_cooldown': 0, 'encounter': 1}
        self.assertTrue(use(hero, {'rank': 'normal'}, [entry], state, 3))
        self.assertFalse(any(s.get('code') == 'dot' or s.get('value', 0) < 0 for s in hero['states']))
        status(hero, {'code': 'dot', 'group': 'new-poison', 'value': -.1, 'remaining': 3, 'next_tick': 1})
        self.assertFalse(any(s.get('group') == 'new-poison' for s in hero['states']))

    def test_element_buff_applies_to_channel_damage_and_respects_cap(self):
        hero = player(states=[])
        target = {'stats': {'fire_resist': 0}}
        hero['states'] = [{'code': 'modifier', 'group': 'elixir:ember', 'stat': 'fire_power', 'value': .25, 'expires': 6}]
        self.assertEqual(element_multiplier(hero, target, 'fire'), 1.25)
        hero['states'][0]['value'] = .8
        self.assertEqual(element_multiplier(hero, target, 'fire'), 1.4)

    def test_duration_effects_carry_expected_state(self):
        hero = player(hp=50)
        entry = carried('aegis', stars=2, trigger={'kind': 'hp_below', 'value': .6})
        state = {'elixir_cooldown': 0, 'encounter': 1}
        use(hero, {'rank': 'normal'}, [entry], state, 4)
        shield = next(s for s in hero['states'] if s['code'] == 'shield')
        self.assertEqual(shield['remaining'], int(100 * .28 * 1.15))
        self.assertEqual(shield['expires'], 4 + 5)
