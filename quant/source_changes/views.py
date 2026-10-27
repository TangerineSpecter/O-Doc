"""Read-only impact preview between explicitly selected, owned source snapshots."""
import json

from django.shortcuts import get_object_or_404
from rest_framework import serializers
from utils.response_utils import success_result
from quant.models import ResearchReport, SourceRevision
from quant.views import QuantView
from . import preview


class SourceImpactView(QuantView):
    def get(self, request, coll_id, entry_id):
        class Query(serializers.Serializer):
            source_id = serializers.CharField(max_length=40)
            report_id = serializers.CharField(max_length=40)
        serializer = Query(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        # Entry ownership was rechecked under the collection lock by QuantView.
        # A shared title or a newer timestamp never selects a baseline for us.
        target = get_object_or_404(SourceRevision.objects.select_related('material'),
            pk=values['source_id'], material__entry=self.entry)
        report = get_object_or_404(ResearchReport.objects.select_related('source__material'),
            pk=values['report_id'], entry=self.entry, schema_version__in=(1, 2, 3))
        baseline = report.source
        if target.payload.get('provenance') == 'external_feedback':
            raise serializers.ValidationError('外部反馈不作为源码变更目标，请使用反馈分析')
        def source_data(source):
            return {'source_id': source.pk, 'source_hash': source.content_hash, 'material_id': source.material_id,
                'language': source.payload.get('language', 'text'), 'created_at': source.created_at.isoformat()}
        result = {'version': 1, 'baseline': source_data(baseline) | {'report_id': report.pk, 'report_hash': report.content_hash},
            'target': source_data(target), 'relationship': 'same_source' if target.pk == baseline.pk else
                'same_material' if target.material_id == baseline.material_id else 'different_material',
            'impact': preview(baseline.payload, target.payload, report.data, bundle=True)}
        # Opaque JSON preserves literal names and source strings through API camel casing.
        return success_result({'impact_json': json.dumps(result, ensure_ascii=False, allow_nan=False)})
