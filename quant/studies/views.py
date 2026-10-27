from django.shortcuts import get_object_or_404
from rest_framework.exceptions import MethodNotAllowed
from rest_framework import serializers
from quant.views import QuantView
from quant.models import AIStudy, AIStudyJob
from utils.response_utils import success_result
from .contracts import StudyInput
from .services import start, resume, presentation


class StudyView(QuantView):
    def get(self, request, coll_id, study_id=None, action=None):
        if action: raise MethodNotAllowed('GET')
        rows = AIStudy.objects.filter(anthology=self.collection)
        if study_id: return success_result(presentation(get_object_or_404(rows, pk=study_id)))
        return success_result({'items': [presentation(row) for row in rows[:30]], 'total': rows.count()})

    def post(self, request, coll_id, study_id=None, action=None):
        if not study_id:
            form = StudyInput(data=request.data); form.is_valid(raise_exception=True)
            study = start(self.collection, dict(form.validated_data))
        else:
            study = get_object_or_404(AIStudy, pk=study_id, anthology=self.collection)
            if action == 'report':
                class Revision(serializers.Serializer):
                    markdown = serializers.CharField(max_length=200000, allow_blank=True)
                form = Revision(data=request.data); form.is_valid(raise_exception=True)
                study.user_report = form.validated_data['markdown']; study.save(update_fields=['user_report', 'updated_at'])
            elif action == 'cancel':
                AIStudyJob.objects.filter(study=study, status__in=['pending', 'running']).update(status='cancelled', error='用户停止了AI研究', lease_until=None)
            elif action == 'resume': resume(study)
            else: raise MethodNotAllowed('POST')
        return success_result(presentation(study))
