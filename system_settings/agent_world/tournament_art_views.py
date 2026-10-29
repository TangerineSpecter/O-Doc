"""Post-match artwork, isolated by account and tournament."""
import uuid
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from assets.models import Asset
from prompts.models import ImageGenerationTask
from system_mcp.image_generation import image_generation_options, supports_references
from system_mcp.image_generation_tasks import ACTIVE, _output, generate_image, get_image_generation_result
from system_settings.models import AIModel, Agent
from utils.response_utils import success_result, valid_result
from .life_views import owner_of
from .farm_gate import farm_gate, guarded
from .tournament_art_prompt import build_prompt, moments
from .tournament_models import Tournament, TournamentIllustration

SCENE = 'tournament_illustration'


def final_match(event):
    row = event.rounds.filter(phase='final').first()
    return row.matches.filter(kind='main', status='done').first() if row else None


def task_for(row):
    return ImageGenerationTask.objects.filter(user_id=row.owner_id, agent_key='', request_id=row.request_id,
                                               request_data__scene=SCENE).first() if row and row.request_id else None


class TournamentArtView(APIView):
    permission_classes = [IsAuthenticated]

    def event(self, request, identity):
        return Tournament.objects.filter(pk=identity, owner_id=owner_of(request), status='completed').first()

    def get(self, request, identity):
        event = self.event(request, identity)
        if not event:
            return valid_result('已结束的赛事不存在', status=404)
        row = TournamentIllustration.objects.filter(tournament=event).first()
        match = final_match(event)
        report = match.report if match else {}
        model_id = request.query_params.get('model_id') or request.query_params.get('modelId')
        options = image_generation_options(None, model_id, SCENE, owner_of(request))
        options['models'] = [{'value': str(m.pk), 'label': m.display_name or m.name}
                             for m in AIModel.objects.select_related('provider').filter(type='image_generation') if supports_references(m)]
        task = task_for(row)
        if task and request.query_params.get('poll') == '1':
            result = get_image_generation_result({'task_id': task.pk}, user_id=owner_of(request))
        else:
            result = _output(task) if task else None
        if row and row.request_id and not task:
            result = {'status': 'submission_unknown', 'message': '无法确认请求是否提交，请稍后重试查询'}
        return success_result({'asset_id': row.asset_id if row else '', 'task': result,
                               'moments': moments(report), 'can_generate': bool(report and moments(report)),
                               'options': options})

    @guarded
    def put(self, request, identity):
        event = self.event(request, identity)
        if not event:
            return valid_result('已结束的赛事不存在', status=404)
        owner = owner_of(request)
        data = request.data
        if not isinstance(data, dict):
            return valid_result('配图参数格式无效', status=400)
        asset_id = data.get('asset_id') or data.get('assetId') or ''
        task_id = data.get('task_id') or data.get('taskId') or ''
        if not isinstance(task_id, str) or (task_id and asset_id):
            return valid_result('请选择一种配图来源', status=400)
        row = TournamentIllustration.objects.filter(tournament=event).first()
        if task_id:
            task = task_for(row)
            if not task or task.pk != task_id or task.status != 'succeeded':
                return valid_result('请选择本届大会已完成的生图结果', status=400)
            asset_id = task.asset_id
        if not isinstance(asset_id, str) or not Asset.objects.filter(pk=asset_id, uploader=owner, is_valid=True, file_type='image').exists():
            return valid_result('请选择当前账号的有效图片', status=400)
        TournamentIllustration.objects.update_or_create(tournament=event, defaults={'owner_id': owner, 'asset_id': asset_id})
        return success_result({'asset_id': asset_id})

    @guarded
    def delete(self, request, identity):
        event = self.event(request, identity)
        if not event:
            return valid_result('已结束的赛事不存在', status=404)
        row = TournamentIllustration.objects.filter(tournament=event).first()
        if not row or not row.request_id:
            return success_result({})
        task = task_for(row)
        if (task and task.status != 'submission_unknown') or (not task and row.updated_at > timezone.now() - timedelta(minutes=3)):
            return valid_result('生成请求仍在处理，请稍后再试', status=409)
        row.request_id = ''
        row.save(update_fields=['request_id', 'updated_at'])
        return success_result({})

    def post(self, request, identity):
        event = self.event(request, identity)
        if not event:
            return valid_result('已结束的赛事不存在', status=404)
        owner, data = owner_of(request), request.data
        if not isinstance(data, dict):
            return valid_result('生图参数格式无效', status=400)
        match = final_match(event)
        report = match.report if match else {}
        participants = report.get('participants', [])
        if len(participants) != 2:
            return valid_result('决赛缺少有效战报，请使用上传图片', status=400)
        model_id = data.get('model_id', data.get('modelId', ''))
        if not isinstance(model_id, str) or len(model_id) > 40:
            return valid_result('生图模型无效', status=400)
        options = image_generation_options(None, model_id, SCENE, owner)
        if not options.get('configured') or not options.get('supports_reference_images'):
            return valid_result('请选择支持参考图的生图模型', status=400)
        references, roles = [], []
        for participant in participants:
            agent = Agent.objects.filter(pk=participant.get('actor_id')).first()
            info = image_generation_options(agent, model_id, SCENE, owner).get('agent_reference_images', {}) if agent else {}
            ref = info.get('full_body') or info.get('avatar')
            if not ref or ref in references:
                return valid_result('请先为双方配置各自的已上传头像或全身参考图', status=400)
            references.append(ref)
            roles.append({'image': len(references), 'role': 'character identity', 'actor_id': participant.get('actor_id'), 'name': participant.get('name')})
        style = data.get('style_reference_image_id') or data.get('styleReferenceImageId')
        if style:
            if not isinstance(style, str) or style in references or not Asset.objects.filter(pk=style, uploader=owner, is_valid=True, file_type='image').exists():
                return valid_result('画风参考图无效', status=400)
            references.append(style)
            roles.append({'image': len(references), 'role': 'style only'})
        if len(references) > options.get('max_reference_images', 0):
            return valid_result('当前模型参考图数量不足', status=400)
        extra = data.get('prompt', '')
        if not isinstance(extra, str) or len(extra) > 1000:
            return valid_result('补充要求须为不超过 1000 字的文本', status=400)
        chosen = data.get('moment_id') or data.get('momentId') or ''
        if not isinstance(chosen, str) or len(chosen) > 32:
            return valid_result('战斗瞬间无效', status=400)
        try:
            prompt = build_prompt(report, chosen, roles, extra)
        except ValueError as exc:
            return valid_result(str(exc), status=400)
        request_id = uuid.uuid4().hex
        with farm_gate(), transaction.atomic():
            Tournament.objects.select_for_update().get(pk=event.pk)
            row, _ = TournamentIllustration.objects.get_or_create(tournament=event, defaults={'owner_id': owner})
            current = task_for(row)
            if row.request_id and (not current or current.status in ACTIVE or current.status == 'submission_unknown'):
                return valid_result('已有生成任务正在处理，请稍后查看', status=409)
            row.request_id = request_id
            row.save(update_fields=['request_id', 'updated_at'])
        try:
            arguments = {'prompt': prompt, 'model_id': model_id or options['model_id'],
                         'reference_image_ids': references, 'request_id': request_id}
            if options.get('default_aspect_ratio'):
                arguments['aspect_ratio'] = options['default_aspect_ratio']
            if options.get('default_image_size'):
                arguments['image_size'] = options['default_image_size']
            result = generate_image(arguments, user_id=owner, scene=SCENE)
        except ValueError as exc:
            with farm_gate():
                TournamentIllustration.objects.filter(pk=event.pk, request_id=request_id).update(request_id='')
            return valid_result(str(exc), status=400)
        return success_result(result)
