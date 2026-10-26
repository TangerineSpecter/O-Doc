"""Offline replay of one captured AI plan and its non-independent market check."""
import argparse
import hashlib
import json
import os
from pathlib import Path

PREFIX='2026-10-26-nested-planning-'


def replay(directory: str | Path) -> dict:
    from django.conf import settings
    database=settings.DATABASES['default'];name=str(database['NAME'])
    # Django's test runner renames :memory: to a shared in-memory SQLite URI.
    in_memory=name==':memory:' or (name.startswith('file:memorydb_') and name.endswith('?mode=memory&cache=shared'))
    if database['ENGINE']!='django.db.backends.sqlite3' or not in_memory or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Isolated settings required')
    from quant.research.contracts import digest
    from quant.workflows.contracts import input_snapshot,combined,decode,validate_output
    from quant.workflows.prompts import prompt
    from quant.experiments.initial_planning import initial_data
    from quant.experiments.search import run_batch
    from quant.experiments.snapshot import validate_attempts,validate_output as validate_experiment
    from quant.acceptance.market_bundle import CSV_SHA
    from quant.acceptance.nested_planning_reference import verify
    root=Path(directory)
    def load(name):
        if Path(name).name!=name:raise ValueError('Unsafe artifact name')
        return json.loads((root/name).read_text())
    manifest=load(PREFIX+'manifest.json')
    for name,expected in manifest['artifact_hashes'].items():
        if not name.startswith(PREFIX) or Path(name).name!=name or hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:
            raise ValueError('Capture hash mismatch')
    bundle,response,plan,usage,summary,experiment=[load(PREFIX+name+'.json') for name in ('input','response','plan','usage','summary','experiment')]
    fixture=root/bundle['source_fixture']
    if Path(bundle['source_fixture']).name!=bundle['source_fixture'] or hashlib.sha256(fixture.read_bytes()).hexdigest()!=bundle['source_fixture_sha256']:
        raise ValueError('Prior analysis fixture changed')
    rows=json.loads(fixture.read_text());mapped={}
    for row in rows:mapped.setdefault(row['model'],{})[row['pk']]=row['fields']
    original=mapped['quant.researchreport'][bundle['prior_report_id']]
    if original['run']!=bundle['prior_run_id'] or original['source']!=bundle['source_id']:raise ValueError('Prior source scope changed')
    if mapped['quant.sourcerevision'][bundle['source_id']]['payload']!=bundle['source']:raise ValueError('Source material changed')
    stages={key:row for key,row in mapped['quant.workflowstep'].items() if row['run']==bundle['prior_run_id']}
    outcomes={row['step']:row for row in mapped['quant.workflowoutcome'].values()}
    expected_outputs={row['stage']:outcomes[key]['data']['output'] for key,row in stages.items() if row['stage'] not in ('plan','publish')}
    if bundle['outputs']!=expected_outputs or bundle['prior_outcomes']!={row['stage']:outcomes[key]['content_hash'] for key,row in stages.items() if row['stage'] not in ('plan','publish')}:
        raise ValueError('Captured prior phase facts changed')
    from quant.taxonomy.sync import resolve_rows
    collection=mapped['quant.entry'][original['entry']]['anthology']
    if bundle['vocabulary']!=resolve_rows(collection,expected_outputs['normalize']['vocabulary_ref'],mapped):raise ValueError('Frozen vocabulary changed')
    text=prompt('plan',bundle['source'],bundle['requirements'],expected_outputs,16,vocabulary=bundle['vocabulary'])
    if text!=bundle['prompt'] or response['prompt']!=text:raise ValueError('Captured plan prompt changed')
    inputs=input_snapshot('plan',bundle['source_id'],bundle['source'],bundle['requirements'],bundle['model'],expected_outputs,version=16)
    if bundle['input']!=inputs or response['input_hash']!=digest(inputs):raise ValueError('Planning input contract changed')
    validated=validate_output('plan',decode(response['output']),expected_outputs,bundle['source'],16)
    proposal=initial_data(combined(expected_outputs)|validated,bundle['prior_report_id'])
    if plan!={'validated':validated,'proposal':proposal}:raise ValueError('Provider plan normalization changed')
    if (len(usage)!=1 or summary['provider_calls']!=1 or summary['status']!='validated'
            or summary['total_tokens']!=sum(row['total_tokens'] for row in usage) or not all(row['status']=='success' and row['usage_complete'] for row in usage)
            or summary['new_full_report_published'] is not False or summary['source_executions']!=0 or summary['business_database_writes']!=0):
        raise ValueError('Captured call or publication boundary changed')
    config=proposal['config'];policy=config['walk_forward']
    minimum=max(60,2+policy['warmup_bars']+policy['train_bars']+policy['inner_folds']*policy['validation_bars']+policy['folds']*policy['test_bars']+2*(config['gap']+1))
    if summary['minimum_rows']!=minimum or minimum!=136 or summary['validation_policy']!=policy:raise ValueError('Minimum rows changed')
    dataset=mapped['quant.marketdataset'][experiment['dataset_id']]
    if hashlib.sha256(dataset['raw_csv'].encode()).hexdigest()!=CSV_SHA or experiment['dataset_hash']!=digest(dataset['snapshot']):raise ValueError('Pinned archived market data changed')
    output=run_batch(dataset['snapshot'],proposal['seeds'],config)
    if digest(output)!=digest(experiment['output']):raise ValueError('Recorded nested calculation changed')
    frozen={'engine_version':output['engine_version'],'dataset_hash':digest(dataset['snapshot']),'config':config,'seeds':proposal['seeds']}
    def fail(message):raise ValueError(message)
    validate_attempts(output['attempts'],frozen,fail)
    validate_experiment({'output':output,'status':'completed'},{'plan':frozen},dataset['snapshot'],[{'attempt':row} for row in output['attempts']],fail)
    reference=verify(output,dataset['snapshot'])
    if reference!=experiment['reference_check'] or experiment['prior_use']!='same_archived_dataset_already_used_not_independent_validation':raise ValueError('Oracle or reuse scope changed')
    return {'captured_provider_calls':1,'captured_tokens':summary['total_tokens'],'new_provider_calls':0,'source_executions':0,
        'planning_stage_only':True,'minimum_rows':minimum,'actual_parameters':proposal['seeds'][0]['parameters'],
        'attempts':len(output['attempts']),'tested_folds':output['walk_forward']['summary']['tested_folds'],
        'outer_returns':[row['holdout']['total_return'] for row in output['walk_forward']['folds']],
        'independent_validation':False,**reference}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    args=parser.parse_args();os.environ['DJANGO_SETTINGS_MODULE']='quant.test_settings'
    import django
    django.setup()
    print(json.dumps(replay(args.directory),ensure_ascii=False))


if __name__=='__main__':main()
