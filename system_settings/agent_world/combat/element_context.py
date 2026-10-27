"""Compact, catalog-derived element facts for exploration decisions."""
from .catalog import Catalog


def dungeon_elements(catalog: Catalog, dungeon_id: str) -> dict:
    dungeon = catalog.row('dungeons', dungeon_id)
    ids = [row['monster_id'] for row in catalog.tables['dungeon_monsters']
           if row['dungeon_id'] == dungeon_id and row.get('enabled') == '1']
    if dungeon.get('boss_id'):
        ids.append(dungeon['boss_id'])
    result = []
    for identity in dict.fromkeys(ids):
        monster = catalog.row('monsters', identity)
        if monster.get('enabled') != '1':
            continue
        resists = {row['element']: float(row['value']) for row in catalog.tables.get('monster_resists', [])
                   if row['monster_id'] == identity}
        result.append({'id': identity, 'name': monster['name'], 'rank': monster['rank'],
                       'element': monster.get('element') or '', 'resists': resists})
    return {'id': dungeon_id, 'name': dungeon['name'], 'monsters': result}
