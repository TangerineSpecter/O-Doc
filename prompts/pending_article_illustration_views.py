"""Local recovery queue for generated article images whose download failed."""

import logging

from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from system_settings.grsai_images import GrsaiImageClient, GrsaiImageError
from system_settings.models import AIModel
from system_settings.newapi_images import NewApiImageClient
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result

from .article_illustration import save_first_grsai_illustration, save_first_newapi_illustration
from .article_illustration_views import _complete_grsai_illustration
from .models import PendingArticleIllustration


logger = logging.getLogger(__name__)


class PendingArticleIllustrationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        records = PendingArticleIllustration.objects.filter(
            user_id=get_current_user_identifier(request),
        ).values('id', 'status', 'image_url', 'preview_allowed', 'error_message', 'created_at')
        return success_result(list(records))


class PendingArticleIllustrationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pending_id: str):
        pending = PendingArticleIllustration.objects.filter(
            pk=pending_id, user_id=get_current_user_identifier(request),
        ).first()
        if pending is None:
            return valid_result(msg='待下载的文章配图不存在', status=404)
        try:
            if pending.status == 'generating':
                model = AIModel.objects.select_related('provider').filter(
                    pk=pending.model_id, type='image_generation', provider__type='Grsai',
                ).first()
                if model is None:
                    raise GrsaiImageError('生图模型已删除，无法查询任务结果', status_code=400)
                result = GrsaiImageClient(model).get_result(pending.task_id)
                if result.status == 'pending':
                    response = success_result({'status': 'pending', 'pending_id': pending.id})
                    response.status_code = 202
                    return response
                return _complete_grsai_illustration(
                    image_urls=result.image_urls, task_id=pending.task_id,
                    model_id=model.id, user_id=pending.user_id,
                )

            if pending.provider_type == 'NewAPI':
                model = AIModel.objects.select_related('provider').filter(
                    pk=pending.model_id, type='image_generation', provider__type='NewAPI',
                ).first()
                if model is None:
                    raise GrsaiImageError('生图模型已删除，无法下载原图', status_code=400)
                asset = save_first_newapi_illustration(
                    pending.image_url, NewApiImageClient(model),
                    user_id=pending.user_id, task_id=pending.task_id,
                )
            else:
                asset = save_first_grsai_illustration(
                    (pending.image_url,), user_id=pending.user_id, task_id=pending.task_id,
                )
        except GrsaiImageError as exc:
            if exc.status_code == 422 and pending.status == 'generating':
                pending.delete()
                return valid_result(msg=str(exc), status=exc.status_code)
            logger.error('Article illustration retry failed: task_id=%s reason=%s',
                         pending.task_id, str(exc))
            pending.error_message = str(exc)[:200]
            pending.save(update_fields=['error_message'])
            return valid_result(msg=str(exc), status=exc.status_code)
        except Exception:
            logger.exception('Article illustration retry failed unexpectedly: task_id=%s', pending.task_id)
            pending.error_message = '图片保存失败，请稍后重试'
            pending.save(update_fields=['error_message'])
            return valid_result(msg=pending.error_message, status=502)
        pending.delete()
        return success_result({'status': 'succeeded', 'asset': asset})

    def delete(self, request, pending_id: str):
        deleted, _ = PendingArticleIllustration.objects.filter(
            pk=pending_id, user_id=get_current_user_identifier(request),
        ).delete()
        if not deleted:
            return valid_result(msg='待下载的文章配图不存在', status=404)
        return success_result()
