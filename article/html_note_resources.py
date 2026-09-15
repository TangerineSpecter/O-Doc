"""Reference-aware, transactional HTML resource reclamation."""
import logging

from django.db import transaction
from django.db.models import Q

from anthology.models import Anthology, Book
from article.html_note_service import media_path
from article.html_note_locking import lock_html_owner
from article.models import Article, ArticleAsset
from assets.models import Asset
from utils.resource_assets import is_asset_used_by_article, is_asset_used_by_image, is_asset_used_by_agent

logger = logging.getLogger(__name__)


def resource_shared(asset, article):
    return bool(ArticleAsset.objects.filter(asset=asset, article__is_valid=True).exclude(article=article).exists()
                or (asset.linked_article_id and asset.linked_article_id != article.pk and asset.linked_article.is_valid)
                or is_asset_used_by_article(asset.id, exclude_article_id=article.pk)
                or is_asset_used_by_image(asset.id) or is_asset_used_by_agent(asset.id)
                or Book.objects.filter(Q(asset=asset) | Q(cover_asset=asset), is_valid=True).exists())


def deletion_summary(article):
    assets = Asset.objects.filter(article_references__article=article, is_valid=True).distinct()
    exclusive = shared = 0
    for asset in assets:
        if not asset.metadata.get('html_import_owned') or resource_shared(asset, article):
            shared += 1
        elif asset.metadata.get('html_import_owned'):
            exclusive += 1
    return {'exclusive_count': exclusive, 'shared_count': shared}


def retry_html_cleanup():
    pending_ids = list(Asset.objects.filter(is_valid=False, metadata__html_import_owned=True, metadata__html_cleanup_pending=True).values_list('id', 'uploader'))
    for asset_id, owner in pending_ids:
        try:
            with transaction.atomic():
                lock_html_owner(owner)
                asset = Asset.objects.select_for_update().filter(pk=asset_id, is_valid=False, metadata__html_cleanup_pending=True).first()
                if not asset:
                    continue
                if (is_asset_used_by_article(asset.id) or is_asset_used_by_image(asset.id)
                        or is_asset_used_by_agent(asset.id)
                        or (asset.linked_article_id and asset.linked_article.is_valid)
                        or Book.objects.filter(Q(asset=asset) | Q(cover_asset=asset), is_valid=True).exists()):
                    asset.is_valid = True
                    asset.metadata = {k: v for k, v in asset.metadata.items() if k != 'html_cleanup_pending'}
                    asset.save()
                    continue
                if not Asset.objects.filter(file_path=asset.file_path).exclude(pk=asset.pk).exists():
                    media_path(asset.file_path).unlink(missing_ok=True)
                asset.delete()
        except (OSError, ValueError):
            logger.exception('HTML resource cleanup pending: asset_id=%s', asset_id)


def delete_html_note(article, owner):
    with transaction.atomic():
        lock_html_owner(owner)
        Anthology.objects.select_for_update().get(coll_id=article.coll_id, user_id=owner)
        article = Article.objects.select_for_update().get(pk=article.pk, author=owner)
        if not article.is_valid:
            return False
        if article.children.filter(is_valid=True).exists():
            raise ValueError('请先删除子文章。')
        asset_ids = ArticleAsset.objects.filter(article=article).values_list('asset_id', flat=True)
        assets = list(Asset.objects.select_for_update().filter(pk__in=asset_ids, is_valid=True).order_by('pk'))
        for asset in assets:
            if asset.metadata.get('html_import_owned') and not resource_shared(asset, article):
                asset.is_valid = False
                asset.is_linked = False
                asset.linked_article = None
                asset.metadata = {**asset.metadata, 'html_cleanup_pending': True}
                asset.save()
            elif asset.linked_article_id == article.pk:
                asset.linked_article = None
                asset.is_linked = False
                asset.save()
        article.asset_references.all().delete()
        article.is_valid = False
        article.save()
        transaction.on_commit(retry_html_cleanup)
        return True
