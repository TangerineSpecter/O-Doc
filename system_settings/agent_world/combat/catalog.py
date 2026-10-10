"""Validated immutable content; this module has no Django dependency."""
from collections import defaultdict
from decimal import Decimal
import hashlib
import json
from pathlib import Path
from .catalog_validation import validate

DATA = Path(__file__).resolve().parent / 'data'


class Catalog:
    def __init__(self, tables: dict[str, list[dict]], version: str):
        self.version = version
        self.tables = tables
        self.index = {name: {row['id']: row for row in rows} for name, rows in tables.items()}
        self.monster_dungeons={row['monster_id']:self.index['dungeons'][row['dungeon_id']] for row in tables['dungeon_monsters']}
        self.monster_dungeons.update({row['boss_id']:row for row in tables['dungeons']})
        self.rules = {row['id']: float(row['value']) for row in tables['rules']}
        self.effects = defaultdict(list)
        self.ranks = defaultdict(list)
        for row in tables['skill_effects']:
            self.effects[row['skill_level_id']].append(row)
        for row in tables['skill_levels']:
            self.ranks[row['skill_id']].append(row)

    def row(self, table: str, identity: str) -> dict:
        try:
            return self.index[table][identity]
        except KeyError as exc:
            raise ValueError(f'未知战斗配置：{identity}') from exc

    def path(self, job: str) -> list[str]:
        result = []
        while job:
            result.append(job)
            job = self.row('professions', job)['parent_id']
        return result[::-1]

    def learned(self, job: str, level: int) -> dict[str, int]:
        path = set(self.path(job))
        result = {}
        for row in self.tables['skills']:
            if row['profession_id'] in path and row['enabled'] == '1' and int(row['learn_level']) <= level:
                result[row['id']] = max(int(r['rank']) for r in self.ranks[row['id']] if int(r['required_level']) <= level)
        return result

    def skill(self, identity: str, rank: int) -> tuple[dict, list[dict]]:
        row = self.row('skill_levels', f'{identity}.r{rank}')
        return row, self.effects[row['id']]


def bundled() -> tuple[Catalog, str]:
    tables = validate(DATA)
    raw = (DATA / 'manifest.json').read_bytes()
    manifest = json.loads(raw)
    return Catalog(tables, manifest['version']), hashlib.sha256(raw).hexdigest()


def numeric(row: dict, key: str) -> float:
    return float(row.get(key) or 0)


def cash(value) -> Decimal:
    from decimal import ROUND_HALF_UP
    return Decimal(str(value)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
