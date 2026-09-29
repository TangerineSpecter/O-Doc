"""按已发布收盘数据逐只更新持仓估值，失败有界退避；不运行模型或执行交易。"""
import logging
from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from .investment_models import InvestmentAccount, InvestmentCache
from .investment_data import local_day, reference_day, history

logger = logging.getLogger(__name__)


def tick_values():
    now=timezone.now()
    codes=sorted({code for a in InvestmentAccount.objects.all() for code in a.positions})
    if not codes:
        return
    day=reference_day(local_day(now))
    # One symbol per maintenance tick keeps world maintenance responsive.
    for code in codes:
        current = InvestmentCache.objects.filter(pk='investment-value:'+code).first()
        if current and current.payload.get('date', '') >= day.isoformat():
            continue
        key=f'investment-value-state:{code}:{day}'
        row=InvestmentCache.objects.filter(pk=key).first()
        if row and (row.payload.get('done') or row.payload.get('attempts',0)>=4 or row.expires_at>now):
            continue
        attempt=(row.payload.get('attempts',0) if row else 0)+1
        try:
            rows=history(code,day)
            last=rows[-1]
            price=Decimal(last['close'])
            if last['date']!=day.isoformat() or not price.is_finite() or price<=0:
                raise ValueError('当日日线尚未准备好')
            InvestmentCache.objects.update_or_create(pk='investment-value:'+code, defaults={'payload':{'price':last['close'],'date':last['date']},'expires_at':now+timedelta(days=30)})
            payload={'done':True,'attempts':attempt}
        except Exception:
            # Failed or incomplete history must be retried, not served from a six-hour cache.
            InvestmentCache.objects.filter(pk=f'investment-bao-history:v1:{code}:{day}:raw').delete()
            logger.warning('投资收盘估值未更新 code=%s attempt=%s',code,attempt)
            payload={'done':False,'attempts':attempt}
        InvestmentCache.objects.update_or_create(pk=key,defaults={'payload':payload,'expires_at':now+timedelta(minutes=(1,5,15,60)[attempt-1])})
        break
    InvestmentCache.objects.filter(expires_at__lt=now-timedelta(days=7)).exclude(pk__startswith='investment-value:').delete()
