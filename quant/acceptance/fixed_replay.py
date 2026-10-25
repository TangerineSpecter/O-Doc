"""Offline replay of the pinned February fixed-evaluation acceptance artifacts.

No provider, business database, source execution, or external service calls.
An ephemeral in-memory schema supports the product's local-conflict checks.
"""
import argparse
import csv
from datetime import datetime
import hashlib
import io
import os
from pathlib import Path
from zoneinfo import ZoneInfo

PREFIX = '2026-10-25-fixed-new-data'
ARCHIVE_SHA = 'b83aa7319ef1d4baa7b923c0fe802b88dfaf241c7456af295f1f656a24379b33'
COMBINED_SHA = 'c2344c490ba044de9e668ebb7c64d20352c1bfabc1177ceed293ce93f1f6cd90'


def replay(directory):
    from django.conf import settings
    if settings.DATABASES['default']['NAME'] != ':memory:' or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Acceptance replay requires isolated settings')
    from quant.quality.evaluation import read_json
    from quant.sync import metadata, validate
    from quant.acceptance.plan_reference import signals, ledger, check_metrics
    from quant.experiments.review_contract import validate_review
    root = Path(directory)
    snapshot = read_json(root/f'{PREFIX}-snapshot.json')
    summary = read_json(root/f'{PREFIX}-first-summary.json')
    manifest = read_json(root/f'{PREFIX}-manifest.json')
    provenance = read_json(root/f'{PREFIX}-provenance.json')
    registered = read_json(root/f'{PREFIX}-registered-plan.json')
    rows = {}
    for row in snapshot:
        rows.setdefault(row['model'], {})[str(row['pk'])] = row['fields']
    result = rows['quant.validationresult'][summary['fixed_result_id']]
    request = rows['quant.validationrequest'][result['request']]
    plan_record = rows['quant.validationplan'][request['plan']]
    plan = plan_record['data']
    dataset = rows['quant.marketdataset'][request['dataset']]
    if provenance['archive_sha256'] != ARCHIVE_SHA or hashlib.sha256(dataset['raw_csv'].encode()).hexdigest() != COMBINED_SHA:
        raise ValueError('Pinned market-data hash mismatch')
    if (root/f'{PREFIX}-archive.CHECKSUM').read_text().split()[0] != ARCHIVE_SHA:
        raise ValueError('Published archive checksum mismatch')
    if datetime.fromisoformat(provenance['downloaded_at']) <= datetime.fromisoformat(manifest['registered_at']):
        raise ValueError('Download must follow saved registration time')
    if registered['id'] != request['plan'] or registered['data'] != plan or registered['content_hash'] != plan_record['content_hash']:
        raise ValueError('Saved registration differs from the snapshot')
    def clock(value):
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=ZoneInfo(manifest['registration_timezone']))
        return parsed.replace(microsecond=parsed.microsecond//1000*1000)
    if clock(plan_record['created_at']) != clock(manifest['registered_at']) or clock(registered['created_at']) != clock(manifest['registered_at']):
        raise ValueError('Registration clock metadata mismatch')
    if provenance['combined_sha256'] != COMBINED_SHA or provenance['downloaded_at'] != manifest['downloaded_at']:
        raise ValueError('Provenance metadata mismatch')
    if request['data']['mode'] != 'fresh' or not request['data']['imported_after_registration'] or not request['data']['fresh_allowed']:
        raise ValueError('Expected registered-before-import fresh binding')
    if not request['data']['audit']['complete_scan'] or request['data']['audit']['conflict_count'] != 0:
        raise ValueError('Original binding audit mismatch')
    if plan['target']['symbol'] != 'BTCUSDT' or plan['target']['timeframe'] != '1h':
        raise ValueError('Pinned validation market/timeframe changed')
    if plan['recipe']['parameters'] != {'p0':30} or plan['required_history'] != 29 or plan['intervals'] != 695:
        raise ValueError('Fixed recipe/history/interval changed')
    source = rows['quant.experimentresult'][plan['source']['result_id']]['data']['output']
    attempt = next(row for row in source['attempts'] if row['id']==plan['source']['attempt_id'])
    if plan['recipe'] != attempt['recipe']:
        raise ValueError('Recipe differs from actual source attempt')
    bounds = request['data']['bounds']
    if bounds['calculation_start'] != 0 or bounds['start'] != 30 or bounds['end'] != 725:
        raise ValueError('Registered interval changed')
    raw = list(csv.DictReader(io.StringIO(dataset['raw_csv'])))
    if len(raw) != 726 or raw[29]['timestamp'] != plan['target']['after_timestamp']:
        raise ValueError('Warmup/cutoff rows changed')
    values = signals(plan['recipe'],raw)
    check_metrics(result['data']['output']['final'],ledger(raw,values,30,725),paths=True)
    check_metrics(result['data']['output']['baseline'],ledger(raw,values,30,725,baseline=True),paths=True)
    if result['data']['output']['independent_validation'] is not False:
        raise ValueError('Unsupported independent-validation claim')
    evidence = read_json(root/f'{PREFIX}-review-evidence.json')
    review = read_json(root/f'{PREFIX}-review.json')
    validate_review(review,evidence)
    validate(snapshot,metadata(snapshot))
    return {'pinned_data':True,'intervals':695,'decimal_complete_paths':True,
            'review_contract':True,'snapshot_graph_and_replay':True,
            'independent_validation':False,'provider_calls':0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    arguments = parser.parse_args()
    # This command is an acceptance reader, even when invoked from a production
    # shell. Force isolated settings before loading any Django application.
    os.environ['DJANGO_SETTINGS_MODULE'] = 'quant.test_settings'
    import django
    django.setup()
    from django.conf import settings
    if settings.DATABASES['default']['NAME'] != ':memory:' or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Acceptance replay requires isolated settings')
    from django.core.management import call_command
    call_command('migrate',verbosity=0,interactive=False)
    import json
    print(json.dumps(replay(arguments.directory),ensure_ascii=False))


if __name__ == '__main__':
    main()
