from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import MethodNotAllowed
from quant.views import QuantView
from quant.models import ResearchCampaign
from utils.response_utils import success_result
from .contracts import CampaignInput
from .services import start, cancel
from .presentation import campaign_data


class CampaignView(QuantView):
    def get(self, request, coll_id, campaign_id=None, action=None):
        if action:
            raise MethodNotAllowed('GET')
        records = ResearchCampaign.objects.filter(anthology=self.collection)
        if campaign_id:
            return success_result(campaign_data(get_object_or_404(records, pk=campaign_id)))
        class Query(serializers.Serializer):
            offset = serializers.IntegerField(min_value=0, default=0)
            limit = serializers.IntegerField(min_value=1, max_value=20, default=10)
        form = Query(data=request.query_params); form.is_valid(raise_exception=True)
        offset, limit = form.validated_data['offset'], form.validated_data['limit']
        return success_result({'total': records.count(), 'items': [campaign_data(row) for row in records[offset:offset + limit]]})

    def post(self, request, coll_id, campaign_id=None, action=None):
        if campaign_id:
            if action != 'cancel':
                raise MethodNotAllowed('POST')
            campaign = get_object_or_404(ResearchCampaign, pk=campaign_id, anthology=self.collection)
            cancel(campaign)
        else:
            form = CampaignInput(data=request.data); form.is_valid(raise_exception=True)
            campaign = start(self.collection, dict(form.validated_data))
        return success_result(campaign_data(campaign))
