"""Offline replay of the captured March/April real-model research campaign.

Uses temporary in-memory tables; never calls a model or the business database.
"""
import argparse
import csv
from datetime import datetime
import hashlib
import io
import json
import os
from pathlib import Path
from zoneinfo import ZoneInfo

PREFIX = '2026-10-25-real-campaign'
DATA = {
    3: ('6e351905971ec006062d39606868e0ace467e4df9758b128840efd0359215590',
        'b0851daf609d6ab82fdf8f1d1c4fbd974bc1b4e6530a832067516ac1c2be63a6', 744),
    4: ('ee0d0efc7ca663d75f321740aaf8968de81424451c09f207b2fead0ce2c39bed',
        'e266707ad2ea3cd4680bf1ac5025f0c1bfeb38e703374a91f8dc193d1ec8d48f', 720),
}


def replay(directory: str | Path) -> dict:
    from django.conf import settings
    if settings.DATABASES['default']['NAME'] != ':memory:' or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Acceptance replay requires isolated settings')
    from quant.acceptance.plan_reference import signals, ledger, check_metrics
    from quant.experiments.review_contract import validate_review
    from quant.quality.evaluation import read_json
    from quant.sync import metadata, validate
    root = Path(directory)
    def read(suffix):
        return read_json(root/f'{PREFIX}-{suffix}.json')
    snapshot, summary, provenance = read('snapshot'), read('summary'), read('provenance')
    records = {}
    for row in snapshot:
        records.setdefault(row['model'], {})[str(row['pk'])] = row['fields']
    if any(label in records for label in ('quant.job','quant.experimentjob','quant.validationjob','quant.researchcampaignjob')):
        raise ValueError('Archived business facts must not contain execution authority')
    campaign = records['quant.researchcampaign'][summary['campaign_id']]
    plan = campaign['plan']
    if plan != read('authorized-plan') or (plan['max_rounds'],plan['max_attempts'],plan['compute_seconds'],plan['wall_seconds']) != (2,32,60,600):
        raise ValueError('Pinned campaign authorization changed')
    source = read('initial-proposal')
    if campaign['proposal'] != source['id'] or records['quant.experimentproposal'][source['id']]['data'] != source['data']:
        raise ValueError('Initial real-model proposal changed')
    created = datetime.fromisoformat(source['created_at'])
    if created.tzinfo is None:
        created = created.replace(tzinfo=ZoneInfo('Asia/Shanghai'))
    markets = {}
    if [item['month'] for item in provenance] != [3,4] or [item['dataset_id'] for item in provenance] != plan['dataset_ids']:
        raise ValueError('Preselected dataset order changed')
    for item in provenance:
        if datetime.fromisoformat(item['downloaded_at']) <= created:
            raise ValueError('Market download must follow the saved research proposal')
        normalized_sha, archive_sha, count = DATA[item['month']]
        dataset = records['quant.marketdataset'][item['dataset_id']]
        if item['normalized_sha256'] != normalized_sha or item['archive_sha256'] != archive_sha or hashlib.sha256(dataset['raw_csv'].encode()).hexdigest() != normalized_sha:
            raise ValueError('Pinned campaign market-data hash mismatch')
        if (root/f'{PREFIX}-{item["month"]:02d}-archive.CHECKSUM').read_text().split()[0] != archive_sha:
            raise ValueError('Published archive checksum mismatch')
        raw = list(csv.DictReader(io.StringIO(dataset['raw_csv'])))
        if len(raw) != count or len(dataset['snapshot']['rows']) != count:
            raise ValueError('Pinned market length changed')
        markets[item['dataset_id']] = raw
    rounds = sorted((row for row in records['quant.researchround'].values() if row['campaign']==summary['campaign_id']),key=lambda row:row['ordinal'])
    reserved = compute = evaluated = 0
    previous_proposal = campaign['proposal']
    for step in rounds:
        ordinal = step['ordinal']
        request = records['quant.experimentrequest'][step['experiment']]
        data = request['plan']
        if data.get('proposal_id') != previous_proposal or data['proposal_adapted'] or request['dataset'] != plan['dataset_ids'][ordinal-1]:
            raise ValueError('Automatic next-proposal lineage changed')
        if any(data['config'][key] != value for key,value in {'threshold':0,'fee_bps':5,'slippage_bps':5,'gap':2}.items()):
            raise ValueError('Reference execution assumptions changed')
        reserved += data['config']['max_candidates']; compute += data['config']['seconds']
        result = next(row for row in records['quant.experimentresult'].values() if row['request']==step['experiment'])['data']
        if result['status'] != 'completed' or result['overlap_audit']['independent_holdout_proven'] is not False:
            raise ValueError('Campaign result status or independence claim changed')
        output, raw = result['output'], markets[request['dataset']]
        for attempt in output['attempts']:
            if attempt['status'] != 'evaluated':
                continue
            values = signals(attempt['recipe'],raw); evaluated += 1
            for part in ('train','validation'):
                check_metrics(attempt['metrics'][part],ledger(raw,values,*output['partitions'][part]))
        selected = next(row for row in output['attempts'] if row['id']==output['selected_id'])
        values = signals(selected['recipe'],raw)
        check_metrics(output['holdout'],ledger(raw,values,*output['partitions']['holdout']),paths=True)
        check_metrics(output['buy_hold_baseline'],ledger(raw,values,*output['partitions']['holdout'],baseline=True),paths=True)
        review_summary = next(row for row in summary['rounds'] if row['ordinal']==ordinal)
        run = records['quant.airun'][review_summary['review_id']]
        report = next(row for row in records['quant.researchreport'].values() if row['run']==review_summary['review_id'])
        if run['status'] != 'completed' or report['data'] != read(f'round-{ordinal}-review'):
            raise ValueError('Saved review differs from the published report')
        context = json.loads(run['requirements'].split('连续研究约束：',1)[1])
        if context != read(f'round-{ordinal}-review-constraints') or context['remaining_rounds'] != 2-ordinal or context['remaining_candidate_budget'] != 32-reserved or context['remaining_compute_seconds'] != 60-compute:
            raise ValueError('Frozen remaining-budget context changed')
        allowed = {'id','symbol','timeframe','timezone','price_adjustment','row_count','start','end'}
        if [row['id'] for row in context['ordered_datasets']] != plan['dataset_ids'][ordinal:] or any(set(row) != allowed for row in context['ordered_datasets']):
            raise ValueError('Future market metadata boundary changed')
        validate_review(report['data'],read(f'round-{ordinal}-review-evidence'))
        previous_proposal = review_summary['next_proposal_id']
    if reserved > 32 or compute > 60 or len(rounds) != 2 or summary['reason'] != 'round_budget' or summary['actual_provider_calls'] != 2:
        raise ValueError('Expected bounded two-round completion')
    old = read_json(root/'2026-10-25-fixed-new-data-snapshot.json')
    for row in old:
        if row['model'] in ('quant.experimentresult','quant.researchreport','quant.validationresult','quant.experimentproposal') and records[row['model']].get(str(row['pk'])) != row['fields']:
            raise ValueError('Prior research facts changed during the campaign')
    validate(snapshot,metadata(snapshot))
    return {'rounds':len(rounds),'evaluated_attempts':evaluated,'pinned_data':True,
        'decimal_development_and_complete_holdout_paths':True,'review_contracts':True,
        'automatic_proposal_lineage':True,'frozen_budget_context':True,
        'snapshot_graph_and_replay':True,'provider_calls':0,'independent_validation':False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    arguments = parser.parse_args()
    os.environ['DJANGO_SETTINGS_MODULE'] = 'quant.test_settings'
    import django
    django.setup()
    from django.core.management import call_command
    call_command('migrate',verbosity=0,interactive=False)
    print(json.dumps(replay(arguments.directory),ensure_ascii=False))


if __name__ == '__main__':
    main()
