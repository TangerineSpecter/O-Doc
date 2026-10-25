"""Conservative owner-scoped data-use audit, with explicit bounded coverage."""
import json
from quant.research.contracts import digest
from quant.models import MarketDataset,ExperimentRequest,FactorComparison,ValidationRequest

LIMIT=1000
BYTE_LIMIT=20_000_000
SCOPE='same_owner_private_quant_exact_market_or_identical_rows_v1'


def market_fact(identity,collection,created,value_hash,snapshot):
    rows=snapshot['rows']
    return {'id':str(identity),'collection_id':str(collection),'dataset_created_at':created.isoformat(timespec='milliseconds') if hasattr(created,'isoformat') else str(created),
        'dataset_hash':value_hash,'rows_hash':digest(rows),'symbol':snapshot['symbol'],'timeframe':snapshot['timeframe'],
        'start':rows[0]['timestamp'],'end':rows[-1]['timestamp']}


def record(kind,identity,value_hash,dataset_id,market,bounds=None):
    return {'key':f'{kind}:{identity}','kind':kind,'id':str(identity),'record_hash':value_hash,'dataset_id':str(dataset_id),
        **market, **({'id':str(identity)}),
        **({'start':bounds['start_timestamp'],'end':bounds['end_timestamp']} if bounds else {})}


def universe(owner_id: str,target_dataset_id: str,exclude_request_id='') -> dict:
    """No raw prices in the persisted manifest; large libraries yield unknown coverage."""
    filters={'anthology__user_id':owner_id,'anthology__type':'quant','anthology__permission':'private'}
    datasets=MarketDataset.objects.filter(**filters)
    queries={'experiment':ExperimentRequest.objects.filter(**filters),'comparison':FactorComparison.objects.filter(**filters),
        'fixed_validation':ValidationRequest.objects.filter(plan__anthology__user_id=owner_id,plan__anthology__type='quant',
            plan__anthology__permission='private').exclude(pk=exclude_request_id)}
    totals={'dataset':datasets.exclude(pk=target_dataset_id).count(),**{kind:q.count() for kind,q in queries.items()}}
    result,markets,bytes_read=[],{},0
    complete=sum(totals.values())<=LIMIT
    for item in datasets.only('id','anthology_id','created_at','content_hash','snapshot').order_by('-created_at','id').iterator(chunk_size=1):
        size=len(json.dumps(item.snapshot,ensure_ascii=False,allow_nan=False))
        if bytes_read+size>BYTE_LIMIT or len(markets)>=LIMIT:
            complete=False; break
        bytes_read+=size
        fact=market_fact(item.pk,item.anthology_id,item.created_at,item.content_hash,item.snapshot)
        markets[item.pk]=fact
        if item.pk!=target_dataset_id: result.append(record('dataset',item.pk,item.content_hash,item.pk,fact))
    for kind,query in queries.items():
        for item in query.order_by('-created_at','id')[:max(0,LIMIT-len(result))]:
            market=markets.get(item.dataset_id)
            if market is None:
                complete=False; continue
            result.append(record(kind,item.pk,item.content_hash,item.dataset_id,market,item.data['bounds'] if kind=='fixed_validation' else None))
    complete=complete and len(result)==sum(totals.values())
    return {'manifest':sorted(result,key=lambda row:row['key']),'totals':totals,'complete_scan':complete,'bytes_read':bytes_read}


def audit(snapshot: dict,bounds: dict,universe: dict) -> dict:
    target_hash=digest(snapshot['rows'])
    conflicts=[]
    for row in universe['manifest']:
        exact_market=(row['symbol'],row['timeframe'])==(snapshot['symbol'],snapshot['timeframe'])
        same_rows=row['rows_hash']==target_hash
        if (exact_market or same_rows) and max(row['start'],bounds['start_timestamp'])<=min(row['end'],bounds['end_timestamp']):
            conflicts.append({'key':row['key'],'kind':row['kind'],'id':row['id'],'dataset_id':row['dataset_id'],
                'collection_id':row['collection_id'],'start':row['start'],'end':row['end'],
                'reason':'identical_rows' if same_rows else 'overlapping_exact_market'})
    return {'version':1,'scope':SCOPE,'complete_scan':universe['complete_scan'],'totals':universe['totals'],
        'manifest':universe['manifest'],'conflict_count':len(conflicts),'conflicts':conflicts[:100],
        'omitted_conflicts':max(0,len(conflicts)-100),
        'range_status':'reused' if conflicts else 'no_tracked_conflict' if universe['complete_scan'] else 'unknown_incomplete_scan',
        'external_prior_use':'unattested','global_independent_validation':False,
        'limitations':['包括已导入行情、实验预约、对照和固定验证；失败、取消、软删研究的已知数据使用不撤销。',
            '同一所有者私密量化文集内按精确标的/周期或完整规范化行情哈希核对；别名、其他周期、外部研究和未同步设备的使用未知。',
            '预热可引用旧历史；仅核对评分区间。登记后导入不证明文件曾未被外部查看或选择，无法证明导入文件覆盖了市场所有中间柱。']}
