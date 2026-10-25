"""Recheck the captured dependency-source case without a model or database I/O."""
import argparse
import json
import os
from pathlib import Path

PREFIX='2026-10-25-source-dependencies'


def replay(directory: str | Path) -> dict:
    from django.conf import settings
    if settings.DATABASES['default']['NAME']!=':memory:' or not settings.QUANT_DISABLE_WORKERS:
        raise RuntimeError('Acceptance replay requires isolated settings')
    from quant.quality.evaluation import read_json
    from quant.research.contracts import digest
    from quant.research.supplements.sync import validate
    from quant.research.analysis import validate_analysis, validate_source_evidence, analysis_markdown
    root=Path(directory)
    snapshot=read_json(root/f'{PREFIX}-snapshot.json')
    summary=read_json(root/f'{PREFIX}-summary.json')
    sources={row['pk']:row['fields'] for row in snapshot if row['model']=='quant.sourcerevision'}
    def fail(message):
        raise ValueError(message)
    source=sources[summary['source_id']]
    validate(summary['source_id'],source,sources,fail)
    if source['payload']['parent_source_id']!=summary['parent_source_id'] or source['payload']['files'][1]['name']!='MissingVendor.mq4':
        raise ValueError('Captured dependency source identity changed')
    report=next(row['fields'] for row in snapshot if row['model']=='quant.researchreport' and row['fields']['run']==summary['run_id'])
    if report['source']!=summary['source_id'] or report['data']!=read_json(root/f'{PREFIX}-report.json'):
        raise ValueError('Report no longer targets the captured dependency submission')
    result=validate_analysis(report['data'])
    validate_source_evidence(result,source['payload'])
    markdown=analysis_markdown(result)
    if report['markdown']!=markdown or report['content_hash']!=digest({'schema_version':report['schema_version'],'data':report['data'],'markdown':markdown}):
        raise ValueError('Captured report contract or content hash changed')
    old=read_json(root/'2026-10-25-mq4-indicator-research-snapshot.json')
    reports={row['pk']:row['fields'] for row in snapshot if row['model']=='quant.researchreport'}
    for row in old:
        if row['model']=='quant.researchreport' and any(reports[row['pk']][key]!=row['fields'][key] for key in ('data','markdown','content_hash')):
            raise ValueError('Prior source report was overwritten')
    if any(row['model'] in ('quant.job','quant.experimentjob','quant.validationjob','quant.researchcampaignjob') for row in snapshot):
        raise ValueError('Business archive contains execution authority')
    return {'source_bundle_rebuilt':True,'report_contract':True,'original_reports_unchanged':True,
        'native_execution':False,'provider_calls':0,'business_database_access':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[2]/'docs/quant/验收记录'))
    arguments=parser.parse_args()
    os.environ['DJANGO_SETTINGS_MODULE']='quant.test_settings'
    import django
    django.setup()
    print(json.dumps(replay(arguments.directory),ensure_ascii=False))


if __name__=='__main__':
    main()
