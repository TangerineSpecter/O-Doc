from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    AgentRunRecordViewSet,
    AgentTaskViewSet,
    AgentViewSet,
    AIProviderViewSet,
    AIModelViewSet,
    MCPServerViewSet,
    SkillViewSet,
    SystemConfigViewSet,
    GeoLocationViewSet,
)

router = DefaultRouter()
router.register(r'providers', AIProviderViewSet)
router.register(r'models', AIModelViewSet)
router.register(r'agents', AgentViewSet)
router.register(r'agent-tasks', AgentTaskViewSet)
router.register(r'agent-run-records', AgentRunRecordViewSet)
router.register(r'mcp-servers', MCPServerViewSet)
router.register(r'skills', SkillViewSet)
router.register(r'locations', GeoLocationViewSet)
router.register(r'config', SystemConfigViewSet, basename='sys-config')

urlpatterns = [
    path('', include(router.urls)),
]
