"""Symmetric resident duels using the exploration primitives without changing them."""
import random
from copy import deepcopy
from fractions import Fraction
from .combat import engine, attributes
from .combat.effects import upkeep
from .combat.profiles import wearing
from .combat.store import current
from .tournament_rules import NORMAL_ROUNDS, OVERTIME_ROUNDS


class DuelCatalog:
    """A local view suppresses healing in overtime, including mixed-effect skills."""
    def __init__(self, catalog, overtime=False):
        self.catalog, self.overtime = catalog, overtime
        self.rules, self.tables = catalog.rules, catalog.tables

    def row(self, *args):
        return self.catalog.row(*args)

    def skill(self, identity, rank):
        row, effects = self.catalog.skill(identity, rank)
        return row, [effect for effect in effects if not self.overtime or effect['code'] not in ('heal', 'hot')]


def participant(profile, name: str) -> tuple[dict, object, dict]:
    catalog = current(profile.catalog_id)
    gear = wearing(profile, catalog)
    progress = deepcopy(profile.progression)
    stats = attributes.attributes(catalog, progress, gear)
    passives = attributes.passives(catalog, progress['skills'], gear)
    entity = engine.fighter(stats, profile.pk, progress['level'], skills=progress['skills'], passives=passives)
    evidence = {'actor_id': profile.pk, 'name': name, 'catalog_id': profile.catalog_id,
                'job': progress['job'], 'profession': catalog.row('professions', progress['job'])['name'],
                'level': progress['level'], 'stats': stats, 'skills': progress['skills'],
                'passives': passives, 'equipment': gear}
    return entity, catalog, evidence


def compare_health(entities: list[dict]) -> int | None:
    ratios = [Fraction(max(0, entity['hp']), entity['stats']['hp_max']) for entity in entities]
    return None if ratios[0] == ratios[1] else int(ratios[1] > ratios[0])


def simulate(left: tuple, right: tuple, seed: str) -> dict:
    entities = [deepcopy(left[0]), deepcopy(right[0])]
    catalogs, rng, rounds = [left[1], right[1]], random.Random(seed), []
    winner, reason = None, 'knockout'
    for tick in range(1, NORMAL_ROUNDS + OVERTIME_ROUNDS + 1):
        overtime = tick > NORMAL_ROUNDS
        events, order = [], [0, 1]
        rng.shuffle(order)
        for index in order:
            entity, enemy = entities[index], entities[1 - index]
            if entity['hp'] <= 0 or enemy['hp'] <= 0:
                break
            catalog = DuelCatalog(catalogs[index], overtime)
            # A defensive stance lasts until this resident's next action.
            entity['defending'] = False
            if overtime:
                entity['states'] = [state for state in entity['states'] if state['code'] != 'hot']
            upkeep(entity, tick, events, opponent=enemy, catalog=catalog, rng=rng)
            if entity['hp'] <= 0 or enemy['hp'] <= 0:
                break
            passive_entity = entity
            if overtime:
                passive_entity = {**entity, 'passives': [effect for effect in entity['passives']
                    if not (effect['code'] == 'passive_recovery' and effect['stat'] == 'hp_max')]}
            events.extend(engine.recover_passives(catalog, passive_entity))
            entity['mp'] = passive_entity['mp']
            if not overtime:
                entity['hp'] = passive_entity['hp']
            events.extend(engine.player_action(catalog, entity, enemy, {}, tick,
                                              catalog.row('styles', 'style.balanced'), rng))
        rounds.append({'number': tick, 'overtime': overtime, 'order': [entities[i]['name'] for i in order],
                       'events': events, 'resources': [{'actor_id': e['name'], 'hp': max(0, e['hp']), 'mp': e['mp']} for e in entities]})
        if any(entity['hp'] <= 0 for entity in entities):
            winner = compare_health(entities)
            if winner is None:
                winner, reason = rng.randrange(2), 'double_knockout_draw'
            break
        if tick == NORMAL_ROUNDS:
            winner = compare_health(entities)
            if winner is not None:
                reason = 'health_ratio'
                break
    if winner is None:
        winner, reason = compare_health(entities), 'overtime_health_ratio'
        if winner is None:
            winner, reason = rng.randrange(2), 'overtime_draw'
    return {'participants': [left[2], right[2]], 'rounds': rounds,
            'winner_id': entities[winner]['name'], 'loser_id': entities[1 - winner]['name'], 'reason': reason}
