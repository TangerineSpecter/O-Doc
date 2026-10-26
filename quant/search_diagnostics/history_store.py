"""Read only bounded trial metadata; no full plans, attempt bodies or market prices."""
from django.db.models import F
from django.utils import timezone
from quant.models import ExperimentRequest, ExperimentCheckpoint, ExperimentResult
from quant.research_memory.contract import instant
from .history import REQUEST_LIMIT, build, request_fact


def freeze(result) -> dict:
    current = result.request
    market = {key: current.dataset.snapshot[key] for key in ('symbol', 'timeframe')}
    observed = timezone.now()
    cutoff = instant(observed.isoformat()).isoformat(timespec='milliseconds')
    query = ExperimentRequest.objects.filter(created_at__lte=observed, anthology__user_id=current.anthology.user_id,
        anthology__type='quant', anthology__permission='private',
        dataset__snapshot__symbol=market['symbol'], dataset__snapshot__timeframe=market['timeframe'])
    # Reserve the current request before taking the newest bounded peers.
    eligible = query.count()
    chosen = list(query.exclude(pk=current.pk).order_by('-created_at','id').values_list('id',flat=True)[:REQUEST_LIMIT-1]) + [current.pk]
    facts = query.filter(pk__in=chosen).annotate(candidate_budget=F('plan__config__max_candidates')).values(
        'id','anthology_id','dataset_id','content_hash','created_at','candidate_budget','dataset__content_hash')
    checkpoints = {}
    for row in ExperimentCheckpoint.objects.filter(request_id__in=chosen,created_at__lte=observed).annotate(state=F('attempt__status')).values(
            'id','request_id','ordinal','content_hash','state'):
        checkpoints.setdefault(row['request_id'],[]).append({'id':row['id'],'ordinal':row['ordinal'],
            'content_hash':row['content_hash'],'status':row['state']})
    outcomes = {row['request_id']:{'id':row['id'],'content_hash':row['content_hash'],'status':row['state']}
        for row in ExperimentResult.objects.filter(request_id__in=chosen,created_at__lte=observed).annotate(state=F('data__status')).values(
            'id','request_id','content_hash','state')}
    records = [request_fact({'id':row['id'],'anthology':row['anthology_id'],'dataset':row['dataset_id'],
        'content_hash':row['content_hash'],'created_at':instant(row['created_at'].isoformat()).isoformat(timespec='milliseconds'),
        'candidate_budget':row['candidate_budget']}, {'content_hash':row['dataset__content_hash']},
        checkpoints.get(row['id'],[]),outcomes.get(row['id'])) for row in facts]
    return build(market,current.pk,cutoff,eligible,records)


def validate(value: dict, request: dict, dataset: dict, created_at: str, rows: dict, anthologies: dict, fail) -> None:
    """Rebuild the captured facts; later outcomes/checkpoints never rewrite a prior ledger."""
    from quant.research.contracts import digest
    from .history import SCOPE, MAX_CHARS, STATUSES
    if (not isinstance(value,dict) or value.get('version') != 1 or type(value.get('version')) is not int
            or value.get('scope') != SCOPE or value.get('scan_limit') != REQUEST_LIMIT or type(value.get('scan_limit')) is not int
            or value.get('max_chars') != MAX_CHARS or type(value.get('max_chars')) is not int
            or not isinstance(value.get('manifest'),list) or len(value['manifest'])>REQUEST_LIMIT
            or type(value.get('eligible_requests')) is not int or value['eligible_requests']<len(value['manifest'])
            or type(value.get('complete_scan')) is not bool or instant(value['observed_at'])>instant(created_at)):
        fail('跨请求搜索记账版本、范围或时点无效')
    market={key:dataset['snapshot'][key] for key in ('symbol','timeframe')}
    owner=anthologies[request['anthology']]['user_id']
    # A later sync may add genuinely older facts that this device had not seen.
    # Rebuild the frozen manifest only; created_at is not a distributed visibility watermark.
    rebuilt=[]; seen=set()
    for item in value['manifest']:
        if not isinstance(item,dict) or not isinstance(item.get('request_id'),str) or item['request_id'] in seen:
            fail('跨请求搜索记账引用重复或无效')
        identity=item['request_id'];seen.add(identity)
        raw=rows.get('quant.experimentrequest',{}).get(identity,{})
        collection=anthologies.get(raw.get('anthology'),{})
        data=rows.get('quant.marketdataset',{}).get(raw.get('dataset'),{})
        if (not raw or not data or collection.get('user_id')!=owner or collection.get('type')!='quant'
                or collection.get('permission')!='private' or any(data['snapshot'][key]!=market[key] for key in market)
                or instant(raw['created_at'])>instant(value['observed_at'])):
            fail('跨请求搜索记账引用越权、跨市场或来自未来')
        points=[]
        if not isinstance(item.get('checkpoints'),list) or len(item['checkpoints'])>32:
            fail('跨请求尝试清单无效')
        for point in item['checkpoints']:
            saved=rows.get('quant.experimentcheckpoint',{}).get(point.get('id') if isinstance(point,dict) else None,{})
            if not saved or saved.get('request')!=identity or instant(saved['created_at'])>instant(value['observed_at']):
                fail('跨请求尝试缺失、跨请求或来自未来')
            points.append({'id':point['id'],'ordinal':saved['ordinal'],'content_hash':saved['content_hash'],'status':saved['attempt']['status']})
        if len({row['id'] for row in points})!=len(points) or any(row['status'] not in STATUSES for row in points):
            fail('跨请求尝试重复或状态无效')
        outcome=item.get('outcome')
        if outcome is not None:
            saved=rows.get('quant.experimentresult',{}).get(outcome.get('id') if isinstance(outcome,dict) else None,{})
            if not saved or saved.get('request')!=identity or instant(saved['created_at'])>instant(value['observed_at']):
                fail('跨请求成果缺失、跨请求或来自未来')
            outcome={'id':outcome['id'],'content_hash':saved['content_hash'],'status':saved['data']['status']}
        projected=request_fact({'id':identity,**raw,'created_at':instant(raw['created_at']).isoformat(timespec='milliseconds'),
            'candidate_budget':raw['plan']['config']['max_candidates']},data,points,outcome)
        # Normalize source timestamps as UTC so millisecond snapshot encoding is stable.
        projected['created_at']=item['created_at']
        if instant(item['created_at'])!=instant(raw['created_at']) or digest(projected)!=digest(item):
            fail('跨请求搜索记账与冻结事实不一致')
        rebuilt.append(projected)
    if request['id'] not in seen:
        fail('跨请求搜索记账缺少当前请求')
    expected=build(market,request['id'],value['observed_at'],value['eligible_requests'],rebuilt)
    if digest(expected)!=digest(value):fail('跨请求搜索次数、范围或覆盖状态无法重建')
