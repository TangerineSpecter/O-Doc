from django.urls import path

from .views import (
    MemoNotificationPushView,
    NotificationDetailView,
    NotificationPermanentDeleteView,
    NotificationRestoreView,
    NotificationTrashView,
    NotificationView,
)

urlpatterns = [
    path('notifications/', NotificationView.as_view(), name='notifications'),
    path('notifications/push_memo/', MemoNotificationPushView.as_view(), name='push_memo_notification'),
    path('notifications/trash/', NotificationTrashView.as_view(), name='notification_trash'),
    path('notifications/<str:notification_id>/restore/', NotificationRestoreView.as_view(), name='notification_restore'),
    path('notifications/<str:notification_id>/permanent/', NotificationPermanentDeleteView.as_view(), name='notification_permanent_delete'),
    path('notifications/<str:notification_id>/', NotificationDetailView.as_view(), name='notification_detail'),
]
