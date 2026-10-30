from django.shortcuts import get_object_or_404
from utils.response_utils import success_result
from quant.views import QuantView
from quant.models import CodeVersion, ResearchReport, SourceRevision, AIRun
from quant.serializers import CodeVersionSerializer, EntrySerializer, AttachmentSerializer, BacktestSerializer
from quant.research.presentation import source_data
from .directory import page
from .projections import (overview, report_headers, report_header, source_headers, source_header,
                          report_body, RUN_FIELDS, run_summary, status)


class ReadingView(QuantView):
    pure_read_get = True

    def get(self, request, coll_id, entry_id, section, identity=None, child=None, child_id=None):
        entry = self.entry
        params = request.query_params
        if section == 'notes':
            return success_result(EntrySerializer(entry).data)
        if section == 'reports':
            if not identity:
                return success_result(page(report_headers(entry), params, report_header))
            report = get_object_or_404(ResearchReport.objects.defer('markdown', 'data'), pk=identity, entry=entry)
            if child == 'original':
                return success_result({'markdown': report.markdown, 'id': report.pk, 'created_at': report.created_at})
            if child == 'revisions':
                if child_id:
                    row = get_object_or_404(report.revisions, pk=child_id)
                    return success_result({'id': row.pk, 'markdown': row.markdown, 'created_at': row.created_at})
                return success_result(page(report.revisions.order_by('-created_at', '-id').values('id', 'parent_id', 'created_at', 'content_hash'), params))
            if child:
                from rest_framework.exceptions import NotFound
                raise NotFound('报告读取入口不存在')
            return success_result(report_body(report))
        if section == 'sources':
            if not identity:
                rows=source_headers(entry)
                if params.get('provenance'): rows=rows.filter(payload__provenance=params['provenance'])
                return success_result(page(rows, params, source_header))
            if params.get('metadata')=='1': return success_result(source_header(get_object_or_404(source_headers(entry),pk=identity)))
            return success_result(source_data(get_object_or_404(SourceRevision.objects.select_related('material'), pk=identity, material__entry=entry)))
        if section == 'implementations':
            rows = entry.implementations.order_by('created_at', 'id')
            fields = ('id', 'entry_id', 'name', 'language', 'current_version_id', 'created_at', 'updated_at')
            if not identity:
                return success_result(page(rows.values(*fields), params))
            impl = get_object_or_404(rows, pk=identity)
            if params.get('metadata') == '1': return success_result({key: getattr(impl, key) for key in fields})
            if child == 'versions':
                rows = impl.versions.order_by('-created_at', '-id')
                return success_result(page(rows.values('id', 'implementation_id', 'note', 'created_at', 'content_hash'), params))
            return success_result({key: getattr(impl, key) for key in (*fields, 'language_version', 'dependencies', 'parameters')})
        if section == 'versions':
            if params.get('metadata') == '1':
                row=get_object_or_404(CodeVersion.objects.values('id','implementation_id','note','created_at','content_hash'),pk=identity,implementation__entry=entry)
                return success_result(row)
            row = get_object_or_404(CodeVersion, pk=identity, implementation__entry=entry)
            return success_result(CodeVersionSerializer(row).data)
        if section == 'runs':
            rows = entry.runs.only(*RUN_FIELDS).order_by('-created_at', '-id')
            if not identity:
                return success_result(page(rows, params, lambda run: run_summary(run, workflow=False)))
            return success_result(run_summary(get_object_or_404(rows, pk=identity)))
        if section == 'attachments':
            return success_result(page(entry.attachments.select_related('asset').order_by('-created_at', '-id'), params,
                                       lambda row: AttachmentSerializer(row).data))
        if section == 'backtests':
            return success_result(page(entry.backtests.filter(is_valid=True).order_by('-created_at', '-id'), params,
                                       lambda row: BacktestSerializer(row).data))
        from rest_framework.exceptions import NotFound
        raise NotFound('读取入口不存在')


class StatusView(QuantView):
    def get(self, request, coll_id, entry_id):
        return success_result(status(self.entry))
