"""Read-only projection of owned photo albums, preserving multi-photo groups."""
from collections import OrderedDict
from pathlib import Path
from django.conf import settings
from django.db.models import Count
from rest_framework.exceptions import NotFound, ValidationError
from anthology.models import Anthology
from article.models import Image
from assets.models import Asset
from utils.drf_utils import get_current_user_identifier
from utils.resource_assets import extract_resource_id_from_url
from utils.response_utils import success_result
from .diary_views import DiaryView


class DiaryPhotoLibraryView(DiaryView):
    http_method_names = ['get', 'head', 'options']

    def get(self, request):
        owner = get_current_user_identifier(request)
        albums = list(Anthology.objects.filter(user_id=owner, type='image', is_valid=True).order_by('title').values('coll_id', 'title'))
        counts = dict(Image.objects.filter(coll_id__in=[a['coll_id'] for a in albums], is_valid=True).values_list('coll_id').annotate(total=Count('pk')))
        collections = [{'id': album['coll_id'], 'title': album['title'], 'count': counts.get(album['coll_id'], 0)} for album in albums]
        coll_id = request.query_params.get('coll_id', '')
        if not coll_id:
            return success_result({'collections': collections, 'groups': [], 'page': 1, 'has_more': False})
        if coll_id not in {album['coll_id'] for album in albums}:
            raise NotFound('文集不存在或无权访问')
        try:
            page = max(1, int(request.query_params.get('page', 1)))
        except (TypeError, ValueError):
            raise ValidationError('页码无效')
        photos = list(Image.objects.filter(coll_id=coll_id, is_valid=True).only('image_id', 'title', 'description', 'tags', 'image_url', 'photo_group_id', 'group_index', 'created_at').order_by('-created_at', 'image_id'))
        photo_assets = {photo.pk: extract_resource_id_from_url(photo.image_url) for photo in photos}
        assets = {asset.pk: asset for asset in Asset.objects.filter(pk__in=[pk for pk in photo_assets.values() if pk], is_valid=True, file_type='image', uploader=owner)}
        grouped = OrderedDict()
        root = Path(settings.MEDIA_ROOT).resolve()
        keyword = request.query_params.get('keyword', '').strip().casefold()
        for photo in photos:
            key = photo.photo_group_id or photo.pk
            group = grouped.setdefault(key, {'id': key, 'title': photo.title, 'photos': [], '_matches': False})
            asset_id = photo_assets[photo.pk]
            asset = assets.get(asset_id)
            reason = ''
            if not asset_id:
                reason = '外链或历史图片需先导入资源库'
            elif not asset:
                reason = '资源已失效或非本人上传'
            else:
                target = (root / asset.file_path).resolve()
                if root not in target.parents or not target.is_file():
                    reason = '图片文件已不在本机'
            group['photos'].append({'image_id': photo.pk, 'asset_id': asset_id if asset else None, 'title': photo.title, 'selectable': not reason, 'reason': reason, '_order': photo.group_index})
            group['_matches'] |= not keyword or keyword in f'{photo.title}\n{photo.description}\n{photo.tags}'.casefold()
        groups = []
        for group in grouped.values():
            if not group.pop('_matches'):
                continue
            group['photos'].sort(key=lambda photo: (photo['_order'], photo['image_id']))
            for photo in group['photos']:
                photo.pop('_order')
            groups.append(group)
        start = (page - 1) * 12
        return success_result({'collections': collections, 'groups': groups[start:start + 12], 'page': page, 'has_more': start + 12 < len(groups)})
