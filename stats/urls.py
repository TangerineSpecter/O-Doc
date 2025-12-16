from django.urls import path

from stats.views import ReportReadDurationView

urlpatterns = [
    # 上报阅读时长: /api/stats/report/duration
    path('report/duration', ReportReadDurationView.as_view(), name='report_duration'),
]
