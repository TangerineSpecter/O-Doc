from datetime import timedelta

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result, valid_result

from .models import DailyReviewItem, HealthIssueIgnore
from .services import collect_health_issues, health_payload, overview_payload, refresh_daily_review, review_payload


def _requested_review_date(request):
    today = timezone.now().date()
    raw_date = request.query_params.get('date')
    if not raw_date:
        return today
    selected = parse_date(raw_date)
    if not selected or selected > today or selected < today - timedelta(days=6):
        return None
    return selected


class MaintenanceOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(overview_payload(get_current_user_identifier(request)))


class DailyReviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        selected_date = _requested_review_date(request)
        if selected_date is None:
            return valid_result('只能查看最近 7 天的回顾记录', status=400)
        return success_result(review_payload(
            get_current_user_identifier(request),
            selected_date,
            generate=selected_date == timezone.now().date(),
        ))


class DailyReviewItemView(APIView):
    permission_classes = [IsAuthenticated]
    ALLOWED_STATUSES = {'pending', 'completed', 'skipped'}

    def put(self, request, item_id):
        status = request.data.get('status')
        if status not in self.ALLOWED_STATUSES:
            return valid_result('回顾状态无效', status=400)
        user_id = get_current_user_identifier(request)
        item = get_object_or_404(DailyReviewItem, id=item_id, user_id=user_id)
        if item.review_date != timezone.now().date() or item.status == 'replaced':
            return error_result(ErrorCode.PERMISSION_DENIED, status=403)
        if item.status != status:
            item.status = status
            item.save(update_fields=['status', 'updated_at'])
        return success_result(review_payload(user_id))


class DailyReviewRefreshView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user_id = get_current_user_identifier(request)
        refresh_daily_review(user_id)
        return success_result(review_payload(user_id))


class HealthCheckView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        severity = (request.query_params.get('severity') or '').strip()
        rule_code = (request.query_params.get('rule_code') or request.query_params.get('ruleCode') or '').strip()
        include_ignored = str(
            request.query_params.get('include_ignored') or request.query_params.get('includeIgnored') or ''
        ).lower() == 'true'
        if severity and severity not in {'critical', 'warning', 'info'}:
            return valid_result('严重度筛选无效', status=400)
        try:
            page = max(1, int(request.query_params.get('page') or 1))
            page_size = min(50, max(1, int(
                request.query_params.get('page_size') or request.query_params.get('pageSize') or 20
            )))
        except (TypeError, ValueError):
            return valid_result('分页参数无效', status=400)
        return success_result(health_payload(
            get_current_user_identifier(request),
            severity=severity,
            rule_code=rule_code,
            include_ignored=include_ignored,
            page=page,
            page_size=page_size,
        ))


class HealthIgnoreView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _identity(request):
        source = request.data if request.data else request.query_params
        return (
            (source.get('rule_code') or '').strip(),
            (source.get('source_type') or '').strip(),
            (source.get('source_id') or '').strip(),
            (source.get('fingerprint') or '').strip(),
        )

    def post(self, request):
        rule_code, source_type, source_id, fingerprint = self._identity(request)
        if not all((rule_code, source_type, source_id, fingerprint)):
            return valid_result('缺少问题标识或内容指纹', status=400)
        user_id = get_current_user_identifier(request)
        current_issue = next((
            issue for issue in collect_health_issues(user_id)
            if issue['rule_code'] == rule_code and issue['source_type'] == source_type and issue['source_id'] == source_id
        ), None)
        if not current_issue or current_issue['fingerprint'] != fingerprint:
            return valid_result('问题已变化，请刷新后重试', status=409)
        HealthIssueIgnore.objects.update_or_create(
            user_id=user_id,
            rule_code=rule_code,
            source_type=source_type,
            source_id=source_id,
            defaults={'source_fingerprint': fingerprint},
        )
        return success_result(health_payload(user_id))

    def delete(self, request):
        rule_code, source_type, source_id, _ = self._identity(request)
        if not all((rule_code, source_type, source_id)):
            return valid_result('缺少问题标识', status=400)
        HealthIssueIgnore.objects.filter(
            user_id=get_current_user_identifier(request),
            rule_code=rule_code,
            source_type=source_type,
            source_id=source_id,
        ).delete()
        return success_result()
