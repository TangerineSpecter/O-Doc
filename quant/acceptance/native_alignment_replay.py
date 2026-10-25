"""Replay captured native alignment reviews without provider or source execution."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from unittest.mock import patch

PREFIX='2026-10-26-native-alignment-'


def replay(directory):
    from quant.research.contracts import digest
    from quant.sync import metadata,validate
    from quant.models import Job,NativePythonJob
    from utils.sync_manager import SyncManager
    root=Path(directory);manifest=json.loads((root/(PREFIX+'manifest.json')).read_text())
    def read(name):
        if Path(name).name!=name or not name.startswith(PREFIX):raise ValueError('Unsafe capture path')
        return json.loads((root/name).read_text())
    for name,expected in manifest['artifact_hashes'].items():
        read(name) if name.endswith('.json') else None
        if Path(name).name!=name or not name.startswith(PREFIX):raise ValueError('Unsafe artifact path')
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:raise ValueError('Artifact hash mismatch')
    snapshot=read(manifest['snapshot'])
    if any(row['model'] in ('quant.job','quant.nativepythonjob','quant.experimentjob','quant.validationjob') for row in snapshot):
        raise ValueError('Snapshot contains execution authority')
    rows={}
    for row in snapshot:rows.setdefault(row['model'],{})[row['pk']]=row['fields']
    original=rows['quant.researchreport'][manifest['original_report_id']]
    if digest(original['data'])!=manifest['original_data_hash']:raise ValueError('Original report overwritten')
    calls=0;statuses=[];versions=[]
    for attempt in manifest['attempts']:
        summary=read(attempt['summary']);responses=read(attempt['responses']);stages=read(attempt['stages'])
        run_id=summary['run_id'];run=rows['quant.airun'][run_id]
        if run['status']!=summary['status'] or run['audit_report_id'] or run['requirements']:
            raise ValueError('Default request status or scope changed')
        if summary['source_calls']!=0 or len(responses)!=summary['provider_calls'] or not 1<=len(responses)<=3:
            raise ValueError('Captured execution or model budget changed')
        if len(stages)!=len(responses):raise ValueError('Model call lacks a recorded stage')
        for stage,response in zip(stages,responses):
            stored=[(key,row) for key,row in rows['quant.workflowstep'].items() if row['run']==run_id and row['stage']==stage['stage']]
            if len(stored)!=1 or digest(stored[0][1]['input'])!=stage['input_hash']:raise ValueError('Captured input differs from snapshot')
            outcome=next(row for row in rows['quant.workflowoutcome'].values() if row['step']==stored[0][0])
            if digest(outcome['data'])!=stage['outcome_hash']:raise ValueError('Captured outcome differs from snapshot')
            if stage['input']['prompt']!=response['prompt']:raise ValueError('Prompt differs from actual request')
            raw=stage['outcome']['raw']
            if raw['truncated'] or raw['text']!=response['output'] or hashlib.sha256(raw['text'].encode()).hexdigest()!=raw['sha256']:
                raise ValueError('Raw response changed')
            aligned=stage['input']['context']['native_check']['alignment']
            if (aligned['left']['first_valid']['index']!=20 or aligned['right']['first_valid']['index']!=20
                    or [row['index'] for row in aligned['compared']['missing_mismatch_examples']]!=[199]):
                raise ValueError('Fixed missing positions changed')
            versions.append(stage['input']['version'])
        published=[row for row in rows['quant.researchreport'].values() if row['run']==run_id]
        if (summary['status']=='completed')!=(len(published)==1):raise ValueError('Publication differs from status')
        if published:
            data=published[0]['data'];fixed=data['native_review_facts'];counts=fixed['comparison']['counts']
            if (data['native_review_version']!=3 or data['native_review']['verdict']!='fail' or fixed['parameters']!={'period':21}
                    or counts['value_mismatches']!=179 or counts['missing_mismatches']!=1 or data['reported_metrics']):
                raise ValueError('Published report changed fixed evidence')
        calls+=len(responses);statuses.append(summary['status'])
    with patch('quant.worker.complete',side_effect=AssertionError('offline provider')),patch('quant.native_python.runtime.run',side_effect=AssertionError('offline source')),patch('quant.native_python.runtime.probe',side_effect=AssertionError('offline Docker')):
        validate(snapshot,metadata(snapshot))
        manager=SyncManager();baseline=manager.build_snapshot_data()
        full=[row for row in baseline if not row['model'].startswith('quant.') and row['model']!='anthology.anthology']+snapshot
        manager.apply_snapshot_data(full,remote_meta=metadata(full))
    if Job.objects.exists() or NativePythonJob.objects.exists():raise ValueError('Restore revived a queue')
    return {'artifact_hashes':True,'captured_attempts':len(statuses),'captured_provider_calls':calls,'statuses':statuses,
        'input_versions':sorted(set(versions)),'original_report_preserved':True,'restorable_snapshot_contracts':True,
        'source_executions':0,'provider_calls':0,'independent_review':False,'model_quality_release':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    args=parser.parse_args();os.environ['DJANGO_SETTINGS_MODULE']='quant.test_settings'
    import django
    django.setup()
    from django.conf import settings
    if settings.DATABASES['default']['NAME']!=':memory:' or not settings.QUANT_DISABLE_WORKERS:raise RuntimeError('Isolated settings required')
    from django.core.management import call_command
    call_command('migrate',verbosity=0,interactive=False)
    print(json.dumps(replay(args.directory),ensure_ascii=False))


if __name__=='__main__':main()
