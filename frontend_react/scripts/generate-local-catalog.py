"""Refresh frontend demo catalogs from checked-in rules, without importing Django or using a DB.

Run from the repository: .venv/bin/python frontend_react/scripts/generate-local-catalog.py
"""
import ast
import copy
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOMAIN = ROOT / 'system_settings/agent_world'


def constants(file, names, context=None):
    namespace = {'copy': copy, 'deepcopy': copy.deepcopy, **(context or {})}
    tree = ast.parse((DOMAIN / file).read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in names for t in node.targets):
            exec(compile(ast.Module(body=[node], type_ignores=[]), file, 'exec'), namespace)
    return namespace


def camel(value):
    if isinstance(value, list):
        return [camel(item) for item in value]
    if isinstance(value, dict):
        return {key.split('_')[0] + ''.join(part.title() for part in key.split('_')[1:]): camel(item)
                for key, item in value.items()}
    return value


fertilizers = constants('farm_quality.py', {'FERTILIZERS'})['FERTILIZERS']
farm = constants('farm_catalog.py', {'DEFAULT_RULES'}, {'FERTILIZERS': fertilizers})['DEFAULT_RULES']
cooking = constants('cooking_catalog.py', {'RECIPES'})['RECIPES']
alchemy = constants('alchemy_catalog.py', {'RECIPES', 'MATERIALS', 'DUNGEONS'})
tables = {file.stem: list(csv.DictReader(file.open(encoding='utf-8-sig', newline='')))
          for file in sorted((DOMAIN / 'combat/data').glob('*.csv'))}
manifest = json.loads((DOMAIN / 'combat/data/manifest.json').read_text())
# These modules are pure rules and do not import Django models or initialize services.
sys.path.insert(0, str(ROOT))
from system_settings.agent_world.combat.catalog import Catalog
from system_settings.agent_world.combat.attributes import monster
from system_settings.agent_world.fishing.catalog import builtin as fishing_builtin


def fishing_projection():
    rules = fishing_builtin()
    result = camel(rules)
    # 这些键是业务ID而不是结构字段，须与 FishingJSONRenderer 一致。
    for field in ('spots', 'fish', 'baits'):
        result[field] = {key: camel(value) for key, value in rules[field].items()}
    return result

combat_catalog = Catalog(tables, manifest['version'])
monster_previews = [{'id': row['id'], 'level': int(row['level_min']),
                     'attributes': camel(monster(combat_catalog, row, int(row['level_min'])))}
                    for row in tables['monsters']]
result = {
    'farm': camel(farm), 'cooking': cooking,
    'alchemy': camel(alchemy['RECIPES']), 'materials': alchemy['MATERIALS'],
    'dungeons': alchemy['DUNGEONS'],
    'combat': {'version': manifest['version'], 'tables': camel(tables), 'monsterPreviews': monster_previews},
    'fishing': fishing_projection(),
}
destination = ROOT / 'frontend_react/src/mocks/agentWorld/catalog.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
