from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from anthology.models import Anthology
from system_settings.models import AIModel
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result
from .time_utils import wire_dates
from .generation import validate_stages
from .goals import confirm_goal, proposal_data, queue_goal
from .locking import course_lock
from .models import Attempt, Correction, Course, DeviceJob, Exercise, Plan, Request, Runtime
from .presentation import attempt_data, course_data, exercise_data, request_data
from .serializers import CourseSerializer
from .services import assist, end_exercise, new_attempt, queue_chat, request_id, reserve_exercise, save_draft, snapshot, submit


def owned(request, coll_id):
    return get_object_or_404(Anthology, pk=coll_id, type='learning', is_valid=True, user_id=get_current_user_identifier(request))


def key(data):
    value = data.get('request_key')
    if not isinstance(value, str) or not 8 <= len(value) <= 120:
        raise ValidationError('请求必须携带稳定的requestKey')
    return value


def result(data, **kwargs):
    return success_result(wire_dates(data), **kwargs)


class LearningView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        if isinstance(exc, ValidationError):
            return valid_result(msg='；'.join(str(v) for v in exc.detail) if isinstance(exc.detail, list) else str(exc.detail), status=exc.status_code)
        response = super().handle_exception(exc)
        if isinstance(response.data, dict) and 'code' not in response.data:
            response.data = {'code': response.status_code, 'msg': str(response.data.get('detail', '请求失败')), 'data': None}
        return response


class CourseView(LearningView):
    def get(self, request, coll_id):
        anth = owned(request, coll_id)
        course = Course.objects.filter(pk=anth.pk).first()
        return result(course_data(course) if course else {'title': anth.title, 'config': None})

    def put(self, request, coll_id):
        anth = owned(request, coll_id)
        with course_lock(coll_id), transaction.atomic():
            course = Course.objects.filter(pk=coll_id).first()
            previous_goal = (course.goal, course.scenarios) if course else None
            serializer = CourseSerializer(course, data=request.data)
            serializer.is_valid(raise_exception=True)
            confirm_goal(anth, course, request.data)
            course = serializer.save(anthology=anth)
            if previous_goal and previous_goal != (course.goal, course.scenarios):
                prior = Plan.objects.filter(course=course).order_by('-created_at', '-id').first()
                if prior:
                    Plan.objects.create(course=course, stages=prior.stages, stage=prior.stage, baseline=prior.baseline, confirmed=False)
            rt, _ = Runtime.objects.get_or_create(course=course)
            enabled = request.data.get('auto_enabled', False)
            if type(enabled) is not bool:
                raise ValidationError('自动出题开关必须是布尔值')
            if enabled and not rt.enabled:
                rt.enabled_at = timezone.now()
            rt.enabled = enabled
            rt.save()
        return result(course_data(course))


class ModelsView(LearningView):
    def get(self, request):
        return result(list(AIModel.objects.filter(type='chat').values('id', 'name', 'display_name')))


class GenerateView(LearningView):
    def post(self, request, coll_id):
        owned(request, coll_id)
        course = get_object_or_404(Course, pk=coll_id)
        req, created = reserve_exercise(course, key(request.data))
        return result({'request': request_data(req), 'created': created, 'course': course_data(course)}, msg='已开始准备' if created else '已有练习待完成或请求已处理')


class ExerciseView(LearningView):
    def get(self, request, coll_id, exercise_id):
        owned(request, coll_id)
        ex = get_object_or_404(Exercise, pk=exercise_id, course_id=coll_id)
        return result(exercise_data(ex))

    def post(self, request, coll_id, exercise_id):
        owned(request, coll_id)
        ex = get_object_or_404(Exercise, pk=exercise_id, course_id=coll_id)
        action = request.data.get('action')
        if action == 'start':
            new_attempt(ex)
        elif action == 'end':
            end_exercise(ex)
        else:
            raise ValidationError('未知操作')
        ex.refresh_from_db()
        return result(exercise_data(ex))


class AttemptView(LearningView):
    def _attempt(self, request, coll_id, attempt_id):
        owned(request, coll_id)
        return get_object_or_404(Attempt.objects.select_related('exercise__course'), pk=attempt_id, exercise__course_id=coll_id)

    def put(self, request, coll_id, attempt_id):
        attempt = self._attempt(request, coll_id, attempt_id)
        revision = request.data.get('revision')
        if type(revision) is not int:
            raise ValidationError('缺少答案版本')
        items = request.data.get('answer_items')
        if not isinstance(items, list) or any(not isinstance(v, dict) or not isinstance(v.get('question_id'), str) or not isinstance(v.get('answer'), str) for v in items) or len({v['question_id'] for v in items}) != len(items):
            raise ValidationError('答案列表格式错误')
        return result(attempt_data(save_draft(attempt, revision, {v['question_id']: v['answer'] for v in items})))

    def post(self, request, coll_id, attempt_id):
        attempt = self._attempt(request, coll_id, attempt_id)
        action = request.data.get('action', 'submit')
        if action == 'answer':
            qid = request.data.get('question_id', '')
            assist(attempt, qid)
            q = next(q for q in attempt.exercise.questions if q['id'] == qid)
            attempt.refresh_from_db()
            return result({'reference_answer': q['reference_answer'], 'explanation': q['explanation'], 'attempt': attempt_data(attempt)})
        if action not in ('submit', 'retry', 'review'):
            raise ValidationError('未知作答操作')
        req = submit(attempt, key(request.data), confirm_skips=request.data.get('confirm_skips') is True, review=action == 'review', retry=action == 'retry')
        return result(request_data(req))


class PlanView(LearningView):
    def post(self, request, coll_id):
        owned(request, coll_id)
        course = get_object_or_404(Course, pk=coll_id)
        stages = validate_stages(request.data.get('stages'))
        stage = request.data.get('stage', 0)
        if type(stage) is not int or stage not in (0, 1, 2):
            raise ValidationError('阶段无效')
        with course_lock(coll_id), transaction.atomic():
            plan = Plan.objects.filter(course=course).order_by('-created_at', '-id').first()
            if not plan:
                raise ValidationError('请先完成初测')
            if request.data.get('plan_id') != plan.id:
                from .services import Conflict
                raise Conflict('学习计划已更新，请重新加载')
            baseline = plan.baseline if stage == plan.stage else list(Exercise.objects.filter(course=course, kind='practice', attempt__grade__isnull=False).values_list('id', flat=True).distinct())
            Plan.objects.create(course=course, stages=stages, stage=stage, confirmed=True, baseline=baseline)
        return result(course_data(course))


class ChatView(LearningView):
    def post(self, request, coll_id):
        owned(request, coll_id)
        course = get_object_or_404(Course, pk=coll_id)
        attempt = None
        if request.data.get('attempt_id'):
            attempt = get_object_or_404(Attempt.objects.select_related('exercise'), pk=request.data['attempt_id'], exercise__course=course)
        req = queue_chat(course, request.data.get('content'), key(request.data), attempt, request.data.get('question_id', ''))
        return result(request_data(req))


class ProfileView(LearningView):
    def post(self, request, coll_id):
        owned(request, coll_id)
        course = get_object_or_404(Course, pk=coll_id)
        if request.data.get('action') == 'correct':
            content = request.data.get('content')
            if not isinstance(content, str) or not content.strip() or len(content) > 1000:
                raise ValidationError('修正说明最多1000字')
            Correction.objects.create(course=course, content=content.strip())
        else:
            with course_lock(coll_id), transaction.atomic():
                rid = request_id(coll_id, 'evaluate', key(request.data))
                if not Request.objects.filter(pk=rid).exists():
                    if Request.objects.filter(course=course, kind='evaluate', status__in=['pending', 'running']).exists():
                        raise ValidationError('评估正在进行')
                    req = Request.objects.create(id=rid, course=course, kind='evaluate', target_id=rid[:40], snapshot=snapshot(course))
                    DeviceJob.objects.create(request=req)
        return result(course_data(course))


class GoalView(LearningView):
    def post(self, request, coll_id):
        anth = owned(request, coll_id)
        proposal = queue_goal(anth, request.data, key(request.data))
        return result(proposal_data(proposal))

    def get(self, request, coll_id):
        from .models import GoalProposal
        anth = owned(request, coll_id)
        proposals = GoalProposal.objects.filter(anthology=anth)
        proposal_id = request.query_params.get('proposal_id')
        proposal = get_object_or_404(proposals, pk=proposal_id) if proposal_id else proposals.order_by('-created_at').first()
        return result(proposal_data(proposal) if proposal else None)


class CatalogView(LearningView):
    def get(self, request):
        from .catalog import catalog_data
        return result(catalog_data())
