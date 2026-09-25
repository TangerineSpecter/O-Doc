"""Authenticated endpoints for generating an illustration from selected article text."""

import logging
import uuid
from urllib.parse import urljoin

from djangorestframework_camel_case.parser import CamelCaseJSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError, get_default_image_generation_model
from system_settings.image_generation_options import resolve_image_generation_request, serialize_image_generation_options
from system_settings.models import AIModel
from system_settings.newapi_images import NewApiImageClient
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result, valid_result

from .article_illustration import (
    build_article_illustration_prompt,
    get_saved_article_illustration,
    load_article_illustration_task,
    remember_generating_article_illustration,
    remember_pending_article_illustration,
    save_first_grsai_illustration,
    save_first_newapi_illustration,
    sign_article_illustration_task,
)
from .models import PendingArticleIllustration


logger = logging.getLogger(__name__)


def _complete_grsai_illustration(*, image_urls: tuple[str, ...], task_id: str,
                                 model_id: str, user_id: str):
    try:
        asset = save_first_grsai_illustration(image_urls, user_id=user_id, task_id=task_id)
    except Exception as exc:
        if not image_urls:
            raise
        message = str(exc) if isinstance(exc, GrsaiImageError) else '生成成功，但图片保存失败'
        logger.error('Article illustration image save failed: task_id=%s reason=%s', task_id, message)
        pending = remember_pending_article_illustration(
            user_id=user_id, task_id=task_id, image_url=image_urls[0], error_message=message, model_id=model_id,
        )
        response = success_result({'status': 'download_pending', 'pending_id': pending.id})
        response.status_code = 202
        return response
    PendingArticleIllustration.objects.filter(user_id=user_id, task_id=task_id).delete()
    return success_result({'status': 'succeeded', 'asset': asset})


class ArticleIllustrationOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            model = get_default_image_generation_model()
            return success_result(serialize_image_generation_options(model, scene='article_illustration'))
        except GrsaiImageError as exc:
            return valid_result(msg=str(exc), status=exc.status_code)


class ArticleIllustrationStartView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [CamelCaseJSONParser]

    def post(self, request):
        selected_text = request.data.get('selected_text')
        if not isinstance(selected_text, str):
            return valid_result(msg='文章内容格式不正确', status=400)
        generation_options = request.data.get('generation_options', {})

        user_id = get_current_user_identifier(request)
        try:
            prompt = build_article_illustration_prompt(selected_text)
            model = get_default_image_generation_model()
            if model.provider.type == 'NewAPI':
                resolve_image_generation_request(model, generation_options, scene='article_illustration')
                client = NewApiImageClient(model)
                result = client.generate(prompt)
                image_data = result.images[0]
                task_id = uuid.uuid4().hex
                try:
                    asset = save_first_newapi_illustration(image_data, client, user_id=user_id, task_id=task_id)
                except Exception as exc:
                    if not isinstance(image_data, str):
                        raise
                    image_url = urljoin(f'{client.base_url}/', image_data)
                    message = str(exc) if isinstance(exc, GrsaiImageError) else '生成成功，但图片保存失败'
                    logger.error('New API article illustration image save failed: task_id=%s reason=%s',
                                 task_id, message)
                    pending = remember_pending_article_illustration(
                        user_id=user_id, task_id=task_id, image_url=image_url,
                        error_message=message, model_id=model.id, provider_type='NewAPI',
                    )
                    response = success_result({'status': 'download_pending', 'pending_id': pending.id})
                    response.status_code = 202
                    return response
                return success_result({'status': 'succeeded', 'asset': asset})

            client = GrsaiImageClient(model)
            image_parameters = resolve_image_generation_request(
                model,
                generation_options,
                scene='article_illustration',
            )
            result = client.generate(prompt, generation_options=image_parameters)
            if result.status == 'succeeded':
                return _complete_grsai_illustration(
                    image_urls=result.image_urls, user_id=user_id, task_id=result.task_id, model_id=model.id,
                )

            remember_generating_article_illustration(user_id=user_id, task_id=result.task_id, model_id=model.id)
            token = sign_article_illustration_task(
                task_id=result.task_id,
                model_id=model.id,
                user_id=user_id,
            )
            response = success_result({'status': 'pending', 'task_token': token})
            response.status_code = 202
            return response
        except GrsaiImageError as exc:
            return valid_result(msg=str(exc), status=exc.status_code)
        except ValueError as exc:
            return valid_result(msg=str(exc), status=400)
        except Exception:
            logger.exception('Article illustration generation failed: user_id=%s', user_id)
            return error_result(ErrorCode.SYSTEM_ERROR, status=500)


class ArticleIllustrationResultView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [CamelCaseJSONParser]

    def post(self, request):
        token = request.data.get('task_token')
        if not isinstance(token, str) or not token or len(token) > 32_000:
            return valid_result(msg='文章配图生成任务凭证无效', status=400)

        user_id = get_current_user_identifier(request)
        task_id = 'unknown'
        try:
            payload = load_article_illustration_task(token, user_id=user_id)
            task_id = payload['task_id']
            saved_asset = get_saved_article_illustration(task_id=payload['task_id'], user_id=user_id)
            if saved_asset:
                return success_result({'status': 'succeeded', 'asset': saved_asset})
            pending = PendingArticleIllustration.objects.filter(
                task_id=payload['task_id'], user_id=user_id,
            ).first()
            if pending and pending.status == 'download_pending':
                response = success_result({'status': 'download_pending', 'pending_id': pending.id})
                response.status_code = 202
                return response
            model = AIModel.objects.select_related('provider').filter(
                pk=payload['model_id'],
                type='image_generation',
            ).first()
            if model is None:
                raise GrsaiImageError('生图模型已删除，无法查询文章配图任务', status_code=400)
            if model.provider.type != 'Grsai':
                raise GrsaiImageError('当前生图服务不支持异步结果查询', status_code=400)

            client = GrsaiImageClient(model)
            result = client.get_result(payload['task_id'])
            if result.status == 'pending':
                response = success_result({'status': 'pending', 'task_token': token})
                response.status_code = 202
                return response

            return _complete_grsai_illustration(
                image_urls=result.image_urls, user_id=user_id, task_id=payload['task_id'], model_id=model.id,
            )
        except GrsaiImageError as exc:
            if exc.status_code == 422 and task_id != 'unknown':
                PendingArticleIllustration.objects.filter(user_id=user_id, task_id=task_id, status='generating').delete()
            return valid_result(msg=str(exc), status=exc.status_code)
        except Exception:
            logger.exception('Article illustration result retrieval failed: task_id=%s', task_id)
            return error_result(ErrorCode.SYSTEM_ERROR, status=500)
