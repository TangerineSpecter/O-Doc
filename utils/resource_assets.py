import logging
import os
import re
from urllib.parse import unquote, urlparse

from django.conf import settings


RESOURCE_VIEW_PREFIX = '/api/resource/view/'
RESOURCE_DOWNLOAD_PREFIX = '/api/resource/download/'
RESOURCE_URL_RE = re.compile(r'/api/resource/(?:view|download)/([^)\]\s"\'<>?#]+)')
logger = logging.getLogger(__name__)


def get_resource_view_url(resource_id):
    return f'{RESOURCE_VIEW_PREFIX}{resource_id}'


def extract_resource_id_from_url(url):
    if not url:
        return None

    path = unquote(urlparse(url).path)
    if path.startswith(RESOURCE_VIEW_PREFIX):
        resource_id = path[len(RESOURCE_VIEW_PREFIX):].strip('/')
        return resource_id or None

    if path.startswith(RESOURCE_DOWNLOAD_PREFIX):
        resource_id = path[len(RESOURCE_DOWNLOAD_PREFIX):].strip('/')
        return resource_id or None

    return None


def extract_resource_id_from_view_url(url):
    return extract_resource_id_from_url(url)


def extract_resource_ids_from_content(content):
    if not content:
        return set()

    return {
        unquote(match.group(1)).strip('/')
        for match in RESOURCE_URL_RE.finditer(content)
        if match.group(1).strip('/')
    }


def is_asset_used_by_article(resource_id, exclude_article_id=None):
    from article.models import Article

    queryset = Article.objects.filter(
        is_valid=True,
        content__contains=get_resource_view_url(resource_id),
    )
    if exclude_article_id:
        queryset = queryset.exclude(article_id=exclude_article_id)

    return queryset.exists()


def get_article_resource_usage(resource_ids=None):
    from article.models import Article

    usage = {}
    queryset = Article.objects.filter(
        is_valid=True,
        content__contains='/api/resource/',
    ).only('article_id', 'title', 'coll_id', 'content')

    resource_id_filter = set(resource_ids) if resource_ids is not None else None
    for article in queryset:
        for resource_id in extract_resource_ids_from_content(article.content):
            if resource_id_filter is not None and resource_id not in resource_id_filter:
                continue
            usage.setdefault(resource_id, {
                'id': article.article_id,
                'title': article.title,
                'collId': article.coll_id,
            })

    return usage


def sync_article_content_assets(article):
    from assets.models import Asset

    resource_ids = extract_resource_ids_from_content(article.content)
    Asset.objects.filter(
        linked_article=article,
        source_type='content',
    ).exclude(id__in=resource_ids).update(linked_article=None, is_linked=False)

    if resource_ids:
        Asset.objects.filter(
            id__in=resource_ids,
            is_valid=True,
            source_type='content',
        ).update(linked_article=article, is_linked=True)


def is_asset_used_by_image(resource_id, exclude_image_id=None):
    from article.models import Image

    queryset = Image.objects.filter(
        is_valid=True,
        image_url=get_resource_view_url(resource_id),
    )
    if exclude_image_id:
        queryset = queryset.exclude(image_id=exclude_image_id)

    return queryset.exists()


def get_image_resource_usage(resource_ids=None):
    from article.models import Image

    prefix = RESOURCE_VIEW_PREFIX
    queryset = Image.objects.filter(is_valid=True, image_url__startswith=prefix)

    usage = {}
    for image in queryset.only('image_id', 'title', 'coll_id', 'image_url'):
        resource_id = extract_resource_id_from_view_url(image.image_url)
        if not resource_id:
            continue
        if resource_ids is not None and resource_id not in resource_ids:
            continue
        usage.setdefault(resource_id, {
            'id': image.image_id,
            'title': image.title,
            'collId': image.coll_id,
        })

    return usage


def is_asset_used_by_agent(resource_id):
    from system_settings.models import Agent

    return Agent.objects.filter(avatar=get_resource_view_url(resource_id)).exists()


def get_agent_resource_usage(resource_ids=None):
    from system_settings.models import Agent

    prefix = RESOURCE_VIEW_PREFIX
    queryset = Agent.objects.filter(avatar__startswith=prefix)

    usage = {}
    for agent in queryset.only('id', 'name', 'avatar'):
        resource_id = extract_resource_id_from_view_url(agent.avatar)
        if not resource_id:
            continue
        if resource_ids is not None and resource_id not in resource_ids:
            continue
        usage.setdefault(resource_id, {
            'id': agent.id,
            'title': agent.name,
        })

    return usage


def delete_asset_physical_file(asset):
    if not asset.file_path:
        return

    file_abs_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
    try:
        if os.path.exists(file_abs_path):
            os.remove(file_abs_path)
    except Exception:
        logger.exception('Failed to delete resource file: path=%s', asset.file_path)


def delete_asset_record_and_file(asset):
    delete_asset_physical_file(asset)
    asset.delete()
