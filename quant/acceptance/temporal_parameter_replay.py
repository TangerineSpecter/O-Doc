"""Verify archived all-inner parameter facts with no provider or source execution."""
import argparse
import hashlib
import json
import os
from pathlib import Path


def replay(directory: str | Path) -> dict:
    from .nested_planning_replay import replay as original_replay
    from quant.experiments.temporal_sensitivity import analyze
    root=Path(directory)
    original=original_replay(root)  # Includes the strict in-memory settings guard.
    manifest=json.loads((root/'2026-10-26-temporal-parameter-manifest.json').read_text())
    expected_sources={'2026-10-26-nested-planning-plan.json','2026-10-26-nested-planning-experiment.json'}
    if set(manifest['source_artifact_hashes'])!=expected_sources or set(manifest['artifact_hashes'])!={'2026-10-26-temporal-parameter-stability.json'}:
        raise ValueError('Unexpected parameter projection artifacts')
    for name,expected in (manifest['source_artifact_hashes']|manifest['artifact_hashes']).items():
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:raise ValueError('Parameter projection capture changed')
    plan=json.loads((root/'2026-10-26-nested-planning-plan.json').read_text())['proposal']
    calculation=json.loads((root/'2026-10-26-nested-planning-experiment.json').read_text())
    value=analyze(plan,calculation['output']['attempts'])
    if value!=json.loads((root/'2026-10-26-temporal-parameter-stability.json').read_text()):raise ValueError('Parameter projection no longer matches immutable attempts')
    if (value['status']!='no_supported_region' or value['planned_windows']!=9 or manifest['new_provider_calls']!=0
            or manifest['new_source_executions']!=0 or manifest['business_database_writes']!=0):
        raise ValueError('Capture scope changed')
    return {**original,'projection_method':value['method'],'parameter_status':value['status'],
        'planned_windows':value['planned_windows'],'projection_model_calls':0,
        'replay_controlled_searches':1,'new_full_report_published':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    args=parser.parse_args();os.environ['DJANGO_SETTINGS_MODULE']='quant.test_settings'
    import django
    django.setup()
    print(json.dumps(replay(args.directory),ensure_ascii=False))


if __name__=='__main__':main()
