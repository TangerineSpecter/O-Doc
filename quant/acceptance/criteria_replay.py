"""Replay the captured May registered-rule result without provider or network calls."""
import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path

PREFIX='2026-10-25-registered-criteria'
ARCHIVE_SHA='077c71eec71a8ecf2edb6e3a3927b600b8f358fd37066ce120c19fb5302a9ab8'


def replay(directory):
    from django.conf import settings
    if settings.DATABASES['default']['NAME']!=':memory:' or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Replay requires isolated settings')
    from quant.quality.evaluation import read_json
    from quant.sync import metadata,validate
    from quant.acceptance.plan_reference import signals,ledger,check_metrics
    from quant.validation_studies.criteria import assess
    from quant.validation_studies.evidence import project
    from quant.experiments.review_contract import validate_review
    root=Path(directory)
    manifest=read_json(root/f'{PREFIX}-manifest.json')
    for name,expected in manifest['artifact_hashes'].items():
        if Path(name).name!=name or not name.startswith(PREFIX+'-'):
            raise ValueError('Unsafe artifact name')
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:
            raise ValueError('Acceptance artifact hash mismatch')
    summary=read_json(root/f'{PREFIX}-summary.json')
    snapshot=read_json(root/f'{PREFIX}-snapshot.json')
    registered=read_json(root/f'{PREFIX}-registered-before-download.json')
    if summary['archive_sha256']!=ARCHIVE_SHA or not summary['official_checksum_match']:
        raise ValueError('Pinned archive checksum changed')
    if datetime.fromisoformat(summary['registered_at_utc'])>=datetime.fromisoformat(summary['download_started_utc']):
        raise ValueError('Data download preceded registration')
    rows={}
    for row in snapshot:
        rows.setdefault(row['model'],{})[str(row['pk'])]=row['fields']
    if any(label in rows for label in ('quant.job','quant.experimentjob','quant.validationjob')):
        raise ValueError('Replay artifact must not contain execution jobs')
    for row in registered:
        if row['model'] in ('quant.validationplan','quant.validationresult','quant.experimentresult','quant.researchreport'):
            if rows[row['model']][str(row['pk'])]!=row['fields']:
                raise ValueError('Previously frozen facts changed')
    result=rows['quant.validationresult'][summary['result_id']]['data']
    request=rows['quant.validationrequest'][summary['request_id']]['data']
    plan=rows['quant.validationplan'][summary['plan_id']]['data']
    dataset=rows['quant.marketdataset'][summary['dataset_id']]
    if (plan['version']!=2 or result['version']!=2 or plan['recipe']['parameters']!={'p0':14,'p1':60}
            or plan['required_history']!=59 or plan['intervals']!=743
            or dataset['content_hash']!=summary['dataset_hash'] or len(dataset['snapshot']['rows'])!=804
            or request['bounds']['start']!=60 or request['bounds']['end']!=803):
        raise ValueError('Pinned recipe or fixed evaluation interval changed')
    values=signals(plan['recipe'],dataset['snapshot']['rows'])
    for key,baseline in (('final',False),('baseline',True)):
        check_metrics(result['output'][key],ledger(dataset['snapshot']['rows'],values,60,803,baseline=baseline),paths=True)
    assessment=assess(plan['criteria'],result['status'],result['output'],request,result['publication_audit'])
    if result['criteria_assessment']!=assessment or assessment!=summary['assessment'] or assessment['status']!='not_met':
        raise ValueError('Recorded-rule verdict changed')
    evidence=read_json(root/f'{PREFIX}-review-evidence.json')
    if evidence['evidence']['fixed_validation']!=project(plan,request,result):
        raise ValueError('Model did not receive the frozen facts')
    review=read_json(root/f'{PREFIX}-report.json')
    validate_review(review,evidence)
    validate(snapshot,metadata(snapshot))
    return {'artifact_hashes':True,'preregistered_facts_unchanged':True,'intervals':743,
        'decimal_complete_paths':True,'criteria_status':assessment['status'],'review_contract':True,
        'snapshot_graph_and_replay':True,'independent_validation':False,'provider_calls':0}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    arguments=parser.parse_args()
    os.environ['DJANGO_SETTINGS_MODULE']='quant.test_settings'
    import django
    django.setup()
    from django.conf import settings
    if settings.DATABASES['default']['NAME']!=':memory:' or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Replay requires isolated settings')
    from django.core.management import call_command
    call_command('migrate',verbosity=0,interactive=False)
    print(json.dumps(replay(arguments.directory),ensure_ascii=False))


if __name__=='__main__':
    main()
