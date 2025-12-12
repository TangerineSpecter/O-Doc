from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AIProviderViewSet, AIModelViewSet, SystemConfigViewSet

router = DefaultRouter()
router.register(r'providers', AIProviderViewSet)
router.register(r'models', AIModelViewSet)
router.register(r'config', SystemConfigViewSet, basename='sys-config')

urlpatterns = [
    path('', include(router.urls)),
]
