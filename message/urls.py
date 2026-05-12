from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import MemoNotificationPushView, NotificationDetailView, NotificationView

router = DefaultRouter()
# 注册视图集，生成如 /notifications/ 的路由
# router.register(r'notifications', NotificationView.as, basename='notification')

urlpatterns = [
    path('notifications/', NotificationView.as_view(), name='notifications'),
    path('notifications/push_memo/', MemoNotificationPushView.as_view(), name='push_memo_notification'),
    path('notifications/<str:notification_id>/', NotificationDetailView.as_view(), name='notification_detail'),
]
