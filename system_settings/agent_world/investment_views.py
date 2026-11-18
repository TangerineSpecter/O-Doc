import logging
import time

from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .investment_models import InvestmentAccount
from .investment_queries import account_overview, positions, records, page
from .farm_gate import farm_gate


logger = logging.getLogger(__name__)
SLOW_INVESTMENT_READ_MS = 1000


class InvestmentView(APIView):
    permission_classes=[IsAuthenticated]
    kind='accounts'

    def get(self,request):
        owner=get_current_user_identifier(request)
        actor=request.query_params.get('actor_id','')
        started = time.perf_counter()
        if self.kind == 'accounts':
            # A single statement already sees a consistent account directory.
            rows = InvestmentAccount.objects.filter(owner_id=owner).order_by('actor_name', 'pk').values_list(
                'pk', 'actor_name', 'positions',
            )
            accounts = [{'id': pk, 'name': name, 'position_count': len(holdings)} for pk, name, holdings in rows]
            return self.timed_response(request, accounts, started, started, time.perf_counter())

        with farm_gate():
            acquired = time.perf_counter()
            account=InvestmentAccount.objects.filter(pk=actor,owner_id=owner).first()
            if not account:return valid_result('当前账号没有该投资账户',status=404)
            try:
                if self.kind=='overview':result=account_overview(account)
                elif self.kind=='positions':result=page(positions(account),request.query_params.get('page',1))
                elif self.kind=='detail':
                    code=request.query_params.get('code','')
                    position=next((p for p in positions(account) if p['code']==code),None)
                    if not position:return valid_result('该股票不在持仓中',status=404)
                    result={'position':position,'analysis':None}
                else:result=records(owner,actor,self.kind,request.query_params.get('page',1))
            except (ValueError,TypeError):return valid_result('请求参数无效',status=400)
            queried = time.perf_counter()
        if self.kind == 'detail':
            # Only a deliberate single-position detail request computes indicators.
            # Do not hold the shared business/sync lock while querying BaoStock.
            from .investment_data import analyze, reference_day, local_day, QUERY_DEADLINE
            deadline_token = QUERY_DEADLINE.set(time.monotonic() + 120)
            try:
                result['analysis'] = analyze(code, reference_day(local_day()))
            except (ValueError, ArithmeticError):
                result['analysis_error'] = '指标暂不可用，持仓事实不受影响'
            finally:
                QUERY_DEADLINE.reset(deadline_token)
            return success_result(result)
        return self.timed_response(request, result, started, acquired, queried)

    def timed_response(self, request, data, started, acquired, queried):
        lock_ms = (acquired - started) * 1000
        query_ms = (queried - acquired) * 1000
        total_ms = (time.perf_counter() - started) * 1000
        timing = f'lock_wait;dur={lock_ms:.2f}, query;dur={query_ms:.2f}, total;dur={total_ms:.2f}'
        response = success_result(data)
        response['Server-Timing'] = timing
        if total_ms >= SLOW_INVESTMENT_READ_MS:
            logger.warning('investment read slow endpoint=%s request_id=%s stages=%s',
                           self.kind, getattr(request, 'system_log_request_id', 'unknown'), timing)
        return response
