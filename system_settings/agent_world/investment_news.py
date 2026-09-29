"""每天一次的持久额度认领；结果缓存与额度事实分离。"""
import hashlib
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from .investment_models import InvestmentNewsClaim, InvestmentCache
from .investment_data import local_day
from .farm_gate import guarded

QUERY = 'A股 最近一周 市场复盘 热点板块 政策 公司重大事件'


@guarded
@transaction.atomic
def claim(owner):
    day = local_day()
    key = hashlib.sha256(f'investment-news:{owner}:{day}'.encode()).hexdigest()
    row, created = InvestmentNewsClaim.objects.get_or_create(pk=key, defaults={'owner_id':owner,'day':day})
    if created:
        from .investment_sync import checkpoint
        checkpoint(owner)
    return row, created


@guarded
@transaction.atomic
def complete_claim(row, status):
    # A simultaneous snapshot must contain the claim and its matching fingerprint.
    if InvestmentNewsClaim.objects.filter(pk=row.pk).update(status=status):
        from .investment_sync import checkpoint
        checkpoint(row.owner_id)


def news(owner, config, deadline):
    row, created = claim(owner)
    cache_key = 'investment-news:'+row.pk
    if not created:
        cache = InvestmentCache.objects.filter(pk=cache_key, expires_at__gt=timezone.now()).first()
        return cache.payload if cache else {'items':[], 'status':row.status,'message':'今日搜索已使用，缓存不可用，不再次搜索'}
    try:
        from .publish_search import search
        results = search(config, QUERY, 'news', 7, deadline, search_depth='basic')
        payload = {'items':[{**r,'summary':r['summary'][:1200]} for r in results[:5]], 'status':'success'}
    except (ValueError, TimeoutError):
        payload = {'items':[], 'status':'failed', 'message':'新闻未配置或查询失败；今日不再尝试，可继续检查持仓'}
    InvestmentCache.objects.update_or_create(pk=cache_key,defaults={'payload':payload,'expires_at':timezone.now()+timedelta(days=1)})
    complete_claim(row, payload['status'])
    return payload
