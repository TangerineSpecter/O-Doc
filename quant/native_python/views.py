from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.views import APIView
from utils.response_utils import success_result
from quant.locking import collection_lock
from quant.models import NativePythonRequest,NativePythonJob,FactorCandidate
from quant.views import QuantView
from quant.access import owned_collection
from .contracts import NativeInput
from .runtime import RuntimeUnavailable
from .services import start,presentation,options


class NativeView(QuantView):
    def initial(self,request,*args,**kwargs):
        if request.method=='POST' and not kwargs.get('native_id'):
            APIView.initial(self,request,*args,**kwargs)
            self.collection=owned_collection(request,kwargs['coll_id'])
        else:super().initial(request,*args,**kwargs)

    def records(self):return NativePythonRequest.objects.filter(anthology=self.collection,candidate__report__entry__is_valid=True).select_related('result')

    def get(self,request,coll_id,factor_id=None,native_id=None,action=None):
        if action and action!='options':raise MethodNotAllowed('GET')
        if action=='options':return success_result(options(self.collection,factor_id))
        if native_id:return success_result(presentation(get_object_or_404(self.records(),pk=native_id),True))
        get_object_or_404(FactorCandidate,pk=factor_id,report__entry__anthology=self.collection,report__entry__is_valid=True)
        records=self.records().filter(candidate_id=factor_id)
        return success_result({'total':records.count(),'items':[presentation(row) for row in records[:20]]})

    def post(self,request,coll_id,factor_id=None,native_id=None,action=None):
        if action=='cancel':
            with collection_lock(coll_id),transaction.atomic():
                record=get_object_or_404(self.records(),pk=native_id);job=NativePythonJob.objects.filter(request=record).first()
                if job and job.status in ('pending','running'):
                    job.cancel_requested=True;job.save(update_fields=['cancel_requested','updated_at'])
                    if job.status=='pending':
                        from .worker import finish
                        from .calculation import failed
                        finish(record,failed('cancelled','cancelled'));job.status,job.lease_until='cancelled',None
                        job.save(update_fields=['status','lease_until','updated_at'])
                return success_result(presentation(record,True))
        if action or native_id:raise MethodNotAllowed('POST')
        form=NativeInput(data=request.data);form.is_valid(raise_exception=True)
        try:record=start(self.collection,factor_id,form.validated_data)
        except RuntimeUnavailable:
            from rest_framework.exceptions import APIException
            error=APIException('本机Python验证运行器尚不可用，请先安装固定镜像；未执行上传源码')
            error.status_code=503;raise error
        with collection_lock(coll_id),transaction.atomic():
            self.collection=owned_collection(request,coll_id)
            return success_result(presentation(get_object_or_404(self.records(),pk=record.pk),True))
