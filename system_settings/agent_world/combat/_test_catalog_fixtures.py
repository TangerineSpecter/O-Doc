"""Restore frozen catalog rows for version-compatibility tests."""
import json
from pathlib import Path


def restore_second_promotion_1_0_38(tables):
    path = Path(__file__).resolve().parent / 'testdata/second_promotion_1_0_38.json'
    fixture = json.loads(path.read_text())
    for row in tables['skill_levels']:
        if row['skill_id'] in fixture['descriptions']:
            row['description'] = fixture['descriptions'][row['skill_id']]
    for row in tables['skill_effects']:
        if row['id'] in fixture['rank3_effects']:
            row['value'] = fixture['rank3_effects'][row['id']]
