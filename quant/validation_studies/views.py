from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import MethodNotAllowed,ValidationError
from utils.response_utils import success_result
from quant.views import QuantView
from quant.models import ValidationPlan,MarketDataset
from .contracts import PlanInput
from .services import register,preview,start,cancel
from .presentation import data,list_data


class ValidationView(QuantView):
    def selected(self,identity):
        return get_object_or_404(ValidationPlan.objects.select_related('anthology','source_request'),pk=identity,anthology=self.collection)

    def get(self,request,coll_id,validation_id=None,action=None):
        if action: raise MethodNotAllowed('GET')
        if validation_id: return success_result(data(self.selected(validation_id)))
        class Query(serializers.Serializer):
            source_request_id=serializers.CharField(max_length=40)
            offset=serializers.IntegerField(min_value=0,default=0)
        query=Query(data=request.query_params);query.is_valid(raise_exception=True)
        records=ValidationPlan.objects.filter(anthology=self.collection,source_request_id=query.validated_data['source_request_id'])
        offset=query.validated_data['offset']
        return success_result({'total':records.count(),'items':list_data(records,offset)})

    def post(self,request,coll_id,validation_id=None,action=None):
        if not validation_id:
            form=PlanInput(data=request.data);form.is_valid(raise_exception=True)
            return success_result(data(register(self.collection,form.validated_data)))
        plan=self.selected(validation_id)
        if action in ('preview','run'):
            class Input(serializers.Serializer):
                dataset_id=serializers.CharField(max_length=40)
                mode=serializers.ChoiceField(choices=('fresh','replication'),default='fresh')
            form=Input(data=request.data);form.is_valid(raise_exception=True)
            dataset=get_object_or_404(MarketDataset,pk=form.validated_data['dataset_id'],anthology=self.collection)
            if action=='preview': return success_result({'preview_json':__import__('json').dumps(preview(plan,dataset),ensure_ascii=False)})
            start(plan,dataset,form.validated_data['mode'])
        elif action=='cancel':
            if not hasattr(plan,'evaluation'): raise ValidationError('此计划尚未预约计算')
            cancel(plan.evaluation)
        elif action=='review':
            if not hasattr(plan,'evaluation') or not hasattr(plan.evaluation,'result'): raise ValidationError('尚无固定验证结果')
            class Review(serializers.Serializer):
                request_key=serializers.RegexField(r'^[A-Za-z0-9_-]{16,64}$')
                model_id=serializers.CharField(max_length=40,allow_blank=True,default='')
            form=Review(data=request.data);form.is_valid(raise_exception=True)
            from .reviews import start as start_review
            start_review(plan.evaluation.result,**form.validated_data)
        else: raise MethodNotAllowed('POST')
        return success_result(data(plan))
