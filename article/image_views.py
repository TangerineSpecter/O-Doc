import logging
import mimetypes

from django.db import models, transaction
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView

from anthology.models import Anthology
from article.access import can_access_anthology, can_manage_anthology
from article.image_service import (
    build_image_data_url,
    build_image_description_data_url,
    compress_image_data_url,
)
from article.models import Image
from article.serializers import ImageSerializer
from assets.models import Asset
from utils.ai_service import AIService
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.resource_assets import (
    delete_asset_record_and_file,
    extract_resource_id_from_view_url,
    is_asset_used_by_image,
)
from utils.response_utils import error_result, success_result


logger = logging.getLogger(__name__)


class ImageListView(APIView):
    """
    图片列表视图 - 获取指定文集下的所有图片
    """

    def get(self, request, coll_id):
        try:
            if not can_access_anthology(request, coll_id, 'image'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            # 获取文集下的所有有效图片
            images = Image.objects.filter(
                is_valid=True,
                coll_id=coll_id
            ).annotate(
                sort_time=Coalesce('shooting_time', 'created_at')
            ).order_by('-sort_time', '-created_at')

            serializer = ImageSerializer(images, many=True)
            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageDetailView(APIView):
    """
    图片详情视图 - 获取单张图片详情
    """

    def get(self, request, image_id):
        try:
            image = get_object_or_404(Image, image_id=image_id, is_valid=True)
            if not can_access_anthology(request, image.coll_id, 'image'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            serializer = ImageSerializer(image)
            return success_result(data=serializer.data)

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageCreateView(APIView):
    """
    创建图片
    """

    def post(self, request):
        try:
            serializer = ImageSerializer(data=request.data)
            if serializer.is_valid():
                if not can_manage_anthology(request, serializer.validated_data['coll_id'], 'image'):
                    return error_result(ErrorCode.RESOURCE_NOT_FOUND)
                image = serializer.save(author=get_current_user_identifier(request))

                # 更新文集计数
                anthology_queryset = Anthology.objects.filter(coll_id=image.coll_id)
                from system_settings.sync_state import record_bulk_change
                record_bulk_change(anthology_queryset)
                anthology_queryset.update(count=models.F('count') + 1)

                return success_result(data=ImageSerializer(image).data)
            else:
                # 改进错误信息返回
                errors = serializer.errors
                error_msg = {field: str(error[0]) if isinstance(error, list) else str(error) for field, error in errors.items()}
                logger.error(f"Image validation errors: {error_msg}")
                return error_result(ErrorCode.PARAM_ERROR, error_msg)

        except Exception as e:
            logger.error(f"Image create error: {str(e)}", exc_info=True)
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageGroupCreateView(APIView):
    """原子创建一组共享元数据、焦段独立的照片。"""

    def post(self, request):
        try:
            payload = request.data.copy()
            coll_id = payload.get('coll_id') or payload.get('collId')
            photos = payload.get('photos') or []
            if not coll_id or not isinstance(photos, list) or not photos:
                return error_result(ErrorCode.PARAM_ERROR, '请至少提供一张照片')
            if not can_manage_anthology(request, coll_id, 'image'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)

            from utils.id_generator import generate_unique_id
            group_id = generate_unique_id('pgrp') if len(photos) > 1 else ''
            shared = {
                'title': payload.get('title', ''), 'description': payload.get('description', ''),
                'coll_id': coll_id, 'shooting_time': payload.get('shooting_time') or payload.get('shootingTime'),
                'country': payload.get('country', ''), 'city': payload.get('city', ''),
                'place_name': payload.get('place_name') or payload.get('placeName') or '',
                'location_id': payload.get('location_id') or payload.get('locationId') or '',
                'tags': payload.get('tags', ''),
            }
            existing_ids = [str(photo.get('image_id') or photo.get('imageId') or '').strip() for photo in photos]
            existing_ids = [image_id for image_id in existing_ids if image_id]
            if len(existing_ids) != len(set(existing_ids)):
                return error_result(ErrorCode.PARAM_ERROR, '同一张照片不能重复加入拍摄组')
            existing_images = {
                image.image_id: image
                for image in Image.objects.filter(
                    image_id__in=existing_ids,
                    coll_id=coll_id,
                    author=get_current_user_identifier(request),
                    is_valid=True,
                )
            }
            if len(existing_images) != len(existing_ids):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND, '待转换的图片不存在')
            created = []
            with transaction.atomic():
                for index, photo in enumerate(photos):
                    data = {
                        **shared,
                        'image_url': photo.get('image_url') or photo.get('imageUrl') or '',
                        'focal_length': str(photo.get('focal_length') or photo.get('focalLength') or '').strip(),
                        'photo_group_id': group_id,
                        'group_index': index,
                    }
                    existing_id = str(photo.get('image_id') or photo.get('imageId') or '').strip()
                    if existing_id:
                        existing = existing_images[existing_id]
                        serializer = ImageSerializer(existing, data=data, partial=True)
                        serializer.is_valid(raise_exception=True)
                        created.append(serializer.save())
                    else:
                        serializer = ImageSerializer(data=data)
                        serializer.is_valid(raise_exception=True)
                        created.append(serializer.save(author=get_current_user_identifier(request)))
                anthology_queryset = Anthology.objects.filter(coll_id=coll_id)
                from system_settings.sync_state import record_bulk_change
                record_bulk_change(anthology_queryset)
                anthology_queryset.update(count=models.F('count') + len(photos) - len(existing_ids))
            return success_result(data=ImageSerializer(created, many=True).data)
        except Exception as e:
            logger.error('Image group create error: %s', e, exc_info=True)
            return error_result(ErrorCode.PARAM_ERROR, str(e))


def cleanup_group_image_assets(images):
    """软删除组内照片后，清理不再被任何图片引用的资源文件。"""
    for image in images:
        resource_id = extract_resource_id_from_view_url(image.image_url)
        if not resource_id or is_asset_used_by_image(resource_id, exclude_image_id=image.image_id):
            continue
        asset = Asset.objects.filter(id=resource_id, is_valid=True, linked_article__isnull=True).first()
        if asset:
            delete_asset_record_and_file(asset)


class ImageGroupUpdateView(APIView):
    """同步更新组共享字段、组内排序及每张焦段。"""

    def put(self, request, group_id):
        try:
            owner = get_current_user_identifier(request)
            images = list(Image.objects.filter(photo_group_id=group_id, author=owner, is_valid=True).order_by('group_index'))
            if not images or not can_manage_anthology(request, images[0].coll_id, 'image'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            payload = request.data.copy()
            photos = payload.get('photos') or []
            if not isinstance(photos, list) or not photos:
                return error_result(ErrorCode.PARAM_ERROR, '请至少保留一张照片')
            photo_map = {str(photo.get('image_id') or photo.get('imageId')): photo for photo in photos}
            shared_keys = ('title', 'description', 'shooting_time', 'country', 'city', 'place_name', 'location_id', 'tags')
            with transaction.atomic():
                # 移除未提交的组内照片；前端用这一行为实现单张移除。
                retained_ids = {image_id for image_id in photo_map if image_id and image_id != 'None'}
                removed = [image for image in images if image.image_id not in retained_ids]
                for image in removed:
                    image.is_valid = False
                    image.save(update_fields=['is_valid', 'updated_at'])
                for image in images:
                    if image.image_id not in retained_ids:
                        continue
                    photo = photo_map.get(image.image_id, {})
                    data = {key: payload.get(key) for key in shared_keys if key in payload}
                    if 'shootingTime' in payload: data['shooting_time'] = payload['shootingTime']
                    if 'placeName' in payload: data['place_name'] = payload['placeName']
                    if 'locationId' in payload: data['location_id'] = payload['locationId']
                    data['focal_length'] = str(photo.get('focal_length', photo.get('focalLength', image.focal_length))).strip()
                    data['group_index'] = int(photo.get('group_index', photo.get('groupIndex', image.group_index)))
                    serializer = ImageSerializer(image, data=data, partial=True)
                    serializer.is_valid(raise_exception=True)
                    serializer.save()
                # 无 imageId 的照片是编辑时新增的照片。
                for index, photo in enumerate(photos):
                    if photo.get('image_id') or photo.get('imageId'):
                        continue
                    data = {
                        'title': payload.get('title', images[0].title),
                        'description': payload.get('description', images[0].description),
                        'coll_id': images[0].coll_id,
                        'shooting_time': payload.get('shooting_time') or payload.get('shootingTime') or images[0].shooting_time,
                        'country': payload.get('country', images[0].country), 'city': payload.get('city', images[0].city),
                        'place_name': payload.get('place_name') or payload.get('placeName') or images[0].place_name,
                        'location_id': payload.get('location_id') or payload.get('locationId') or '',
                        'tags': payload.get('tags', images[0].tags),
                        'image_url': photo.get('image_url') or photo.get('imageUrl') or '',
                        'focal_length': str(photo.get('focal_length') or photo.get('focalLength') or '').strip(),
                        'photo_group_id': group_id, 'group_index': index,
                    }
                    serializer = ImageSerializer(data=data)
                    serializer.is_valid(raise_exception=True)
                    serializer.save(author=owner)
                current = Image.objects.filter(photo_group_id=group_id, is_valid=True)
                if current.count() == 1:
                    from system_settings.sync_state import record_bulk_change
                    record_bulk_change(current)
                    current.update(photo_group_id='', group_index=0)
                anthology_queryset = Anthology.objects.filter(coll_id=images[0].coll_id)
                from system_settings.sync_state import record_bulk_change
                record_bulk_change(anthology_queryset)
                anthology_queryset.update(count=models.F('count') - len(removed) + sum(1 for photo in photos if not (photo.get('image_id') or photo.get('imageId'))))
            cleanup_group_image_assets(removed)
            refreshed = Image.objects.filter(photo_group_id=group_id, is_valid=True).order_by('group_index')
            if not refreshed.exists():
                # 组内只剩一张时已降级为普通图片，仍需在更新响应中返回它。
                refreshed = Image.objects.filter(
                    image_id__in=retained_ids,
                    is_valid=True,
                ).order_by('group_index')
            return success_result(data=ImageSerializer(refreshed, many=True).data)
        except Exception as e:
            logger.error('Image group update error: %s', e, exc_info=True)
            return error_result(ErrorCode.PARAM_ERROR, str(e))


class ImageGroupDeleteView(APIView):
    def delete(self, request, group_id):
        try:
            owner = get_current_user_identifier(request)
            images = list(Image.objects.filter(photo_group_id=group_id, author=owner, is_valid=True))
            if not images or not can_manage_anthology(request, images[0].coll_id, 'image'):
                return error_result(ErrorCode.RESOURCE_NOT_FOUND)
            with transaction.atomic():
                for image in images:
                    image.is_valid = False
                    image.save(update_fields=['is_valid', 'updated_at'])
                anthology_queryset = Anthology.objects.filter(coll_id=images[0].coll_id)
                from system_settings.sync_state import record_bulk_change
                record_bulk_change(anthology_queryset)
                anthology_queryset.update(count=models.F('count') - len(images))
            cleanup_group_image_assets(images)
            return success_result(msg='删除成功')
        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageUpdateView(APIView):
    """
    更新图片
    """

    def put(self, request, image_id):
        try:
            image = get_object_or_404(Image, image_id=image_id, author=get_current_user_identifier(request), is_valid=True)
            serializer = ImageSerializer(image, data=request.data, partial=True)
            if serializer.is_valid():
                target_coll_id = serializer.validated_data.get('coll_id', image.coll_id)
                if not can_manage_anthology(request, target_coll_id, 'image'):
                    return error_result(ErrorCode.RESOURCE_NOT_FOUND)
                serializer.save()
                return success_result(data=serializer.data)
            else:
                return error_result(ErrorCode.PARAM_ERROR, str(serializer.errors))

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class ImageDescriptionGenerateView(APIView):
    """
    AI 生成图片描述说明
    """

    def post(self, request):
        try:
            title = (request.data.get('title') or '').strip()
            country = (request.data.get('country') or '').strip()
            city = (request.data.get('city') or '').strip()
            place_name = (request.data.get('placeName') or request.data.get('place_name') or '').strip()
            location = ' / '.join([item for item in [country, city, place_name] if item])
            image_data = request.data.get('imageData') or request.data.get('image_data')
            image_url = request.data.get('imageUrl') or request.data.get('image_url')
            uploaded_image = request.FILES.get('image')

            image_data_url = None
            if uploaded_image:
                mime_type = uploaded_image.content_type or mimetypes.guess_type(uploaded_image.name)[0] or 'image/jpeg'
                image_data_url = build_image_description_data_url(uploaded_image.read(), mime_type)

            if not image_data_url and isinstance(image_data, str) and image_data.startswith('data:image/'):
                image_data_url = compress_image_data_url(image_data)
            if not image_data_url and image_url:
                image_data_url = build_image_data_url(image_url)

            if not image_data_url:
                return error_result(ErrorCode.PARAM_ERROR, '请先选择图片')

            logger.warning(
                "Calling image description model: image_data_url=%d chars, title=%s, location=%s",
                len(image_data_url),
                title or '未填写',
                location or '未填写',
            )

            description = AIService.image_description(
                image_data_url=image_data_url,
                title=title,
                location=location
            )

            if not description:
                return error_result(ErrorCode.AI_SERVICE_ERROR, 'AI 未生成描述')

            return success_result({'description': description})
        except ValueError as e:
            return error_result(ErrorCode.AI_SERVICE_ERROR, str(e))
        except Exception as e:
            logger.error(f"Image description generation error: {str(e)}", exc_info=True)
            return error_result(ErrorCode.AI_SERVICE_ERROR)


class ImageDeleteView(APIView):
    """
    删除图片（软删除）
    """

    def delete(self, request, image_id):
        try:
            image = get_object_or_404(Image, image_id=image_id, author=get_current_user_identifier(request), is_valid=True)
            resource_id = extract_resource_id_from_view_url(image.image_url)
            image.is_valid = False
            image.save()

            # 组内仅剩一张时降级为普通单图，避免留下没有意义的拍摄组标识。
            if image.photo_group_id:
                remaining = Image.objects.filter(
                    photo_group_id=image.photo_group_id,
                    coll_id=image.coll_id,
                    is_valid=True,
                )
                if remaining.count() == 1:
                    from system_settings.sync_state import record_bulk_change
                    record_bulk_change(remaining)
                    remaining.update(photo_group_id='', group_index=0)

            if resource_id and not is_asset_used_by_image(resource_id, exclude_image_id=image.image_id):
                from assets.models import Asset

                asset = Asset.objects.filter(id=resource_id, is_valid=True, linked_article__isnull=True).first()
                if asset:
                    delete_asset_record_and_file(asset)

            # 更新文集计数
            anthology_queryset = Anthology.objects.filter(coll_id=image.coll_id)
            from system_settings.sync_state import record_bulk_change
            record_bulk_change(anthology_queryset)
            anthology_queryset.update(count=models.F('count') - 1)

            return success_result(msg="删除成功")

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))
