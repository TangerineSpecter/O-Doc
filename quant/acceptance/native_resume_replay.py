"""Replay real continuation responses; no provider, Docker or source execution."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from unittest.mock import patch

PREFIX='2026-10-26-native-resume-'


def read(root,name):
    return json.loads((root/(PREFIX+name)).read_text())


def _restore_delta(root,base,manifest):
    from quant.sync import metadata,validate
    from utils.sync_manager import SyncManager
    for name,expected in manifest['artifacts'].items():
        if Path(name).name!=name or not name.startswith(PREFIX) or hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:
            raise ValueError('Continuation capture hash changed')
    original=json.loads((base/'2026-10-26-native-alignment-snapshot.json').read_text())
    delta=read(root,'replay-delta.json')
    allowed={'quant.airun','quant.workflowstep','quant.workflowoutcome','quant.researchreport'}
    if any(row['model'] not in allowed for row in delta):raise ValueError('Replay delta includes unrelated data or execution authority')
    baseline=SyncManager().build_snapshot_data()
    full=[row for row in baseline if not row['model'].startswith('quant.') and row['model']!='anthology.anthology']+original+delta
    validate(full,metadata(full));SyncManager().apply_snapshot_data(full,remote_meta=metadata(full))


def replay(directory,*,export=False):
    from django.contrib.auth import get_user_model
    from user.models import UserProfile
    from quant.acceptance.native_alignment_replay import replay as replay_base
    from quant.models import AIRun,Job,NativePythonJob,NativePythonResult,ResearchReport
    from quant.research.contracts import digest
    from quant.native_reviews.storage import raw_capture
    from quant.worker import execute
    from quant.sync import metadata,validate
    from utils.sync_manager import SyncManager
    from rest_framework.test import APIClient
    root=Path(directory);base=root
    replay_base(base)
    if not export:
        _restore_delta(root,base,read(root,'manifest.json'))
    captured=read(root,'review-stages.json');responses=read(root,'provider-responses.json')
    parent_id=captured[0]['input']['resume_run_id'];parent=AIRun.objects.select_related('entry__anthology').get(pk=parent_id)
    parent_hashes=[(step.pk,step.content_hash,step.outcome.content_hash) for step in parent.workflow_steps.select_related('outcome').order_by('ordinal')]
    prior_reports={row.pk:(row.content_hash,digest(row.data),row.markdown) for row in ResearchReport.objects.all()}
    if parent.status!='failed' or captured[0]['outcome']['version']!=3 or len(responses)!=2:
        raise ValueError('Captured continuation scope changed')
    actor,_=get_user_model().objects.get_or_create(username='native-resume-offline-acceptance')
    UserProfile.objects.update_or_create(user=actor,defaults={'userid':parent.entry.anthology.user_id})
    client=APIClient();client.force_authenticate(actor)
    model=next(step['input']['model'] for step in captured if step['input']['model'])
    config={**model,'model_type':'chat'};calls=[]
    def complete(config,text,**kwargs):
        index=len(calls)
        if index>=len(responses) or text!=responses[index]['prompt']:raise ValueError('Replayed prompt differs from real request')
        calls.append(index);return responses[index]['output']
    def usage(run_id,stage):return next(step['outcome']['usage'] for step in captured if step['stage']==stage)
    with patch('quant.services.model_config',return_value=config),patch('quant.worker.model_config',return_value=config),patch('quant.native_reviews.storage.model_identity',return_value=model),patch('quant.native_reviews.storage.usage',side_effect=usage),patch('quant.worker.complete',side_effect=complete),patch('quant.native_python.runtime.run',side_effect=AssertionError('offline source')),patch('quant.native_python.runtime.probe',side_effect=AssertionError('offline Docker')):
        values={'kind':'feedback_review','source_id':parent.source_id,'native_resume_run_id':parent.pk,
            'request_key':f'native_resume_captured_replay_{AIRun.objects.count():08d}'}
        response=client.post(f'/api/quant/{parent.entry.anthology_id}/entries/{parent.entry_id}/runs/',values,format='json')
        if response.status_code!=200:raise ValueError('Replay API rejected the saved parent')
        run=AIRun.objects.get(pk=response.data['data']['id']);execute(run.pk);run.refresh_from_db()
    steps=list(run.workflow_steps.select_related('outcome').order_by('ordinal'))
    if len(steps)!=3 or len(calls)!=2 or run.status!='failed' or ResearchReport.objects.filter(run=run).exists():
        raise ValueError('Final real rejection was not preserved')
    for step,original in zip(steps,captured):
        if (step.content_hash!=original['input_hash'] or digest(step.outcome.data['output'])!=digest(original['outcome']['output'])
                or step.outcome.data['raw']!=original['outcome']['raw'] or step.outcome.data['usage']!=original['outcome']['usage']):
            raise ValueError('Captured input, raw response or parsed text changed')
    parent.refresh_from_db()
    if parent.status!='failed' or parent_hashes!=[(step.pk,step.content_hash,step.outcome.content_hash) for step in parent.workflow_steps.select_related('outcome').order_by('ordinal')]:
        raise ValueError('Parent was modified')
    if not all((row.content_hash,digest(row.data),row.markdown)==prior_reports[row.pk] for row in ResearchReport.objects.filter(pk__in=prior_reports)):
        raise ValueError('Existing report was modified')
    wire={'run':client.get(f'/api/quant/{parent.entry.anthology_id}/entries/{parent.entry_id}/runs/{run.pk}/').json()['data'],
        'retained_evidence':client.get(f'/api/quant/{parent.entry.anthology_id}/entries/{parent.entry_id}/runs/{run.pk}/workflow/native_draft/').json()['data']}
    native=NativePythonResult.objects.get(pk=parent.source.payload['native_check']['id'])
    wire['native_record']=client.get(f'/api/quant/{parent.entry.anthology_id}/native-python/{native.request_id}/').json()['data']
    full=SyncManager().build_snapshot_data();validate(full,metadata(full))
    step_ids={step.pk for step in steps};delta=[row for row in full if row['model']=='quant.airun' and row['pk']==run.pk
        or row['model']=='quant.workflowstep' and row['fields']['run']==run.pk
        or row['model']=='quant.workflowoutcome' and row['fields']['step'] in step_ids]
    with patch('quant.worker.complete',side_effect=AssertionError('restore provider')),patch('quant.native_python.runtime.run',side_effect=AssertionError('restore source')):
        SyncManager().apply_snapshot_data(full,remote_meta=metadata(full))
    if Job.objects.exists() or NativePythonJob.objects.exists():raise ValueError('Restore revived execution authority')
    summary={'version':1,'application':'1.5.51','schema_version':54,'model':'deepseek-flash','parent_run_id':parent_id,
        'replay_run_id':run.pk,'status':run.status,'new_report_count':0,'captured_provider_calls':2,
        'captured_tokens':sum(step['outcome']['usage']['total_tokens'] or 0 for step in captured),'new_provider_calls':0,
        'source_executions':0,'retained_stages':1,'decisions':['revise','reject'],'parent_unchanged':True,
        'prior_reports_unchanged':True,'restore_calls':0,'restored_jobs':0,'model_quality_release':False,
        'independent_validation':False,'artifact_identity':'offline_reconstruction_new_identity_original_capture_preserved'}
    if export:
        for name,value in [('replay-delta.json',delta),('replay-wire.json',wire),('replay-summary.json',summary)]:
            (root/(PREFIX+name)).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
        names=['provider-responses.json','review-stages.json','replay-delta.json','replay-wire.json','replay-summary.json']
        manifest={'version':1,'basis_manifest':'2026-10-26-native-alignment-manifest.json','artifacts':{
            PREFIX+name:hashlib.sha256((root/(PREFIX+name)).read_bytes()).hexdigest() for name in names},
            'original_capture_export_error':'API response datetime serialization failed after both real model calls; no original run snapshot exported',
            'replay_boundary':'new task identity with identical frozen inputs, prompts, raw responses and parsed outputs; no new model calls'}
        (root/(PREFIX+'manifest.json')).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    return summary


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    parser.add_argument('--export',action='store_true',help='Export a separately labelled offline reconstruction, preserving the two real captures')
    args=parser.parse_args();os.environ['DJANGO_SETTINGS_MODULE']='quant.test_settings'
    import django
    django.setup()
    from django.conf import settings
    if settings.DATABASES['default']['NAME']!=':memory:' or not settings.QUANT_DISABLE_WORKERS:raise RuntimeError('Isolated settings required')
    from django.core.management import call_command
    call_command('migrate',verbosity=0,interactive=False)
    print(json.dumps(replay(args.directory,export=args.export),ensure_ascii=False))


if __name__=='__main__':main()
