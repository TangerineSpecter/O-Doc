"""Restore one real timeout and its frozen window evidence, with no new calls."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from unittest.mock import patch

PREFIX = '2026-10-26-window-review-'


def replay(directory: str | Path) -> dict:
    from .temporal_parameter_replay import replay as numeric_replay
    from quant.models import AIRun, ExperimentRequest, Job, ExperimentJob, NativePythonJob, ResearchReport
    from quant.experiments.review_evidence import for_run
    from quant.worker import prompt
    from quant.research.contracts import digest
    from quant.sync import metadata, validate
    from utils.sync_manager import SyncManager
    root = Path(directory)
    # This also guards the in-memory database and disabled execution authority.
    numeric = numeric_replay(root)
    read = lambda name: json.loads((root/(PREFIX+name)).read_text())
    manifest = read('manifest.json')
    expected_names = {PREFIX+name for name in ('input.json', 'request-options.json', 'usage.json',
        'execution-summary-original.json', 'summary.json', 'delta.json')}
    expected_sources = {'2026-10-25-real-plan-loop-research-snapshot.json',
        '2026-10-26-nested-planning-plan.json', '2026-10-26-nested-planning-experiment.json'}
    if set(manifest['artifact_hashes']) != expected_names or set(manifest['source_artifact_hashes']) != expected_sources:
        raise ValueError('Unexpected window-review artifacts')
    for name, expected in (manifest['source_artifact_hashes'] | manifest['artifact_hashes']).items():
        if Path(name).name != name or hashlib.sha256((root/name).read_bytes()).hexdigest() != expected:
            raise ValueError('Window-review capture changed')
    summary, original, captured, usage = [read(name) for name in ('summary.json', 'execution-summary-original.json', 'input.json', 'usage.json')]
    if (summary['baseline_fixture'] != '2026-10-25-real-plan-loop-research-snapshot.json'
            or summary['status'] != 'failed' or summary['review_version'] != 13 or summary['provider_calls'] != 1
            or summary['new_report_count'] != 0 or summary['response_captured'] or summary['total_tokens'] is not None
            or summary['business_database_writes'] or summary['new_source_executions'] or summary['independent_validation']
            or original['total_tokens'] != 0 or len(usage) != 1 or usage[0]['status'] != 'interrupted'
            or usage[0]['total_tokens'] is not None or usage[0]['usage_complete']):
        raise ValueError('Real timeout or unknown usage was misrepresented')
    if read('request-options.json') != {'max_tokens':32000, 'deadline_seconds':120, 'allow_retries':False}:
        raise ValueError('Captured model limits changed')
    allowed = {'quant.airun', 'quant.experimentrequest', 'quant.experimentresult', 'quant.experimentcheckpoint',
        'quant.factoradmission', 'quant.factorcandidate', 'quant.factorevidencelink', 'quant.factorformulaversion',
        'quant.factorqualification', 'quant.selectiondiagnostic'}
    delta = read('delta.json')
    if any(row['model'] not in allowed for row in delta):
        raise ValueError('Captured delta includes execution authority or unrelated data')
    base = json.loads((root/summary['baseline_fixture']).read_text())
    base_ids = {(row['model'], str(row['pk'])) for row in base}
    if any((row['model'], str(row['pk'])) in base_ids for row in delta):
        raise ValueError('Captured delta overwrites an original record')
    manager = SyncManager()
    unrelated = [row for row in manager.build_snapshot_data() if not row['model'].startswith('quant.') and row['model'] != 'anthology.anthology']
    full = unrelated + base + delta
    validate(full, metadata(full))
    with patch('quant.worker.dispatch') as dispatch, patch('quant.worker.complete',side_effect=AssertionError('offline provider')), \
            patch('quant.experiments.worker.run_batch',side_effect=AssertionError('restore search')), \
            patch('quant.native_python.runtime.run',side_effect=AssertionError('offline source')):
        manager.apply_snapshot_data(full, remote_meta=metadata(full))
    dispatch.assert_not_called()
    run = AIRun.objects.get(pk=summary['review_id'])
    request = ExperimentRequest.objects.get(pk=summary['request_id'])
    if run.status != 'failed' or run.error != summary['error'] or run.result or ResearchReport.objects.filter(run=run).exists():
        raise ValueError('Timeout was promoted to a report')
    if for_run(run) != captured['evidence'] or prompt(run) != captured['prompt']:
        raise ValueError('Restored evidence or exact prompt differs from actual call')
    original_plan = json.loads((root/'2026-10-26-nested-planning-plan.json').read_text())['proposal']
    if (request.plan != captured['plan'] or request.plan['config'] != original_plan['config']
            or request.plan['seeds'] != original_plan['seeds'] or request.plan.get('proposal_id')):
        raise ValueError('Copied plan or original proposal linkage was changed')
    calculation = json.loads((root/'2026-10-26-nested-planning-experiment.json').read_text())
    if digest(request.result.data['output']) != digest(calculation['output']):
        raise ValueError('Actual controlled results changed')
    restored = {(row['model'], str(row['pk'])): row['fields'] for row in manager.build_snapshot_data()}
    for row in base:
        if row['model'] in {'quant.researchreport','quant.sourcerevision','quant.factorcandidate','quant.experimentresult','quant.experimentproposal'}:
            actual = restored[(row['model'],str(row['pk']))]
            if any(digest(actual[key]) != digest(value) for key,value in row['fields'].items()):
                raise ValueError('Original immutable record changed')
    if Job.objects.exists() or ExperimentJob.objects.exists() or NativePythonJob.objects.exists():
        raise ValueError('Restore revived execution authority')
    return {'captured_provider_calls':1,'new_provider_calls':0,'new_source_executions':0,
        'captured_status':'failed','new_report_count':0,'reported_total_tokens':None,
        'restored_planned_windows':len([key for key in captured['evidence']['evidence'] if key.startswith('temporal_window:')]),
        'numeric_segments':numeric['checked_segments'],'replay_controlled_searches':1,
        'prior_immutable_records_unchanged':True,'restored_jobs':0,'independent_validation':False,'model_quality_release':False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    args = parser.parse_args()
    os.environ['DJANGO_SETTINGS_MODULE'] = 'quant.test_settings'
    import django
    django.setup()
    from django.conf import settings
    if (settings.DATABASES['default']['ENGINE'] != 'django.db.backends.sqlite3'
            or settings.DATABASES['default']['NAME'] != ':memory:' or not settings.QUANT_DISABLE_WORKERS):
        raise RuntimeError('Isolated settings required')
    from django.core.management import call_command
    call_command('migrate',verbosity=0,interactive=False)
    print(json.dumps(replay(args.directory),ensure_ascii=False))


if __name__ == '__main__': main()
