"""Export the request IDs actually selected in the observation timeline."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from utils.response_utils import valid_result
from . import details
from .queries import filtered_usage
from .report import ObservationSelectionChanged, export_report


class ObservationExportView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            params = request.query_params
            if any(key not in params for key in ('agent_id', 'start_date', 'end_date')):
                raise ValueError('缺少观测范围')
            if params.get('all') == '1' or params.get('record_id') is not None:
                raise ValueError('观测范围无效')
            data = request.data
            if not isinstance(data, dict):
                raise ValueError('导出内容无效')
            selection, label = data.get('activity_filter'), data.get('activity_label')
            ids = data.get('request_ids')
            if (not isinstance(selection, str) or len(selection) > 250 or
                    not any(selection.startswith(prefix) and len(selection) > len(prefix)
                            for prefix in ('activity:', 'fact:')) or
                    not isinstance(label, str) or len(label) > 250 or
                    not isinstance(ids, list) or
                    any(not isinstance(key, str) or not key or len(key) > 40 for key in ids) or
                    len(set(ids)) != len(ids) or (selection.startswith('fact:') and ids)):
                raise ValueError('导出筛选无效')
            # Never trust the browser's list for access: intersect it with the
            # authenticated account, resident and date range, then reject stale IDs.
            details.maintain()
            rows = filtered_usage(request).filter(id__in=ids)
            if rows.count() != len(ids):
                return valid_result('观测范围已变化或部分请求不可见，请刷新后重试', status=409)
            return export_report(rows, request, observation={'activity_filter': selection, 'activity_label': label,
                                                              'expected_request_count': len(ids)})
        except ObservationSelectionChanged:
            return valid_result('观测范围已变化或部分请求不可见，请刷新后重试', status=409)
        except (ValueError, TypeError, OverflowError):
            return valid_result('日期或导出筛选条件无效', status=400)
