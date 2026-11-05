"""Action selection for short, resource-isolated tournament duels."""
from .combat import engine
from .combat.effects import apply
from .combat.bard_combat import cast, identity, music_row


class DuelCatalog:
    """Keep the combat catalog intact while suppressing healing in overtime."""
    def __init__(self, catalog, overtime=False):
        self.catalog, self.overtime = catalog, overtime
        self.rules, self.tables = catalog.rules, catalog.tables

    def row(self, *args):
        return self.catalog.row(*args)

    def skill(self, identity, rank):
        row, effects = self.catalog.skill(identity, rank)
        return row, [effect for effect in effects if not self.overtime or effect['code'] not in ('heal', 'hot')]


def candidates(catalog, player: dict, enemy: dict, tick: int) -> list[tuple[str, int, float, bool]]:
    style = catalog.row('styles', 'style.balanced')
    health = player['hp'] / player['stats']['hp_max']
    result = []
    for sid, rank, score in engine.available(catalog, player, enemy, tick, style):
        _, effects = catalog.skill(sid, rank)
        healing = [fx for fx in effects if fx['code'] in ('heal', 'hot')]
        useful_healing = health < .7 and any(
            fx['code'] == 'heal' or not any(s['code'] == 'hot' and s['group'] == fx['group']
                                            for s in player['states']) for fx in healing)
        other_effects = any(fx['code'] not in ('heal', 'hot') for fx in effects)
        if healing and not useful_healing and not other_effects:
            continue
        if useful_healing:
            score = max(score, 20 if health < .4 else 5)
        result.append((sid, rank, score, useful_healing))
    return result


def action(catalog, player: dict, enemy: dict, tick: int, rng) -> list[dict]:
    skills = candidates(catalog, player, enemy, tick)
    healing = [skill for skill in skills if skill[3]]
    if healing and player['hp'] / player['stats']['hp_max'] < .2:
        skills = healing
    elif not skills or rng.random() < .05:
        return engine.attack(catalog, player, enemy, tick, rng)
    sid, rank, _, _ = rng.choices(skills, weights=[skill[2] for skill in skills])[0]
    if music_row(catalog, sid, rank):
        return cast(catalog, player, enemy, {identity(player): player}, {identity(enemy): enemy}, sid, rank, tick, rng)
    row, effects = catalog.skill(sid, rank)
    player['mp'] -= engine.cost(catalog, player, sid, rank)
    player['cooldowns'][sid] = tick + int(row['cooldown_rounds'])
    return apply(catalog, player, enemy, effects, catalog.row('skills', sid)['name'], tick, rng)
