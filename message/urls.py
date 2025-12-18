from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import NotificationView

router = DefaultRouter()
# 注册视图集，生成如 /notifications/ 的路由
# router.register(r'notifications', NotificationView.as, basename='notification')

urlpatterns = [
    path('notifications/', NotificationView.as_view(), name='notifications'),
]
