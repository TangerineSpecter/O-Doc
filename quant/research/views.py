from django.shortcuts import get_object_or_404
from rest_framework import serializers
from utils.response_utils import success_result
from quant.views import QuantView
from quant.models import ResearchReport
from quant.presentation import entry_detail
from .intake import collect
from .presentation import report_data
from .services import revise_report


class IntakeView(QuantView):
    def post(self, request, coll_id):
        entry, notice = collect(self.collection, request.data)
        return success_result({'entry': entry_detail(entry), 'notice': notice})


class ReportView(QuantView):
    def patch(self, request, coll_id, entry_id, report_id):
        class Edit(serializers.Serializer):
            markdown = serializers.CharField(max_length=200000, allow_blank=True, trim_whitespace=False)
            expected_revision_id = serializers.CharField(max_length=40, allow_blank=True)
        serializer = Edit(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = get_object_or_404(ResearchReport, pk=report_id, entry=self.entry)
        revise_report(report, **serializer.validated_data)
        report.refresh_from_db()
        return success_result(report_data(report))
