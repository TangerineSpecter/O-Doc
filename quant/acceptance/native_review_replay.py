"""Replay captured report reviews without source, Docker or provider requests."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from unittest.mock import patch

PREFIX='2026-10-26-native-review-'


def replay(directory):
    from quant.sync import metadata,validate
    from quant.research.contracts import digest
    from quant.models import Job,NativePythonJob
    from utils.sync_manager import SyncManager
    root=Path(directory);manifest=json.loads((root/(PREFIX+'manifest.json')).read_text())
    for name,expected in manifest['artifact_hashes'].items():
        if Path(name).name!=name or not name.startswith(PREFIX):raise ValueError('Unsafe artifact path')
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:raise ValueError('Artifact hash mismatch')
    original=json.loads((root/(PREFIX+'original-report.json')).read_text())
    calls=0;last=None;statuses=[];captured=[];raw_only=[]
    for attempt in manifest['attempts']:
        summary=json.loads((root/attempt['summary']).read_text())
        responses=json.loads((root/attempt['responses']).read_text())
        stages=json.loads((root/attempt['stages']).read_text())
        if len(responses)!=summary['provider_calls'] or len(responses)>3:raise ValueError('Captured call budget mismatch')
        if summary['source_calls']!=0:raise ValueError('Review reran original source')
        if stages[0]['outcome']['output']['analysis']!=original:raise ValueError('Seeded original report changed')
        model_stages=[row for row in stages if row['input']['model']]
        if len(model_stages)!=len(responses):raise ValueError('Model response lacks a recorded step')
        for stage,response in zip(model_stages,responses):
            if stage['input'].get('prompt') is not None and stage['input']['prompt']!=response['prompt']:
                raise ValueError('Captured prompt differs from stored request')
            raw=stage['outcome']['raw']
            if raw['truncated'] or raw['text']!=response.get('output'):raise ValueError('Captured response differs from outcome')
            if hashlib.sha256(raw['text'].encode()).hexdigest()!=raw['sha256']:raise ValueError('Raw response hash mismatch')
        calls+=len(responses);statuses.append(summary['status'])
        captured.append((summary,stages))
        if attempt.get('snapshot'):
            snapshot=json.loads((root/attempt['snapshot']).read_text())
            if any(row['model'] in ('quant.job','quant.nativepythonjob','quant.experimentjob','quant.validationjob') for row in snapshot):
                raise ValueError('Captured snapshot contains execution authority')
            validate(snapshot,metadata(snapshot))
            reports=[row for row in snapshot if row['model']=='quant.researchreport' and row['pk']==summary['old_report_id']]
            if len(reports)!=1 or digest(reports[0]['fields']['data'])!=digest(original):raise ValueError('Original report overwritten')
            if summary['status']=='completed':
                current=next(row['fields'] for row in snapshot if row['model']=='quant.researchreport' and row['pk']==summary['new_report_id'])
                if current['data']['native_review_gate']['status']!='revised_audited' or current['data']['native_review']['verdict']!='fail':
                    raise ValueError('Final report lost revision gate or numeric failure')
                fixed=current['data']['native_review_facts']
                if (fixed['parameters']!={'period':21} or fixed['comparison']['counts']['value_mismatches']!=179
                        or fixed['comparison']['counts']['missing_mismatches']!=1):raise ValueError('Fixed evidence changed')
            last=snapshot
        elif summary.get('raw_capture_only'):raw_only.append(len(statuses))
        elif summary['status']=='completed':raise ValueError('A published report lacks a complete snapshot')
    if last is None:raise ValueError('No restorable snapshot captured')
    rows={}
    for row in last:rows.setdefault(row['model'],{})[row['pk']]=row['fields']
    for summary,stages in captured:
        if summary.get('raw_capture_only'):continue
        run_id=summary['run_id'];run=rows['quant.airun'][run_id]
        if run['status']!=summary['status'] or run['audit_report_id']!=summary['old_report_id']:raise ValueError('Attempt summary is not bound to its run')
        for captured_stage in stages:
            stored=[(key,row) for key,row in rows['quant.workflowstep'].items() if row['run']==run_id and row['stage']==captured_stage['stage']]
            if len(stored)!=1 or digest(stored[0][1]['input'])!=captured_stage['input_hash']:raise ValueError('Captured stage differs from snapshot')
            outcome=next(row for row in rows['quant.workflowoutcome'].values() if row['step']==stored[0][0])
            if digest(outcome['data'])!=captured_stage['outcome_hash']:raise ValueError('Captured outcome differs from snapshot')
    with patch('quant.worker.complete',side_effect=AssertionError('offline provider')),patch('quant.native_python.runtime.probe',side_effect=AssertionError('offline Docker')),patch('quant.native_python.runtime.run',side_effect=AssertionError('offline source')):
        manager=SyncManager()
        baseline=manager.build_snapshot_data()
        full=[row for row in baseline if not row['model'].startswith('quant.') and row['model']!='anthology.anthology']+last
        manager.apply_snapshot_data(full,remote_meta=metadata(full))
    if Job.objects.exists() or NativePythonJob.objects.exists():raise ValueError('Restore revived an execution queue')
    return {'artifact_hashes':True,'captured_attempts':len(statuses),'captured_provider_calls':calls,'statuses':statuses,
        'raw_only_attempts':raw_only,'original_report_preserved':True,'restorable_snapshot_contracts':True,'source_executions':0,'provider_calls':0,
        'independent_review':False,'model_quality_release':False}


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
