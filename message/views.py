from hashlib import sha256

from django.core.paginator import Paginator
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from utils.notification_service import notification_title
from utils.response_utils import success_result
from utils.drf_utils import get_current_user_identifier
from system_settings.sync_state import record_bulk_change
from memos.models import Memo
from .models import Notification
from .serializers import NotificationSerializer


def get_notification_queryset(user, status='unread'):
    queryset = Notification.objects.filter(user=user)
    if status == 'deleted':
        return queryset.filter(is_deleted=True)
    queryset = queryset.filter(is_deleted=False)
    if status == 'read':
        return queryset.filter(is_read=True)
    if status == 'all':
        return queryset
    return queryset.filter(is_read=False)


@transaction.atomic
def update_notifications(queryset, **changes):
    # Notifications that arrive after this selection must retain their unread state.
    ids = list(queryset.select_for_update().order_by('pk').values_list('pk', flat=True))
    for offset in range(0, len(ids), 500):
        selected = Notification.objects.filter(pk__in=ids[offset:offset + 500])
        record_bulk_change(selected)
        selected.update(**changes)


class NotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 只看自己的通知
        status = request.query_params.get('status', 'unread')
        msg_list = get_notification_queryset(request.user, status)
        if request.query_params.get('count_only') == '1':
            return success_result({'count': msg_list.count()})
        if 'page' in request.query_params:
            try:
                number = max(1, int(request.query_params['page']))
            except ValueError:
                number = 1
            pages = Paginator(msg_list.order_by('-created_at', '-pk'), 30)
            page = pages.get_page(number)
            return success_result({
                'items': NotificationSerializer(page.object_list, many=True).data,
                'total': pages.count, 'page': page.number, 'pages': pages.num_pages,
            })
        json_data = NotificationSerializer(msg_list, many=True).data
        return success_result(json_data)

    def post(self, request):
        # 只处理自己的通知
        update_notifications(get_notification_queryset(request.user), is_read=True)
        return success_result()


class NotificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, notification_id):
        queryset = Notification.objects.filter(id=notification_id, user=request.user, is_deleted=False)
        update_notifications(queryset.filter(is_read=False), is_read=True)
        return success_result()

    def delete(self, request, notification_id):
        queryset = Notification.objects.filter(id=notification_id, user=request.user, is_deleted=False)
        update_notifications(
            queryset,
            is_deleted=True,
            deleted_at=timezone.now()
        )
        return success_result()


class NotificationRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, notification_id):
        queryset = Notification.objects.filter(id=notification_id, user=request.user, is_deleted=True)
        update_notifications(
            queryset,
            is_deleted=False,
            deleted_at=None
        )
        return success_result()


class NotificationPermanentDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, notification_id):
        Notification.objects.filter(id=notification_id, user=request.user, is_deleted=True).delete()
        return success_result()


class NotificationTrashView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        Notification.objects.filter(user=request.user, is_deleted=True).delete()
        return success_result()


class MemoNotificationPushView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        owner = get_current_user_identifier(request)
        schedule = request.headers.get('Idempotency-Key')
        if schedule:
            digest = sha256(f'{request.user.get_username()}\0{schedule}'.encode()).hexdigest()
            scheduled_id = 'msg_' + digest[:36]
            existing = Notification.objects.filter(user=request.user, pk=scheduled_id).first()
            if existing:
                return success_result(NotificationSerializer(existing).data)

        memo = Memo.objects.filter(
            user_id=owner,
            is_valid=True
        ).order_by('?').first()

        if not memo:
            return success_result(data=None)

        title = f"Memos · {memo.tag}" if memo.tag else "Memos 定时推送"
        fields = dict(title=notification_title(title), content=memo.content, type='info', link='/memos')
        if schedule:
            notification, _ = Notification.objects.get_or_create(pk=scheduled_id, user=request.user, defaults=fields)
        else:
            notification = Notification.objects.create(user=request.user, **fields)
        return success_result(NotificationSerializer(notification).data)
