"""HTTP boundaries for lesson sessions, contextual cards and revisions."""
from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework.exceptions import ValidationError
from .views import LearningView, owned, result, key
from .models import Course, Exercise, LearningSession, Attempt, LearningItem
from .locking import course_lock
from .session_services import start_session, advance_session, save_session_draft, queue_turn, queue_revision
from .session_presentation import session_data
from .items import save_item, items_data
from .presentation import request_data


class SessionStartView(LearningView):
    def post(self, request, coll_id, exercise_id):
        owned(request, coll_id)
        exercise = get_object_or_404(Exercise, pk=exercise_id, course_id=coll_id)
        return result(session_data(start_session(exercise, key(request.data))))


class SessionView(LearningView):
    def _session(self, request, coll_id, session_id):
        owned(request, coll_id)
        return get_object_or_404(LearningSession.objects.select_related('exercise__course'), pk=session_id, exercise__course_id=coll_id)

    def get(self, request, coll_id, session_id):
        return result(session_data(self._session(request, coll_id, session_id)))

    def put(self, request, coll_id, session_id):
        session = self._session(request, coll_id, session_id)
        return result(session_data(save_session_draft(session, request.data.get('revision'), request.data.get('content'))))

    def post(self, request, coll_id, session_id):
        session = self._session(request, coll_id, session_id)
        action = request.data.get('action')
        if action == 'advance':
            return result(session_data(advance_session(session, request.data.get('revision'), key(request.data))))
        if action in ('turn', 'help', 'retry'):
            if action == 'retry' and not request.data.get('turn_id'):
                raise ValidationError('缺少重试交流记录')
            req = queue_turn(session, request.data.get('revision'), key(request.data), help_requested=action == 'help',
                             retry_id=request.data.get('turn_id') if action == 'retry' else None)
            return result(request_data(req))
        if action == 'end':
            from .services import end_exercise
            end_exercise(session.exercise)
            session.refresh_from_db()
            return result(session_data(session))
        raise ValidationError('未知学习会话操作')


class RevisionView(LearningView):
    def post(self, request, coll_id, attempt_id):
        owned(request, coll_id)
        attempt = get_object_or_404(Attempt.objects.select_related('exercise__course'), pk=attempt_id, exercise__course_id=coll_id)
        req = queue_revision(attempt, request.data.get('question_id'), request.data.get('content'), key(request.data), retry_id=request.data.get('revision_id'))
        return result(request_data(req))


class ItemsView(LearningView):
    def _course(self, request, coll_id):
        owned(request, coll_id)
        return get_object_or_404(Course, pk=coll_id)

    def get(self, request, coll_id):
        return result(items_data(self._course(request, coll_id)))

    def post(self, request, coll_id):
        course = self._course(request, coll_id)
        item = save_item(course, request.data)
        return result({'id': item.id})


class ItemView(ItemsView):
    def put(self, request, coll_id, item_id):
        course = self._course(request, coll_id)
        item = get_object_or_404(LearningItem, pk=item_id, course=course)
        return result({'id': save_item(course, request.data, item).id})

    def delete(self, request, coll_id, item_id):
        course = self._course(request, coll_id)
        with course_lock(course.pk), transaction.atomic():
            get_object_or_404(LearningItem, pk=item_id, course=course).delete()
        return result({'deleted': True})
