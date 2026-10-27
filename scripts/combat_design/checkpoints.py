"""Recover completed simulation groups only when their inputs are identical."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def source_hash():
    digest = hashlib.sha256()
    paths = list((ROOT / 'system_settings/agent_world/combat').glob('*.py'))
    paths += list((ROOT / 'system_settings/agent_world/combat/data').glob('*.csv'))
    paths += [ROOT / 'system_settings/agent_world/combat/data/manifest.json']
    paths += list((ROOT / 'scripts/combat_design').glob('*.py'))
    for path in sorted(paths):
        digest.update(str(path.relative_to(ROOT)).encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


class Checkpoint:
    def __init__(self, path, options, resume=False):
        self.path = Path(path) if path else None
        self.rows = []
        if not self.path:
            if resume:
                raise ValueError('Resume requires --checkpoint')
            return
        meta_path = self.path.with_name(self.path.name + '.meta.json')
        metadata = {'options': options, 'source_sha256': source_hash()}
        if resume:
            if not self.path.exists() or not meta_path.exists():
                raise ValueError('Checkpoint or metadata missing; cannot resume safely')
            if json.loads(meta_path.read_text(encoding='utf-8')) != metadata:
                raise ValueError('Simulation inputs changed; use a new checkpoint')
            self.rows = [json.loads(line) for line in self.path.read_text(encoding='utf-8').splitlines() if line]
        else:
            if self.path.exists() or meta_path.exists():
                raise ValueError('Checkpoint exists; use --resume or a new path')
            self.path.write_text('', encoding='utf-8')
            meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    def add(self, row):
        self.rows.append(row)
        if self.path:
            with self.path.open('a', encoding='utf-8') as stream:
                stream.write(json.dumps(row, ensure_ascii=False) + '\n')

