from django.urls import path

from stats.views import ReportReadDurationView, StatisticsView

urlpatterns = [
    # 上报阅读时长: /api/stats/report/duration
    path('report/duration', ReportReadDurationView.as_view(), name='report_duration'),
    # 获取统计数据
    path('dashboard', StatisticsView.as_view(), name='stats_dashboard'),
]
