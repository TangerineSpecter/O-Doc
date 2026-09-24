"""图片智能搜索 HTTP 边界。"""

import logging

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from article.access import can_access_anthology, can_manage_anthology
from article.image_search_jobs import create_index_job, enqueue_edited_image_reindex, serialize_job
from article.image_search_service import (
    image_index_status, image_source_hash, image_source_hashes, rank_results, remove_image_index,
    search_by_uploaded_image, search_images, similar_images, visible_images,
)
from article.models import Image, ImageIndexJob, ImageVisualIndex
from article.serializers import ImageSerializer
from utils.drf_utils import get_current_user_identifier
from utils.rag_client import RagClient
from utils.response_utils import success_result, valid_result


logger = logging.getLogger(__name__)


def bounded_int(value, default, low, high):
    try:
        return min(max(int(value), low), high)
    except (TypeError, ValueError):
        return default


def result_items(rows):
    return [{'image': ImageSerializer(image).data, 'match_reason': reason} for image, _, reason in rows]


class ImageSmartSearchView(APIView):
    def post(self, request):
        query = str(request.data.get('query') or '').strip()
        coll_id = str(request.data.get('coll_id') or '').strip() or None
        if not query or len(query) > 300:
            return valid_result('请输入 1 至 300 字的搜索内容')
        if coll_id and not can_access_anthology(request, coll_id, 'image'):
            return valid_result('图片文集不存在或不可访问')
        page = bounded_int(request.data.get('page'), 1, 1, 1000)
        page_size = bounded_int(request.data.get('page_size'), 30, 1, 50)
        semantic_available = bool(request.user and request.user.is_authenticated and RagClient.get_embedding_model())
        try:
            if semantic_available:
                rows, has_more = search_images(request, query, coll_id=coll_id, page=page, page_size=page_size)
            else:
                rows, has_more = rank_results(request, [], query, coll_id, page, page_size)
        except Exception:
            logger.exception('Image semantic search failed')
            semantic_available = False
            rows, has_more = rank_results(request, [], query, coll_id, page, page_size)
        return success_result({'items': result_items(rows), 'page': page, 'has_more': has_more,
                               'semantic_available': semantic_available})


class ImageReferenceSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        coll_id = str(request.data.get('coll_id') or '').strip() or None
        if coll_id and not can_access_anthology(request, coll_id, 'image'):
            return valid_result('图片文集不存在或不可访问')
        uploaded = request.FILES.get('image')
        if not uploaded or uploaded.size > 10 * 1024 * 1024:
            return valid_result('请选择不超过 10 MB 的参考图片')
        if not RagClient.get_embedding_model():
            return valid_result('请先配置向量模型')
        try:
            rows = search_by_uploaded_image(request, uploaded.read(), coll_id=coll_id)
            return success_result({'items': result_items(rows)})
        except ValueError as exc:
            return valid_result(str(exc))
        except Exception:
            logger.exception('Reference image search failed')
            return valid_result('参考图识别或检索失败，请检查图像与向量模型配置')


class ImageSimilarView(APIView):
    def get(self, request, image_id):
        image = get_object_or_404(Image, pk=image_id, is_valid=True)
        if not can_access_anthology(request, image.coll_id, 'image'):
            return valid_result('图片不可访问')
        try:
            rows = similar_images(request, image, limit=bounded_int(request.GET.get('limit'), 8, 1, 20))
            return success_result({'items': result_items(rows)})
        except ValueError as exc:
            return valid_result(str(exc))
        except Exception:
            logger.exception('Similar image search failed: image=%s', image_id)
            return valid_result('相似图片暂不可用，请重建索引后重试')


class ImageIndexStatusView(APIView):
    def get(self, request, coll_id):
        if not can_access_anthology(request, coll_id, 'image'):
            return valid_result('图片文集不可访问')
        images = list(Image.objects.filter(coll_id=coll_id, is_valid=True))
        states = ImageVisualIndex.objects.filter(image_id__in=[image.pk for image in images]).in_bulk(field_name='image_id')
        model = RagClient.get_embedding_model()
        hashes = image_source_hashes(images)
        statuses = {image.pk: image_index_status(image, states.get(image.pk), model, source_hash=hashes[image.pk]) for image in images}
        can_manage = can_manage_anthology(request, coll_id, 'image')
        active = ImageIndexJob.objects.filter(coll_id=coll_id, state__in=['queued', 'running']).order_by('created_at').first() if can_manage else None
        return success_result({
            'total': len(images), 'indexed': sum(status == 'indexed' for status in statuses.values()),
            'statuses': statuses, 'job': serialize_job(active) if active else None,
            'can_manage': can_manage,
        })


class ImageVisualDetailView(APIView):
    def _image(self, request, image_id, manage=False):
        image = get_object_or_404(Image, pk=image_id, is_valid=True)
        allowed = can_manage_anthology(request, image.coll_id, 'image') if manage else can_access_anthology(request, image.coll_id, 'image')
        return image if allowed else None

    def get(self, request, image_id):
        image = self._image(request, image_id)
        if not image:
            return valid_result('图片不可访问')
        source_hash = image_source_hash(image)
        state = ImageVisualIndex.objects.filter(image=image).first()
        return success_result({
            'ai_description': image.ai_visual_description,
            'override': image.visual_description_override if image.visual_override_source_hash == source_hash else '',
            'status': image_index_status(image, state, RagClient.get_embedding_model()),
            'model': image.ai_visual_model,
            'error': state.error if state and state.enabled else '',
        })

    def put(self, request, image_id):
        image = self._image(request, image_id, manage=True)
        if not image:
            return valid_result('无权编辑图片')
        value = request.data.get('override')
        if not isinstance(value, str) or len(value) > 4000:
            return valid_result('视觉描述最多 4000 字')
        with transaction.atomic():
            image = Image.objects.select_for_update().filter(pk=image.pk, is_valid=True).first()
            if not image:
                return valid_result('图片不可访问')
            source_hash = image_source_hash(image) if value.strip() else ''
            changed = image.visual_description_override != value.strip() or image.visual_override_source_hash != source_hash
            image.visual_description_override = value.strip()
            image.visual_override_source_hash = source_hash
            if changed:
                image.save(update_fields=['visual_description_override', 'visual_override_source_hash', 'updated_at'])
            state = ImageVisualIndex.objects.filter(image=image, enabled=True).first()
            if state and changed:
                enqueue_edited_image_reindex(image.coll_id, get_current_user_identifier(request), image.pk)
        return success_result({'status': image_index_status(image, state, RagClient.get_embedding_model())})


class ImageIndexJobView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        coll_id = str(request.data.get('coll_id') or '').strip()
        owner = get_current_user_identifier(request)
        if not can_manage_anthology(request, coll_id, 'image'):
            return valid_result('无权管理这个图片文集')
        if not RagClient.get_embedding_model():
            return valid_result('请先配置向量模型')
        mode = request.data.get('mode') or 'reuse'
        if mode != 'index_only':
            from utils.ai_service import AIService
            try:
                AIService.get_default_image_client_config()
            except Exception:
                return valid_result('请先配置图像识别模型')
        try:
            job = create_index_job(coll_id, owner, request.data.get('image_ids'), mode)
            return success_result(serialize_job(job))
        except ValueError as exc:
            return valid_result(str(exc))

    def get(self, request):
        coll_id = str(request.GET.get('coll_id') or '').strip()
        if not can_manage_anthology(request, coll_id, 'image'):
            return valid_result('无权管理这个图片文集')
        jobs = ImageIndexJob.objects.filter(coll_id=coll_id, owner=get_current_user_identifier(request)).order_by('-created_at')[:5]
        return success_result([serialize_job(job) for job in jobs])


class ImageIndexJobCancelView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, job_id):
        job = get_object_or_404(ImageIndexJob, pk=job_id, owner=get_current_user_identifier(request))
        if not can_manage_anthology(request, job.coll_id, 'image'):
            return valid_result('无权管理这个图片文集')
        if job.state in {'queued', 'running'}:
            job.cancel_requested = True
            job.save(update_fields=['cancel_requested', 'updated_at'])
        return success_result(serialize_job(job))


class ImageIndexRemoveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        coll_id = str(request.data.get('coll_id') or '').strip()
        if not can_manage_anthology(request, coll_id, 'image'):
            return valid_result('无权管理这个图片文集')
        ids = request.data.get('image_ids')
        if not isinstance(ids, list) or not ids or len(ids) > 2000:
            return valid_result('请选择 1 至 2000 张图片')
        if ImageIndexJob.objects.filter(coll_id=coll_id, state__in=['queued', 'running']).exists():
            return valid_result('请等待当前索引任务结束后再移除')
        images = list(Image.objects.filter(coll_id=coll_id, is_valid=True, image_id__in=ids))
        if len(images) != len(set(ids)):
            return valid_result('所选图片无效')
        for image in images:
            remove_image_index(image)
        return success_result({'removed': len(images)})
