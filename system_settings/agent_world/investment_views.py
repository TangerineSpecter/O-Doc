from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .investment_models import InvestmentAccount, InvestmentCache
from .investment_queries import overview, positions, records, page
from .farm_gate import farm_gate


class InvestmentView(APIView):
    permission_classes=[IsAuthenticated]
    kind='accounts'

    def get(self,request):
        owner=get_current_user_identifier(request)
        actor=request.query_params.get('actor_id','')
        with farm_gate():
            if self.kind=='accounts':
                return success_result([{'id':a.pk,'name':a.actor_name} for a in InvestmentAccount.objects.filter(owner_id=owner).order_by('actor_name','pk')])
            account=InvestmentAccount.objects.filter(pk=actor,owner_id=owner).first()
            if not account:return valid_result('当前账号没有该投资账户',status=404)
            try:
                if self.kind=='overview':result=overview(owner,actor)
                elif self.kind=='positions':result=page(positions(account),request.query_params.get('page',1))
                elif self.kind=='detail':
                    code=request.query_params.get('code','')
                    position=next((p for p in positions(account) if p['code']==code),None)
                    if not position:return valid_result('该股票不在持仓中',status=404)
                    result={'position':position,'analysis':None}
                else:result=records(owner,actor,self.kind,request.query_params.get('page',1))
            except (ValueError,TypeError):return valid_result('请求参数无效',status=400)
        if self.kind == 'detail':
            # Only a deliberate single-position detail request computes indicators.
            # Do not hold the shared business/sync lock while querying BaoStock.
            import time
            from .investment_data import analyze, reference_day, local_day, QUERY_DEADLINE
            deadline_token = QUERY_DEADLINE.set(time.monotonic() + 120)
            try:
                result['analysis'] = analyze(code, reference_day(local_day()))
            except (ValueError, ArithmeticError):
                result['analysis_error'] = '指标暂不可用，持仓事实不受影响'
            finally:
                QUERY_DEADLINE.reset(deadline_token)
        return success_result(result)
