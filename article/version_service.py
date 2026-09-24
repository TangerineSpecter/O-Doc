"""Article history snapshot creation and retention rules."""
from django.db.models import Count

from article.models import Article, ArticleVersion
from tags.models import Tag

ARTICLE_VERSION_RETENTION = 5


def enforce_article_version_retention(article_ids=None) -> int:
    """Keep only the newest five snapshots per article; deletions create sync tombstones."""
    versions = ArticleVersion.objects.all()
    if article_ids is not None:
        article_ids = list({str(article_id) for article_id in article_ids})
        if not article_ids:
            return 0
        versions = versions.filter(article_id__in=article_ids)

    article_ids_to_prune = versions.values('article_id').annotate(
        version_count=Count('version_id'),
    ).filter(version_count__gt=ARTICLE_VERSION_RETENTION).values_list('article_id', flat=True)

    deleted_count = 0
    for article_id in article_ids_to_prune:
        keep_ids = list(
            ArticleVersion.objects.filter(article_id=article_id)
            .order_by('-created_at', '-version_id')
            .values_list('version_id', flat=True)[:ARTICLE_VERSION_RETENTION]
        )
        deleted, _ = ArticleVersion.objects.filter(article_id=article_id).exclude(
            version_id__in=keep_ids,
        ).delete()
        deleted_count += deleted
    return deleted_count


def has_versionable_changes(article: Article, changes: dict, *, target_tag_ids: list[str] | None = None) -> bool:
    """Return whether a persisted article field captured by history will change."""
    if article.content_format != 'markdown' or not article.is_valid:
        return False

    for field_name in ('title', 'content', 'coll_id', 'post_summary'):
        if field_name in changes and changes[field_name] != getattr(article, field_name):
            return True

    if 'category_id' in changes:
        next_category_id = changes['category_id'] or ''
        if next_category_id != (article.category_id or ''):
            return True

    if target_tag_ids is not None:
        return set(article.tags.values_list('tag_id', flat=True)) != set(target_tag_ids)

    requested_tags = changes.get('tags')
    if requested_tags is not None:
        next_names = {str(name).strip() for name in requested_tags if str(name).strip()}
        matching_tags = Tag.objects.filter(
            name__in=next_names,
            user_id__in=[article.author, 'admin'],
        )
        tags_by_owner_and_name = {(tag.user_id, tag.name): tag.tag_id for tag in matching_tags}
        target_ids = set()
        for name in next_names:
            tag_id = (tags_by_owner_and_name.get((article.author, name))
                      or tags_by_owner_and_name.get(('admin', name)))
            if not tag_id:
                return True  # Saving will create a new tag with this name.
            target_ids.add(tag_id)
        return set(article.tags.values_list('tag_id', flat=True)) != target_ids

    return False


def create_article_version(article: Article, *, source: str, operator_id: str = '') -> ArticleVersion | None:
    """Snapshot the current database state, then enforce the per-article cap."""
    if article.content_format != 'markdown' or not article.is_valid:
        return None

    version = ArticleVersion.objects.create(
        article=article,
        title=article.title,
        content=article.content,
        coll_id=article.coll_id,
        category_id=article.category_id or '',
        tag_ids=sorted(str(tag_id) for tag_id in article.tags.values_list('tag_id', flat=True)),
        post_summary=article.post_summary,
        word_count=article.word_count,
        operator_id=operator_id or article.author,
        source=source,
    )

    enforce_article_version_retention([article.article_id])

    return version
