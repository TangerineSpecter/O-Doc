"""Offline Decimal and ranking replay of the captured April search diagnostic."""
import argparse
from decimal import Decimal,localcontext
import hashlib
from itertools import combinations
import json
import os
from pathlib import Path

PREFIX='2026-10-25-selection-diagnostic'


def independent_counts(means):
    counts={'reversal':0,'retained':0,'ambiguous':0};epsilon=Decimal('1e-12')
    for chosen in combinations(range(8),4):
        other=[i for i in range(8) if i not in chosen]
        inside={key:sum(values[i] for i in chosen)/4 for key,values in means.items()}
        best=max(inside.values());winners=[key for key,value in inside.items() if abs(value-best)<=epsilon]
        if len(winners)!=1:counts['ambiguous']+=1;continue
        outside={key:sum(values[i] for i in other)/4 for key,values in means.items()}
        score=outside[winners[0]]
        less=sum(value<score-epsilon for value in outside.values());equal=sum(abs(value-score)<=epsilon for value in outside.values())
        rank=(Decimal(1)+less+Decimal(equal-1)/2)/(len(means)+1)
        status='ambiguous' if abs(rank-Decimal('.5'))<=epsilon else 'reversal' if rank<Decimal('.5') else 'retained'
        counts[status]+=1
    return counts


def replay(directory):
    from django.conf import settings
    if settings.DATABASES['default']['NAME']!=':memory:' or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Replay requires isolated settings')
    from quant.quality.evaluation import read_json
    from quant.sync import metadata,validate
    from quant.acceptance.plan_reference import signals,ledger,check_metrics
    from quant.experiments.review_contract import validate_review
    root=Path(directory);manifest=read_json(root/f'{PREFIX}-manifest.json')
    for name,expected in manifest['artifact_hashes'].items():
        if Path(name).name!=name or not name.startswith(PREFIX+'-'):raise ValueError('Unsafe artifact path')
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:raise ValueError('Artifact hash mismatch')
    summary=read_json(root/f'{PREFIX}-summary.json');snapshot=read_json(root/f'{PREFIX}-snapshot.json')
    rows={}
    for row in snapshot:rows.setdefault(row['model'],{})[str(row['pk'])]=row['fields']
    if any(label in rows for label in ('quant.job','quant.experimentjob','quant.validationjob')):
        raise ValueError('Artifacts cannot contain execution authority')
    result=rows['quant.experimentresult'][summary['source_result_id']]
    request=rows['quant.experimentrequest'][summary['source_request_id']]
    measured=rows['quant.selectiondiagnostic'][summary['diagnostic_id']]['data']
    if measured!=summary['diagnostic'] or measured['final_holdout_used'] is not False or measured['independent_validation'] is not False:
        raise ValueError('Diagnostic scope changed')
    output=result['data']['output'];split=output['partitions'];family=measured['families'][0];analysis=family['analysis']
    if (family['attempted']!=16 or family['distinct_evaluated']!=16 or request['plan']['config']['max_candidates']!=16
            or analysis['used_intervals']!=568 or analysis['dropped_oldest_intervals']!=3 or analysis['block_intervals']!=71):
        raise ValueError('Pinned family or partition changed')
    market=rows['quant.marketdataset'][request['dataset']]['snapshot']
    development=market['rows'][:split['validation'][1]+1];means={}
    for item in output['attempts']:
        if item['id'] not in family['evaluated_ids']:continue
        values=signals(item['recipe'],development);series=[]
        for part in ('train','validation'):
            start,end=split[part];reference=ledger(development,values,start,end)
            check_metrics(item['metrics'][part],{key:value for key,value in reference.items() if key not in ('curve','returns')})
            series.extend(reference['returns'])
        width,drop=analysis['block_intervals'],analysis['dropped_oldest_intervals']
        with localcontext() as context:
            context.prec=45
            blocks=[sum(Decimal(str(value)) for value in series[drop+i*width:drop+(i+1)*width])/width for i in range(8)]
        if any(abs(float(value)-recorded)>2e-11 for value,recorded in zip(blocks,analysis['block_means'][item['id']])):
            raise ValueError('Independent block means differ')
        means[item['id']]=blocks
    counts=independent_counts(means)
    if counts!={'reversal':20,'retained':50,'ambiguous':0} or counts!=summary['independent_rank_counts']:
        raise ValueError('Independent rank counts differ')
    evidence=read_json(root/f'{PREFIX}-review-evidence.json');review=read_json(root/f'{PREFIX}-report.json')
    validate_review(review,evidence)
    validate(snapshot,metadata(snapshot))
    return {'artifact_hashes':True,'candidates':16,'development_intervals':571,'used_intervals':568,
        'decimal_development_metrics_and_blocks':True,'independent_rank_counts':counts,'review_contract':True,
        'snapshot_graph_and_replay':True,'final_holdout_used':False,'independent_validation':False,'provider_calls':0}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    args=parser.parse_args();os.environ['DJANGO_SETTINGS_MODULE']='quant.test_settings'
    import django
    django.setup()
    from django.conf import settings
    if settings.DATABASES['default']['NAME']!=':memory:' or not settings.QUANT_DISABLE_WORKERS:raise RuntimeError('Replay requires isolated settings')
    from django.core.management import call_command
    call_command('migrate',verbosity=0,interactive=False)
    print(json.dumps(replay(args.directory),ensure_ascii=False))


if __name__=='__main__':main()
