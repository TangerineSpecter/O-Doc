"""Authenticated API endpoints for prompt image generation."""

from django.http import Http404
from djangorestframework_camel_case.parser import CamelCaseJSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError, get_default_image_generation_model
from system_settings.models import AIModel
from system_settings.newapi_images import NewApiImageClient
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result

from .generation import (
    load_generation_task, render_generation_prompt, save_generation_result,
    save_newapi_generation_result, sign_generation_task,
)
from .models import PromptTemplate
from .serializers import PromptUsageSerializer


def _owned_image_template(request, template_id: str) -> PromptTemplate:
    template = PromptTemplate.objects.filter(
        pk=template_id,
        user_id=get_current_user_identifier(request),
        is_valid=True,
        prompt_type=PromptTemplate.TYPE_IMAGE,
    ).first()
    if template is None:
        raise Http404
    return template


def _success_usage(usage):
    return success_result({'status': 'succeeded', 'usage': PromptUsageSerializer(usage).data})


class PromptGenerationJSONParser(CamelCaseJSONParser):
    # Field keys are user-defined identifiers, so inputValues must not be recursively snake-cased.
    json_underscoreize = {'ignore_fields': ('inputValues', 'input_values')}


class PromptGenerationStartView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [PromptGenerationJSONParser]

    def post(self, request, template_id):
        template = _owned_image_template(request, template_id)
        input_values = request.data.get('input_values', {})
        if not isinstance(input_values, dict):
            return valid_result(msg='生图字段值格式不正确', status=400)
        try:
            positive, negative, stored_values, combined_prompt = render_generation_prompt(template, input_values)
            model = get_default_image_generation_model()
            if model.provider.type == 'NewAPI':
                client = NewApiImageClient(model)
                result = client.generate(combined_prompt)
                usage = save_newapi_generation_result(
                    template=template, user_id=get_current_user_identifier(request), client=client,
                    result=result, input_values=stored_values, positive=positive, negative=negative,
                )
                return _success_usage(usage)
            client = GrsaiImageClient(model)
            result = client.generate(combined_prompt)
            if result.status == 'succeeded':
                try:
                    usage = save_generation_result(
                        template=template, user_id=get_current_user_identifier(request), client=client,
                        result=result, input_values=stored_values, positive=positive, negative=negative,
                    )
                    return _success_usage(usage)
                except GrsaiImageError as exc:
                    if not exc.retryable:
                        raise

            token = sign_generation_task(
                result=result, template=template, user_id=get_current_user_identifier(request),
                model_id=model.id, input_values=stored_values, positive=positive, negative=negative,
            )
            response = success_result({'status': 'pending', 'taskToken': token})
            response.status_code = 202
            return response
        except GrsaiImageError as exc:
            return valid_result(msg=str(exc), status=exc.status_code)


class PromptGenerationResultView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, template_id):
        template = _owned_image_template(request, template_id)
        token = request.data.get('task_token')
        if not isinstance(token, str) or not token or len(token) > 32_000:
            return valid_result(msg='生图任务凭证无效', status=400)
        try:
            payload = load_generation_task(token, user_id=get_current_user_identifier(request))
            if payload['template_id'] != template.id:
                return valid_result(msg='生图任务与提示词不匹配', status=403)
            model = AIModel.objects.select_related('provider').filter(pk=payload['model_id']).first()
            if model is None:
                raise GrsaiImageError('生图模型已删除，无法查询任务结果', status_code=400)
            if model.provider.type != 'Grsai':
                raise GrsaiImageError('仅 Grsai 的异步任务支持结果查询', status_code=400)
            client = GrsaiImageClient(model)
            result = client.get_result(payload['task_id'])
            if result.status == 'pending':
                response = success_result({'status': 'pending', 'taskToken': token})
                response.status_code = 202
                return response
            usage = save_generation_result(
                template=template, user_id=get_current_user_identifier(request), client=client,
                result=result, input_values=payload['input_values'],
                positive=payload['positive'], negative=payload['negative'],
            )
            return _success_usage(usage)
        except GrsaiImageError as exc:
            return valid_result(msg=str(exc), status=exc.status_code)
