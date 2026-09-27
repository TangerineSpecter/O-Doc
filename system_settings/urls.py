from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .agent_views import AgentRelationView
from .views import (
    AgentRunRecordViewSet,
    AgentActivityViewSet,
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
router.register(r'agent-activities', AgentActivityViewSet)
router.register(r'mcp-servers', MCPServerViewSet)
router.register(r'skills', SkillViewSet)
router.register(r'locations', GeoLocationViewSet)
router.register(r'config', SystemConfigViewSet, basename='sys-config')

from .agent_world.views import CatalogView, ProfessionView, IncomeConfigView, LedgerView, SettlementsView, MigrationView, RankingView, PendingIncomeView

urlpatterns = [
    path("agent-world/categories/", CatalogView.as_view()),
    path("agent-world/professions/", ProfessionView.as_view()),
    path("agent-world/income/", IncomeConfigView.as_view()),
    path("agent-world/ledger/", LedgerView.as_view()),
    path("agent-world/pending-income/", PendingIncomeView.as_view()),
    path("agent-world/settlements/", SettlementsView.as_view()),
    path("agent-world/collections/<str:collection_id>/migration/", MigrationView.as_view()),
    path("agent-world/collections/<str:collection_id>/ranking/", RankingView.as_view()),
    path('agent-relations/', AgentRelationView.as_view(), name='agent-relations'),
    path('', include(router.urls)),
]
