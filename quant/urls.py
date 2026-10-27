from .strategy_exports.views import StrategyExportView
from .studies.views import StudyView
from .connectors.views import ConnectorView, ConnectorExecuteView
from django.urls import path
from . import views
from .research.views import IntakeView, ReportView
from .research.supplements.views import SourceSupplementView
from .factors.views import FactorView
from .retrieval.views import FactorSearchView
from .graph.views import GraphView, IndexView
from .validation_studies.views import ValidationView
from .experiments.views import DatasetView, ExperimentView

from .experiments.campaigns.views import CampaignView
from .feedback.views import FeedbackView, ExecutionPreviewView
from .parameters.views import ConfigurationPreviewView
from .intake.views import BatchView

from .workflows.views import WorkflowEvidenceView
from .comparisons.views import ComparisonView, MergeView
from .source_changes.views import SourceImpactView
from .factors.versions.views import FormulaView
from .taxonomy.views import VocabularyView
from .verification.views import VerificationView
from .admissions.views import AdmissionView
from .native_python.views import NativeView
from .graph.correlation_views import CorrelationView
from .mt4_reports.views import ExpertView as MT4ExpertView, PreviewView as MT4PreviewView, TestView as MT4TestView, AttachmentView as MT4AttachmentView, VisionView as MT4VisionView, ZipChartView

urlpatterns = [
    path('<str:coll_id>/mt4/experts/', MT4ExpertView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/', MT4ExpertView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/preview/', MT4PreviewView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/recognize/', MT4VisionView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/tests/', MT4TestView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/tests/<str:test_id>/', MT4TestView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/tests/<str:test_id>/zip-chart/', ZipChartView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/attachments/', MT4AttachmentView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/attachments/<str:ref_id>/', MT4AttachmentView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/tests/<str:test_id>/attachments/', MT4AttachmentView.as_view()),
    path('<str:coll_id>/mt4/experts/<str:expert_id>/tests/<str:test_id>/attachments/<str:ref_id>/', MT4AttachmentView.as_view()),
    path('<str:coll_id>/ai-studies/', StudyView.as_view()),
    path('<str:coll_id>/ai-studies/<str:study_id>/', StudyView.as_view()),
    path('<str:coll_id>/ai-studies/<str:study_id>/<str:action>/', StudyView.as_view()),
    path('<str:coll_id>/connectors/', ConnectorView.as_view()),
    path('<str:coll_id>/connector-preview/', ConnectorView.as_view(), {'action': 'preview'}),
    path('<str:coll_id>/connector-responses/', ConnectorView.as_view(), {'action': 'responses'}),
    path('<str:coll_id>/connectors/<str:connector_id>/execute/', ConnectorExecuteView.as_view()),
    path('<str:coll_id>/connectors/<str:connector_id>/', ConnectorView.as_view()),
    path('<str:coll_id>/connectors/<str:connector_id>/<str:action>/', ConnectorView.as_view()),
    path('<str:coll_id>/comparisons/<str:comparison_id>/correlation/', CorrelationView.as_view()),
    path('<str:coll_id>/factors/<str:factor_id>/native-python/options/',NativeView.as_view(),{'action':'options'}),
    path('<str:coll_id>/factors/<str:factor_id>/native-python/',NativeView.as_view()),
    path('<str:coll_id>/native-python/<str:native_id>/',NativeView.as_view()),
    path('<str:coll_id>/native-python/<str:native_id>/cancel/',NativeView.as_view(),{'action':'cancel'}),
    path('<str:coll_id>/entries/<str:entry_id>/sources/<str:source_id>/supplements/', SourceSupplementView.as_view()),
    path('<str:coll_id>/experiments/<str:experiment_id>/strategy-export/', StrategyExportView.as_view()),
    path('<str:coll_id>/factors/<str:factor_id>/admissions/',AdmissionView.as_view()),
    path('<str:coll_id>/factors/<str:factor_id>/verification/', VerificationView.as_view()),
    path('<str:coll_id>/vocabulary/', VocabularyView.as_view()),
    path('<str:coll_id>/factors/<str:factor_id>/formula-versions/', FormulaView.as_view()),
    path('<str:coll_id>/factors/<str:factor_id>/formula-versions/select/', FormulaView.as_view(), {'action': 'select'}),
    path('<str:coll_id>/entries/<str:entry_id>/source-impact/', SourceImpactView.as_view()),
    path('<str:coll_id>/comparisons/', ComparisonView.as_view()),
    path('<str:coll_id>/comparisons/<str:comparison_id>/', ComparisonView.as_view()),
    path('<str:coll_id>/factor-merges/', MergeView.as_view()),
    path('<str:coll_id>/factor-merges/<str:merge_id>/withdraw/', MergeView.as_view(), {'action': 'withdraw'}),
    path('<str:coll_id>/entries/<str:entry_id>/runs/<str:run_id>/workflow/<str:stage>/', WorkflowEvidenceView.as_view()),
    path('<str:coll_id>/intake-batches/', BatchView.as_view()),
    path('<str:coll_id>/intake-batches/<str:batch_id>/', BatchView.as_view()),
    path('<str:coll_id>/intake-batches/<str:batch_id>/<str:action>/', BatchView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/parameters/preview/', ConfigurationPreviewView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/feedback/', FeedbackView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/feedback/preview/', ExecutionPreviewView.as_view()),
    path('<str:coll_id>/campaigns/', CampaignView.as_view()),
    path('<str:coll_id>/campaigns/<str:campaign_id>/', CampaignView.as_view()),
    path('<str:coll_id>/campaigns/<str:campaign_id>/cancel/', CampaignView.as_view(), {'action': 'cancel'}),
    path('<str:coll_id>/validations/', ValidationView.as_view()),
    path('<str:coll_id>/validations/<str:validation_id>/', ValidationView.as_view()),
    path('<str:coll_id>/validations/<str:validation_id>/<str:action>/', ValidationView.as_view()),
    path('<str:coll_id>/experiments/', ExperimentView.as_view()),
    path('<str:coll_id>/experiments/<str:experiment_id>/', ExperimentView.as_view()),
    path('<str:coll_id>/experiments/<str:experiment_id>/cancel/', ExperimentView.as_view(), {'action': 'cancel'}),
    path('<str:coll_id>/datasets/', DatasetView.as_view()),
    path('<str:coll_id>/datasets/<str:dataset_id>/', DatasetView.as_view()),
    path('<str:coll_id>/graph/', GraphView.as_view()),
    path('<str:coll_id>/graph/index/', IndexView.as_view()),
    path('<str:coll_id>/graph/index/<str:job_id>/cancel/', IndexView.as_view()),
    path('<str:coll_id>/factors/search/', FactorSearchView.as_view()),
    path('<str:coll_id>/factors/', FactorView.as_view()),
    path('<str:coll_id>/factors/<str:factor_id>/', FactorView.as_view()),
    path('<str:coll_id>/factors/<str:factor_id>/occurrences/', FactorView.as_view(), {'action': 'occurrences'}),
    path('<str:coll_id>/factors/<str:factor_id>/export/', FactorView.as_view(), {'action': 'export'}),
    path('<str:coll_id>/intake/', IntakeView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/reports/<str:report_id>/', ReportView.as_view()),
    path('models/', views.ModelsView.as_view()),
    path('<str:coll_id>/entries/', views.EntryView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/', views.EntryView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/implementations/', views.ImplementationView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/implementations/<str:impl_id>/', views.ImplementationView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/implementations/<str:impl_id>/versions/', views.VersionView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/versions/<str:version_id>/verification/', views.VersionView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/backtests/', views.BacktestView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/backtests/<str:backtest_id>/', views.BacktestView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/attachments/', views.AttachmentView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/attachments/<str:reference_id>/', views.AttachmentView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/attachments/<str:reference_id>/text/', views.AttachmentView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/runs/', views.RunView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/runs/<str:run_id>/', views.RunView.as_view()),
    path('<str:coll_id>/entries/<str:entry_id>/runs/<str:run_id>/<str:action>/', views.RunView.as_view()),
]
