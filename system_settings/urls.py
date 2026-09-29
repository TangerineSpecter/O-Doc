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

from .agent_world.views import CatalogView, ProfessionView, ProfessionDescriptionView, IncomeConfigView, LedgerView, SettlementsView, MigrationView, RankingView, PendingIncomeView
from .agent_world.travel_views import TravelListView, TravelDetailView, InventoryView
from .agent_world.item_icon_views import ItemIconListView, ItemIconDetailView, InventoryManageView, InventoryIconView

from .agent_world.farm_views import FarmListView, FarmDetailView, FarmHistoryView, FarmCatalogView, FarmCropRuleView
from .agent_world.item_catalog_views import ItemCatalogView, ItemCatalogIconView, ItemCatalogInventoryIconView

from .agent_world.market_views import MarketShopView, MarketConfigView, MarketListView

from .agent_world.investment_views import InvestmentView

from .agent_world.life_views import LifeConfigView, LifeProfileView, LifeGoalView, LifeScheduleView

urlpatterns = [
    path('agent-world/life/config/', LifeConfigView.as_view()),
    path('agent-world/life/profiles/<str:actor>/', LifeProfileView.as_view()),
    path('agent-world/life/goals/', LifeGoalView.as_view()),
    path('agent-world/life/schedule/', LifeScheduleView.as_view()),
    path('agent-world/life/schedule/<str:identity>/', LifeScheduleView.as_view()),
    path('agent-world/investment/accounts/', InvestmentView.as_view()),
    path('agent-world/investment/overview/', InvestmentView.as_view(kind='overview')),
    path('agent-world/investment/positions/', InvestmentView.as_view(kind='positions')),
    path('agent-world/investment/trades/', InvestmentView.as_view(kind='trades')),
    path('agent-world/investment/decisions/', InvestmentView.as_view(kind='decisions')),
    path('agent-world/investment/detail/', InvestmentView.as_view(kind='detail')),
    path('agent-world/market/shop/', MarketShopView.as_view()),
    path('agent-world/market/config/', MarketConfigView.as_view()),
    path('agent-world/market/listings/', MarketListView.as_view()),
    path('agent-world/market/transactions/', MarketListView.as_view(kind='transactions')),
    path('agent-world/market/sessions/', MarketListView.as_view(kind='sessions')),
    path('agent-world/item-catalog/', ItemCatalogView.as_view()),
    path('agent-world/item-catalog/<str:sku>/icon/', ItemCatalogIconView.as_view()),
    path('agent-world/item-catalog/inventory/<str:item_id>/icon/', ItemCatalogInventoryIconView.as_view()),
    path("agent-world/farms/", FarmListView.as_view()),
    path("agent-world/farm-catalog/", FarmCatalogView.as_view()),
    path("agent-world/farm-catalog/crops/<str:crop_kind>/", FarmCropRuleView.as_view()),
    path("agent-world/farms/<str:farm_id>/", FarmDetailView.as_view()),
    path("agent-world/farms/<str:farm_id>/history/", FarmHistoryView.as_view()),
    path('agent-world/travel/', TravelListView.as_view()),
    path('agent-world/travel/<str:journey_id>/', TravelDetailView.as_view()),
    path('agent-world/inventory/', InventoryView.as_view()),
    path('agent-world/inventory/manage/', InventoryManageView.as_view()),
    path('agent-world/inventory/<str:item_id>/icon/', InventoryIconView.as_view()),
    path('agent-world/item-icons/', ItemIconListView.as_view()),
    path('agent-world/item-icons/<str:asset_id>/', ItemIconDetailView.as_view()),
    path("agent-world/categories/", CatalogView.as_view()),
    path("agent-world/professions/", ProfessionView.as_view()),
    path("agent-world/professions/generate-description/", ProfessionDescriptionView.as_view()),
    path("agent-world/income/", IncomeConfigView.as_view()),
    path("agent-world/ledger/", LedgerView.as_view()),
    path("agent-world/pending-income/", PendingIncomeView.as_view()),
    path("agent-world/settlements/", SettlementsView.as_view()),
    path("agent-world/collections/<str:collection_id>/migration/", MigrationView.as_view()),
    path("agent-world/collections/<str:collection_id>/ranking/", RankingView.as_view()),
    path('agent-relations/', AgentRelationView.as_view(), name='agent-relations'),
    path('', include(router.urls)),
]
