"""有界 BaoStock 查询；分析用前复权日线，成交用未复权价格。"""
import math
import time
from contextvars import ContextVar
from datetime import date, datetime, timedelta
from typing import Callable
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.utils import timezone
from .investment_models import InvestmentCache

SHANGHAI = ZoneInfo('Asia/Shanghai')
QUERY_DEADLINE: ContextVar[float | None] = ContextVar('investment_query_deadline', default=None)


def local_day(now: datetime | None = None) -> date:
    now = now or timezone.now()
    return now.astimezone(SHANGHAI).date() if timezone.is_aware(now) else now.date()


def cached(key: str, loader: Callable[[], dict], seconds: int = 3600) -> dict:
    row = InvestmentCache.objects.filter(pk=key, expires_at__gt=timezone.now()).first()
    if row:
        return row.payload
    value = loader()
    InvestmentCache.objects.update_or_create(pk=key, defaults={'payload': value, 'expires_at': timezone.now() + timedelta(seconds=seconds)})
    return value


def provider(method: str, **kwargs) -> list[dict]:
    import json
    import subprocess
    import sys
    from pathlib import Path
    timeout = 60 if method in ('query_stock_basic', 'query_stock_industry') else 30
    deadline = QUERY_DEADLINE.get()
    if deadline is not None:
        timeout = min(timeout, deadline-time.monotonic())
        if timeout <= 0:
            raise ValueError('投资行情查询达到执行时限')
    try:
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('investment_baostock.py'))],
                                input=json.dumps({'method': method, 'arguments': kwargs}),
                                capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired as exc:
        raise ValueError('BaoStock 行情查询超时') from exc
    try:
        payload = json.loads(result.stdout)
    except ValueError as exc:
        raise ValueError('BaoStock 行情响应无效') from exc
    if result.returncode or payload.get('error'):
        raise ValueError(payload.get('error', 'BaoStock 查询失败'))
    return payload['rows']


def calendar():
    def load():
        today = local_day()
        rows = provider('query_trade_dates', start_date=(today-timedelta(days=730)).isoformat(),
                        end_date=(today+timedelta(days=365)).isoformat())
        days = sorted(r['calendar_date'] for r in rows if r['is_trading_day']=='1')
        if not days:
            raise ValueError('交易日历为空')
        return {'days': days}
    return cached('investment-bao-calendar:v1', load, 86400)['days']


def reference_day(day: date) -> date:
    days = calendar()
    # Refuse to silently use a years-old calendar after its coverage ends.
    if day.isoformat() > days[-1]:
        raise ValueError('交易日历尚未覆盖执行日期')
    now = timezone.now()
    local = now.astimezone(SHANGHAI) if timezone.is_aware(now) else now
    cutoff = day - timedelta(days=1) if local.date() == day and local.hour < 15 else day
    closed = [d for d in days if d <= cutoff.isoformat()]
    if not closed:
        raise ValueError('没有可用的最近交易日')
    candidate = closed[-1]
    key = f'investment-bao-reference:v1:{candidate}'
    cached_day = InvestmentCache.objects.filter(pk=key, expires_at__gt=now).first()
    if cached_day:
        return date.fromisoformat(cached_day.payload['date'])
    # An index avoids depending on a particular stock's suspension or the stock directory.
    # A closed session is usable only after BaoStock actually publishes its daily bar.
    rows = provider('query_history_k_data_plus', code='sh.000001', fields='date,close,tradestatus',
                    start_date=(date.fromisoformat(candidate)-timedelta(days=30)).isoformat(),
                    end_date=candidate, frequency='d', adjustflag='3')
    published = []
    closed_dates = set(closed)
    for row in rows:
        if row.get('date') not in closed_dates or row.get('tradestatus') != '1':
            continue
        try:
            price = Decimal(row.get('close', ''))
        except ArithmeticError:
            continue
        if price.is_finite() and price > 0:
            published.append(row['date'])
    if not published:
        raise ValueError('无法确认最近已发布的完整收盘数据')
    latest = max(published)
    # Missing today's bar is temporary; never keep yesterday's answer for six hours.
    seconds = 21600 if latest == candidate else 60
    InvestmentCache.objects.update_or_create(pk=key, defaults={
        'payload': {'date': latest}, 'expires_at': now + timedelta(seconds=seconds),
    })
    return date.fromisoformat(latest)


def next_trade_day(day: date) -> str:
    following = [d for d in calendar() if d > day.isoformat()]
    if not following:
        raise ValueError('交易日历尚未覆盖下一交易日')
    return following[0]


def stock_directory():
    def load():
        try:
            rows = provider('query_all_stock', day=reference_day(local_day()).isoformat())
        except ValueError:
            rows = provider('query_stock_basic')
        if not rows:
            raise ValueError('BaoStock 股票目录为空')
        return {'items': [{'code': r['code'].split('.')[-1], 'provider_code': r['code'], 'name': r['code_name']}
                          for r in rows if r.get('type','1')=='1' and r.get('status','1')=='1' and r['code'].startswith(('sh.6', 'sz.0', 'sz.3'))]}
    return cached('investment-bao-stocks:' + local_day().isoformat(), load, 86400)['items']


def stock(code):
    if not isinstance(code, str) or len(code) != 6 or not code.isdigit():
        raise ValueError('股票代码须为6位数字')
    found = next((s for s in stock_directory() if s['code'] == code), None)
    if not found:
        raise ValueError('股票不在有效A股目录中')
    return found


def industry_directory():
    def load():
        return {'items':provider('query_stock_industry')}
    return cached('investment-bao-industries:'+local_day().isoformat(), load, 86400)['items']


def boards(kind='industry'):
    if kind != 'industry':
        raise ValueError('BaoStock 不提供热点概念板块，请按行业或公司名称查询')
    names = sorted({r['industry'] for r in industry_directory() if r.get('industry')})
    return [{'code': n, 'name': n} for n in names]


def members(kind, code):
    if not any(b['code']==code for b in boards(kind)):
        raise ValueError('行业不在真实目录中')
    listed = {s['provider_code']:s for s in stock_directory()}
    return [listed[r['code']] for r in industry_directory() if r.get('industry')==code and r['code'] in listed]


def history(code: str, until: date, adjust: str = '') -> list[dict]:
    stock(code)
    def load():
        security = stock(code)
        raw = provider('query_history_k_data_plus', code=security['provider_code'], fields='date,close,volume,tradestatus',
                       start_date=(until-timedelta(days=420)).isoformat(), end_date=until.isoformat(), frequency='d',
                       adjustflag='2' if adjust=='qfq' else '3')
        rows = [{'date':r['date'],'close':r['close'],'volume':r['volume'], 'trade_status':r['tradestatus']}
                for r in raw if r.get('close') and r.get('tradestatus')=='1']
        rows = sorted((r for r in rows if r['date'] <= until.isoformat()), key=lambda r: r['date'])[-200:]
        if not rows:
            raise ValueError('没有可用日线')
        if rows[-1]['date'] != until.isoformat():
            raise ValueError('参考日完整日线尚未发布或股票停牌')
        return {'rows': rows}
    key = f'investment-bao-history:v1:{code}:{until}:{adjust or "raw"}'
    rows = cached(key, load, 21600)['rows']
    if rows[-1]['date'] != until.isoformat():
        InvestmentCache.objects.filter(pk=key).delete()
        rows = cached(key, load, 21600)['rows']
    return rows


def quote(code: str, day: date) -> dict:
    row = history(code, day)[-1]
    price = Decimal(row['close']).quantize(Decimal('.01'))
    if row['date'] != day.isoformat() or not price.is_finite() or price <= 0 or Decimal(row['volume']) <= 0:
        raise ValueError('参考日缺少有效行情或股票停牌，拒绝成交')
    return {'code': code, 'name': stock(code)['name'], 'price': str(price), 'date': row['date'], 'source': 'BaoStock/未复权日线'}


def indicators(rows: list[dict]) -> dict:
    if len(rows) < 60:
        raise ValueError('日线不足60个交易日，无法完整计算指标')
    import pandas as pd
    prices = pd.Series([float(r['close']) for r in rows], dtype=float)
    if not all(math.isfinite(p) and p > 0 for p in prices):
        raise ValueError('分析日线包含无效价格')
    dif = prices.ewm(span=12, adjust=False).mean() - prices.ewm(span=26, adjust=False).mean()
    dea = dif.ewm(span=9, adjust=False).mean()
    delta = prices.diff().dropna()
    gains, losses = delta.clip(lower=0).tolist(), (-delta.clip(upper=0)).tolist()
    gain, loss = sum(gains[:14])/14, sum(losses[:14])/14
    for g, l in zip(gains[14:], losses[14:]):
        gain, loss = (gain*13+g)/14, (loss*13+l)/14
    rsi = 50 if gain == loss == 0 else 100 if loss == 0 else 100-100/(1+gain/loss)
    return {'macd': {'dif': round(float(dif.iloc[-1]), 6), 'dea': round(float(dea.iloc[-1]), 6),
                     'histogram': round(float(2*(dif.iloc[-1]-dea.iloc[-1])), 6),
                     'cross': 'golden' if dif.iloc[-2] <= dea.iloc[-2] and dif.iloc[-1] > dea.iloc[-1] else
                              'death' if dif.iloc[-2] >= dea.iloc[-2] and dif.iloc[-1] < dea.iloc[-1] else 'none'},
            'rsi14': round(rsi, 4), 'ma': {str(n): round(float(prices.tail(n).mean()), 6) for n in (5,20,60)},
            'change5': round(float((prices.iloc[-1]/prices.iloc[-6]-1)*100), 4), 'sample_count': len(rows)}


def analyze(code: str, day: date) -> dict:
    def load():
        q = quote(code, day)
        rows = history(code, day, 'qfq')
        if rows[-1]['date'] != day.isoformat():
            raise ValueError('分析行情未覆盖参考日')
        return {'quote': q, 'as_of': day.isoformat(), 'analysis_adjust': 'qfq', 'indicators': indicators(rows)}
    return cached(f'investment-bao-indicators:v1:{code}:{day}:12-26-9:14:5-20-60', load, 21600)
