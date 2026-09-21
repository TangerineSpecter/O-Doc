from collections.abc import Iterable

from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView

from assets.models import Asset
from utils.drf_utils import get_current_user_identifier
from utils.resource_assets import (
    delete_asset_record_and_file, is_asset_used_by_agent, is_asset_used_by_article,
    is_asset_used_by_image,
)
from utils.response_utils import error_result, success_result

from .models import (
    PromptCategory, PromptResultImage, PromptTag, PromptTemplate, PromptTemplateTag,
    PromptTemplateTheme, PromptTheme, PromptUsage,
)
from .rendering import render_template
from .serializers import (
    PromptCategorySerializer, PromptResultImageSerializer, PromptTagSerializer,
    PromptTemplateSerializer, PromptThemeSerializer, PromptUsageSerializer,
)


TAXONOMIES = {
    'categories': (PromptCategory, PromptCategorySerializer),
    'themes': (PromptTheme, PromptThemeSerializer),
    'tags': (PromptTag, PromptTagSerializer),
}


def get_taxonomy(kind):
    taxonomy = TAXONOMIES.get(kind)
    if taxonomy is None:
        raise Http404
    return taxonomy


def current_templates(request, include_deleted=False):
    queryset = PromptTemplate.objects.filter(user_id=get_current_user_identifier(request)).select_related('category', 'cover_result_image').prefetch_related('themes', 'tags')
    return queryset if include_deleted else queryset.filter(is_valid=True)


def current_usage(request, usage_id, include_deleted=False):
    queryset = PromptUsage.objects.filter(template__user_id=get_current_user_identifier(request)).select_related('template').prefetch_related('result_images__asset')
    if not include_deleted:
        queryset = queryset.filter(is_valid=True)
    return get_object_or_404(queryset, id=usage_id)


def parse_ids(value) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def remove_orphan_prompt_assets(asset_ids: list[str]) -> None:
    """Purge only prompt uploads that no prompt-result relation still references."""
    from article.models import Book
    for asset in Asset.objects.filter(id__in=asset_ids, source_type='prompt'):
        is_reused = (
            is_asset_used_by_article(asset.id)
            or is_asset_used_by_image(asset.id)
            or is_asset_used_by_agent(asset.id)
            or Book.objects.filter(Q(asset=asset) | Q(cover_asset=asset), is_valid=True).exists()
        )
        if not is_reused and not PromptResultImage.objects.filter(asset_id=asset.id).exists():
            delete_asset_record_and_file(asset)


def sync_relations(template: PromptTemplate, user_id: str, theme_ids: Iterable[str], tag_ids: Iterable[str]) -> None:
    themes = list(PromptTheme.objects.filter(id__in=set(theme_ids), user_id=user_id, is_valid=True))
    tags = list(PromptTag.objects.filter(id__in=set(tag_ids), user_id=user_id, is_valid=True))
    if len(themes) != len(set(theme_ids)) or len(tags) != len(set(tag_ids)):
        raise ValidationError({'themeIds': '主题或标签不存在'})
    PromptTemplateTheme.objects.filter(template=template).exclude(theme__in=themes).delete()
    PromptTemplateTag.objects.filter(template=template).exclude(tag__in=tags).delete()
    for theme in themes:
        PromptTemplateTheme.objects.get_or_create(template=template, theme=theme)
    for tag in tags:
        PromptTemplateTag.objects.get_or_create(template=template, tag=tag)


class PromptTemplateListView(APIView):
    def get(self, request):
        query = current_templates(request)
        keyword = (request.GET.get('keyword') or '').strip()
        if keyword:
            query = query.filter(
                Q(title__icontains=keyword) | Q(description__icontains=keyword) |
                Q(positive_template__icontains=keyword) | Q(negative_template__icontains=keyword) |
                Q(category__name__icontains=keyword) | Q(themes__name__icontains=keyword) | Q(tags__name__icontains=keyword)
            ).distinct()
        if request.GET.get('type'):
            query = query.filter(prompt_type=request.GET['type'])
        if request.GET.get('category_id'):
            query = query.filter(category_id=request.GET['category_id'])
        theme_ids = [value for value in (request.GET.getlist('theme_id') or request.GET.getlist('theme_id[]')) if value]
        tag_ids = [value for value in (request.GET.getlist('tag_id') or request.GET.getlist('tag_id[]')) if value]
        if theme_ids:
            query = query.filter(themes__id__in=theme_ids).distinct()
        if tag_ids:
            query = query.filter(tags__id__in=tag_ids).distinct()
        if request.GET.get('favorite') == 'true':
            query = query.filter(is_favorite=True)
        ordering = request.GET.get('ordering', 'updated')
        query = query.order_by('title' if ordering == 'title' else '-created_at' if ordering == 'created' else '-updated_at')
        page = max(int(request.GET.get('page', 1)), 1)
        page_size = min(max(int(request.GET.get('page_size', 24)), 1), 100)
        total = query.count()
        items = list(query[(page - 1) * page_size: page * page_size])
        return success_result({'list': PromptTemplateSerializer(items, many=True).data, 'total': total, 'page': page, 'pageSize': page_size, 'hasMore': page * page_size < total})

    def post(self, request):
        serializer = PromptTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = get_current_user_identifier(request)
        with transaction.atomic():
            category_id = request.data.get('category_id')
            category = None
            if category_id:
                category = get_object_or_404(PromptCategory, id=category_id, user_id=user_id, is_valid=True)
            serializer.validated_data.pop('category_id', None)
            serializer.validated_data.pop('theme_ids', None)
            serializer.validated_data.pop('tag_ids', None)
            template = serializer.save(user_id=user_id, category=category)
            sync_relations(template, user_id, parse_ids(request.data.get('theme_ids')), parse_ids(request.data.get('tag_ids')))
        return success_result(PromptTemplateSerializer(current_templates(request).get(id=template.id)).data)


class PromptTemplateDetailView(APIView):
    def get(self, request, template_id):
        template = get_object_or_404(current_templates(request), id=template_id)
        data = PromptTemplateSerializer(template).data
        data['usages'] = PromptUsageSerializer(template.usages.filter(is_valid=True).prefetch_related('result_images__asset'), many=True).data
        return success_result(data)

    def put(self, request, template_id):
        template = get_object_or_404(current_templates(request), id=template_id)
        serializer = PromptTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user_id = get_current_user_identifier(request)
        with transaction.atomic():
            category = template.category
            if 'category_id' in request.data:
                category = get_object_or_404(PromptCategory, id=request.data.get('category_id'), user_id=user_id, is_valid=True) if request.data.get('category_id') else None
            serializer.validated_data.pop('category_id', None)
            serializer.validated_data.pop('theme_ids', None)
            serializer.validated_data.pop('tag_ids', None)
            template = serializer.save(category=category)
            if 'theme_ids' in request.data or 'tag_ids' in request.data:
                sync_relations(template, user_id, parse_ids(request.data.get('theme_ids', [item.id for item in template.themes.all()])), parse_ids(request.data.get('tag_ids', [item.id for item in template.tags.all()])))
        return success_result(PromptTemplateSerializer(current_templates(request).get(id=template.id)).data)

    def delete(self, request, template_id):
        template = get_object_or_404(current_templates(request), id=template_id)
        now = timezone.now()
        template.is_valid = False
        template.deleted_at = now
        template.save(update_fields=['is_valid', 'deleted_at', 'updated_at'])
        return success_result()


class PromptTemplateRestoreView(APIView):
    def post(self, request, template_id):
        template = get_object_or_404(current_templates(request, include_deleted=True), id=template_id, is_valid=False)
        template.is_valid = True
        template.deleted_at = None
        template.save(update_fields=['is_valid', 'deleted_at', 'updated_at'])
        return success_result(PromptTemplateSerializer(template).data)


class PromptTemplatePurgeView(APIView):
    def delete(self, request, template_id):
        template = get_object_or_404(current_templates(request, include_deleted=True), id=template_id, is_valid=False)
        asset_ids = list(PromptResultImage.objects.filter(usage__template=template).values_list('asset_id', flat=True))
        template.delete()
        remove_orphan_prompt_assets(asset_ids)
        return success_result()


class PromptTemplateCoverView(APIView):
    def put(self, request, template_id):
        template = get_object_or_404(current_templates(request), id=template_id)
        image_id = request.data.get('image_id')
        image = get_object_or_404(PromptResultImage, id=image_id, usage__template=template, usage__is_valid=True) if image_id else None
        template.cover_result_image = image
        template.save(update_fields=['cover_result_image', 'updated_at'])
        return success_result(PromptTemplateSerializer(template).data)


class PromptUsageView(APIView):
    def post(self, request, template_id):
        template = get_object_or_404(current_templates(request), id=template_id)
        asset_ids = parse_ids(request.data.get('asset_ids'))
        if not asset_ids or len(asset_ids) > 12:
            raise ValidationError({'assetIds': '请上传 1 至 12 张效果图'})
        if len(asset_ids) != len(set(asset_ids)):
            raise ValidationError({'assetIds': '效果图片不能重复选择'})
        user_id = get_current_user_identifier(request)
        assets = list(Asset.objects.filter(id__in=set(asset_ids), uploader=user_id, is_valid=True, file_type='image'))
        if len(assets) != len(set(asset_ids)):
            raise ValidationError({'assetIds': '存在不可用或不属于你的图片资源'})
        allowed_mimes = {'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'}
        if any(asset.mime_type not in allowed_mimes for asset in assets):
            raise ValidationError({'assetIds': '效果记录只支持常见图片格式'})
        positive, stored_values = render_template(template.positive_template, template.field_schema, request.data.get('input_values'))
        negative, _ = render_template(template.negative_template, template.field_schema, request.data.get('input_values'))
        with transaction.atomic():
            usage = PromptUsage.objects.create(
                template=template, input_values=stored_values, rendered_positive=positive, rendered_negative=negative,
                model_name=str(request.data.get('model_name') or '')[:120], note=str(request.data.get('note') or '')[:500],
                source_url=str(request.data.get('source_url') or '')[:500],
            )
            asset_map = {asset.id: asset for asset in assets}
            for index, asset_id in enumerate(asset_ids):
                asset = asset_map[asset_id]
                asset.source_type = 'prompt'
                asset.is_linked = True
                asset.save(update_fields=['source_type', 'is_linked', 'update_time'])
                PromptResultImage.objects.create(usage=usage, asset=asset, sort=index)
        return success_result(PromptUsageSerializer(usage).data)


class PromptUsageDetailView(APIView):
    def put(self, request, usage_id):
        usage = current_usage(request, usage_id)
        usage.note = str(request.data.get('note', usage.note))[:500]
        usage.model_name = str(request.data.get('model_name', usage.model_name))[:120]
        usage.source_url = str(request.data.get('source_url', usage.source_url))[:500]
        usage.save(update_fields=['note', 'model_name', 'source_url', 'updated_at'])
        return success_result(PromptUsageSerializer(usage).data)

    def delete(self, request, usage_id):
        usage = current_usage(request, usage_id)
        usage.is_valid = False
        usage.deleted_at = timezone.now()
        usage.save(update_fields=['is_valid', 'deleted_at', 'updated_at'])
        return success_result()


class PromptUsageRestoreView(APIView):
    def post(self, request, usage_id):
        usage = current_usage(request, usage_id, include_deleted=True)
        if not usage.template.is_valid:
            raise ValidationError({'usage': '请先恢复所属提示词'})
        usage.is_valid = True
        usage.deleted_at = None
        usage.save(update_fields=['is_valid', 'deleted_at', 'updated_at'])
        return success_result(PromptUsageSerializer(usage).data)


class PromptUsagePurgeView(APIView):
    def delete(self, request, usage_id):
        usage = current_usage(request, usage_id, include_deleted=True)
        if usage.is_valid:
            raise ValidationError({'usage': '只能彻底删除回收站内的效果记录'})
        asset_ids = list(usage.result_images.values_list('asset_id', flat=True))
        usage.delete()
        remove_orphan_prompt_assets(asset_ids)
        return success_result()


class PromptTrashView(APIView):
    def get(self, request):
        template_data = PromptTemplateSerializer(current_templates(request, include_deleted=True).filter(is_valid=False), many=True).data
        usages = PromptUsage.objects.filter(template__user_id=get_current_user_identifier(request), is_valid=False).prefetch_related('result_images__asset')
        return success_result({'templates': template_data, 'usages': PromptUsageSerializer(usages, many=True).data})


class PromptTaxonomyListView(APIView):
    def get(self, request, kind):
        model, serializer_class = get_taxonomy(kind)
        items = model.objects.filter(user_id=get_current_user_identifier(request), is_valid=True).order_by('sort', 'name')
        return success_result(serializer_class(items, many=True).data)

    def post(self, request, kind):
        model, serializer_class = get_taxonomy(kind)
        user_id = get_current_user_identifier(request)
        name = str(request.data.get('name') or '').strip()
        if not name:
            raise ValidationError({'name': '名称不能为空'})
        item = model.objects.filter(user_id=user_id, name=name).first()
        if item:
            item.is_valid = True
            item.description = str(request.data.get('description') or item.description)[:200]
            item.color = str(request.data.get('color') or item.color)[:20]
            item.save()
        else:
            item = model.objects.create(user_id=user_id, name=name[:50], description=str(request.data.get('description') or '')[:200], color=str(request.data.get('color') or 'orange')[:20])
        return success_result(serializer_class(item).data)


class PromptTaxonomyDetailView(APIView):
    def put(self, request, kind, item_id):
        model, serializer_class = get_taxonomy(kind)
        item = get_object_or_404(model, id=item_id, user_id=get_current_user_identifier(request), is_valid=True)
        for field, limit in [('name', 50), ('description', 200), ('color', 20)]:
            if field in request.data:
                value = str(request.data[field]).strip()[:limit]
                if field == 'name' and not value:
                    raise ValidationError({'name': '名称不能为空'})
                setattr(item, field, value)
        if 'sort' in request.data:
            item.sort = int(request.data['sort'])
        item.save()
        return success_result(serializer_class(item).data)

    def delete(self, request, kind, item_id):
        model, _ = get_taxonomy(kind)
        item = get_object_or_404(model, id=item_id, user_id=get_current_user_identifier(request), is_valid=True)
        item.is_valid = False
        item.save(update_fields=['is_valid', 'updated_at'])
        return success_result()
