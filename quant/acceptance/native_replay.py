"""Offline replay of one captured original-Python discrepancy; never run source."""
import argparse
from decimal import Decimal,localcontext
import hashlib
import json
import os
from pathlib import Path

PREFIX='2026-10-25-native-python-'
SOURCE_SHA='d747c01d535430877b7d024e77671b59f3d07dd29ab65e8d9db3f1c65dcedee8'


def replay(directory):
    from quant.sync import metadata,validate
    from quant.feedback.contracts import validate_analysis
    root=Path(directory);manifest=json.loads((root/(PREFIX+'manifest.json')).read_text())
    for name,expected in manifest['artifact_hashes'].items():
        if Path(name).name!=name or not name.startswith(PREFIX):raise ValueError('Unsafe artifact path')
        if hashlib.sha256((root/name).read_bytes()).hexdigest()!=expected:raise ValueError('Artifact hash mismatch')
    snapshot=json.loads((root/(PREFIX+'snapshot.json')).read_text());rows={}
    for row in snapshot:rows.setdefault(row['model'],{})[row['pk']]=row['fields']
    if any(label in rows for label in ('quant.job','quant.nativepythonjob','quant.experimentjob','quant.validationjob')):
        raise ValueError('Artifacts contain execution authority')
    summary=json.loads((root/(PREFIX+'summary.json')).read_text())
    request=rows['quant.nativepythonrequest'][summary['native_request_id']];plan=request['plan']
    result=rows['quant.nativepythonresult'][summary['native_result_id']]['data']
    if (plan['source']['files'][0]['sha256']!=SOURCE_SHA or plan['candidate']['parameters']!={'period':21}
            or plan['dataset']['offset']!=0 or plan['dataset']['row_count']!=200):raise ValueError('Pinned fixture scope changed')
    # Fixture-specific Decimal reference for the known, hash-pinned source:
    # signal(close / rolling_mean(21) - 1) * future_return(horizon=1).
    # This is neither an evaluator nor an interpreter for arbitrary source.
    market=rows['quant.marketdataset'][request['dataset']]['snapshot']['rows'][:200]
    observed=result['native_values'];common=mismatches=missing=0
    with localcontext() as context:
        context.prec=45;prices=[Decimal(str(row['close'])) for row in market]
        for i,value in enumerate(observed):
            left=None if i<20 else prices[i]/(sum(prices[i-20:i+1])/21)-1
            expected=None if left is None or i==199 else left*(prices[i+1]/prices[i]-1)
            if expected is None:
                if value is not None:raise ValueError('Original missing output changed')
            elif value is None or abs(Decimal(str(value))-expected)>Decimal('1e-11'):
                raise ValueError('Independent original-function output differs')
            if left is not None and value is not None:
                common+=1;right=Decimal(str(value))
                mismatches+=abs(left-right)>Decimal('1e-9')+Decimal('1e-8')*max(abs(left),abs(right))
            elif (left is None)!=(value is None):missing+=1
    counts=result['comparison']['counts']
    if (common,mismatches,missing)!=(179,179,1) or any(counts[key]!=number for key,number in
            [('common_valid',common),('value_mismatches',mismatches),('missing_mismatches',missing)]):raise ValueError('Comparison counts differ')
    report=json.loads((root/(PREFIX+'report.json')).read_text());evidence=json.loads((root/(PREFIX+'review-evidence.json')).read_text())
    if validate_analysis(report,evidence)!=report or report['native_review']['actual_parameters']!={'period':21}:
        raise ValueError('AI report lost fixed evidence or actual parameters')
    validate(snapshot,metadata(snapshot))
    return {'artifact_hashes':True,'independent_decimal_original_outputs':True,'common_valid':common,'value_mismatches':mismatches,
        'missing_mismatches':missing,'report_contract':True,'snapshot_graph_and_numeric_replay':True,
        'source_executions':0,'provider_calls':0,'independent_validation':False,'model_quality_release':False}


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
