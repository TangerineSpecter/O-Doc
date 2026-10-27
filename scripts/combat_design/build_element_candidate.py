"""Export an isolated versioned bundle for validation; never alter production data."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.combat_design.element_all_candidates import candidate
from system_settings.agent_world.combat.catalog import DATA
from system_settings.agent_world.combat.catalog_validation import validate


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path, help='New, empty directory outside the production bundle')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == DATA.resolve() or DATA.resolve() in output.parents:
        parser.error('The candidate must not overwrite the production bundle')
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        parser.error('The output directory must be empty')
    catalog = candidate()
    manifest = {'version': 'combat-1.0.35', 'status': 'released', 'engine_schema': 11, 'files': {}}
    for name, rows in catalog.tables.items():
        original = DATA / f'{name}.csv'
        with original.open(newline='', encoding='utf-8') as stream:
            columns = list(csv.DictReader(stream).fieldnames or [])
        for row in rows:
            for key in row:
                if key not in columns:
                    columns.append(key)
        path = output / f'{name}.csv'
        with path.open('w', newline='', encoding='utf-8') as stream:
            writer = csv.DictWriter(stream, fieldnames=columns, lineterminator='\n')
            writer.writeheader()
            writer.writerows(rows)
        manifest['files'][path.name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'rows': len(rows)}
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    validate(output)
    print(f'Validated isolated candidate at {output}; production data unchanged')


if __name__ == '__main__':
    main()
