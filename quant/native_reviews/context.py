"""Versioned, reproducible observations; no model or original-source execution."""
import copy
from .policy import get_policy
from . import alignment,history


def enrich(context,version,observation=None):
    value=copy.deepcopy(context);value['native_review_policy']=get_policy(version)
    if version>=2:
        value['native_check']['alignment']=observation
        value['native_history_statistics']=history.statistics(value.get('research_memory',{}).get('library_memory'))
    return value


def for_source(context,source,version):
    observation=None
    if version>=2:
        from quant.models import NativePythonResult
        ref=source.payload['native_check']
        record=NativePythonResult.objects.select_related('request__dataset').get(pk=ref['id'],content_hash=ref['content_hash'])
        observation=alignment.summarize(record.request.plan,record.request.dataset.snapshot,record.data)
    return enrich(context,version,observation)


def from_rows(context,run,rows):
    version=run['feedback_workflow_version'];source=rows['quant.sourcerevision'][run['source']]
    observation=None
    if version>=2:
        result=rows['quant.nativepythonresult'][source['payload']['native_check']['id']]
        request=rows['quant.nativepythonrequest'][result['request']]
        observation=alignment.summarize(request['plan'],rows['quant.marketdataset'][request['dataset']]['snapshot'],result['data'])
    return enrich(context,version,observation)
