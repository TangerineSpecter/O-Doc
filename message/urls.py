from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet

router = DefaultRouter()
# 注册视图集，生成如 /notifications/ 的路由
router.register(r'notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('', include(router.urls)),
]
