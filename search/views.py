import re

from django.db.models import Q
from rest_framework.views import APIView

from article.models import Article, Image
from assets.models import Asset
from memos.models import Memo
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, error_result
from utils.error_codes import ErrorCode
from article.views import get_visible_anthology_queryset, get_visible_article_queryset


SEARCH_TYPES = {'article', 'memo', 'image', 'resource'}
DEFAULT_LIMIT = 6
MAX_LIMIT = 12


def normalize_types(raw_types):
    if not raw_types:
        return SEARCH_TYPES

    selected = {item.strip() for item in raw_types.split(',') if item.strip()}
    selected = selected & SEARCH_TYPES
    return selected or SEARCH_TYPES


def normalize_limit(raw_limit):
    try:
        return min(max(int(raw_limit or DEFAULT_LIMIT), 1), MAX_LIMIT)
    except (TypeError, ValueError):
        return DEFAULT_LIMIT


def strip_markdown(value):
    text = re.sub(r'```.*?```', ' ', value or '', flags=re.DOTALL)
    text = re.sub(r'!\[[^\]]*]\([^)]+\)', ' ', text)
    text = re.sub(r'\[([^\]]+)]\([^)]+\)', r'\1', text)
    text = re.sub(r'[#>*_`~\-\[\]()]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def build_excerpt(value, keyword, max_length=120):
    text = strip_markdown(value)
    if not text:
        return ''

    lower_text = text.lower()
    lower_keyword = keyword.lower()
    index = lower_text.find(lower_keyword)

    if index < 0:
        return text[:max_length] + ('...' if len(text) > max_length else '')

    half = max_length // 2
    start = max(0, index - half)
    end = min(len(text), start + max_length)
    start = max(0, end - max_length)

    prefix = '...' if start > 0 else ''
    suffix = '...' if end < len(text) else ''
    return f'{prefix}{text[start:end]}{suffix}'


class GlobalSearchView(APIView):
    """统一搜索文章、闪念、图片与资源。"""

    def get(self, request):
        try:
            keyword = (request.GET.get('keyword') or '').strip()
            if not keyword:
                return success_result(data={
                    'keyword': '',
                    'total': 0,
                    'items': [],
                    'counts': {item: 0 for item in SEARCH_TYPES},
                })

            selected_types = normalize_types(request.GET.get('types', ''))
            limit = normalize_limit(request.GET.get('limit'))
            current_user_id = get_current_user_identifier(request)
            visible_anthologies = list(get_visible_anthology_queryset(request).values('coll_id', 'title', 'type'))
            anthology_map = {item['coll_id']: item for item in visible_anthologies}
            visible_coll_ids = list(anthology_map.keys())

            items = []
            counts = {item: 0 for item in SEARCH_TYPES}

            if 'article' in selected_types:
                articles = get_visible_article_queryset(request).filter(
                    Q(title__icontains=keyword) |
                    Q(content__icontains=keyword) |
                    Q(category__name__icontains=keyword) |
                    Q(tags__name__icontains=keyword)
                ).distinct().order_by('-updated_at')
                counts['article'] = articles.count()
                for article in articles[:limit]:
                    anthology = anthology_map.get(article.coll_id, {})
                    tag_names = [tag.name for tag in article.tags.all()[:4]]
                    items.append({
                        'id': f'article:{article.article_id}',
                        'type': 'article',
                        'title': article.title,
                        'subtitle': f"文集: {anthology.get('title') or article.coll_id}",
                        'excerpt': build_excerpt(article.content, keyword),
                        'matched_fields': ['标题/正文/分类/标签'],
                        'updated_at': article.updated_at,
                        'route': {
                            'view': 'article',
                            'params': {
                                'coll_id': article.coll_id,
                                'article_id': article.article_id,
                            },
                        },
                        'meta': {
                            'coll_id': article.coll_id,
                            'coll_title': anthology.get('title') or '',
                            'tags': tag_names,
                            'word_count': article.word_count,
                        },
                    })

            if 'memo' in selected_types:
                memos = Memo.objects.filter(
                    user_id=current_user_id,
                    is_valid=True,
                ).filter(
                    Q(content__icontains=keyword) |
                    Q(tag__icontains=keyword)
                ).order_by('-is_pinned', '-updated_at')
                counts['memo'] = memos.count()
                for memo in memos[:limit]:
                    items.append({
                        'id': f'memo:{memo.memo_id}',
                        'type': 'memo',
                        'title': build_excerpt(memo.content, keyword, 48) or '闪念备忘',
                        'subtitle': memo.tag or '未设置标签',
                        'excerpt': build_excerpt(memo.content, keyword),
                        'matched_fields': ['内容/标签'],
                        'updated_at': memo.updated_at,
                        'route': {
                            'view': 'memos',
                            'params': {
                                'keyword': keyword,
                            },
                        },
                        'meta': {
                            'memo_id': memo.memo_id,
                            'tag': memo.tag,
                            'is_pinned': memo.is_pinned,
                        },
                    })

            if 'image' in selected_types and visible_coll_ids:
                image_coll_ids = [item['coll_id'] for item in visible_anthologies if item.get('type') == 'image']
                images = Image.objects.filter(
                    is_valid=True,
                    coll_id__in=image_coll_ids,
                ).filter(
                    Q(title__icontains=keyword) |
                    Q(description__icontains=keyword) |
                    Q(tags__icontains=keyword) |
                    Q(country__icontains=keyword) |
                    Q(city__icontains=keyword) |
                    Q(place_name__icontains=keyword)
                ).order_by('-updated_at')
                counts['image'] = images.count()
                for image in images[:limit]:
                    anthology = anthology_map.get(image.coll_id, {})
                    location = ' '.join(part for part in [image.country, image.city, image.place_name] if part)
                    items.append({
                        'id': f'image:{image.image_id}',
                        'type': 'image',
                        'title': image.title,
                        'subtitle': f"图片文集: {anthology.get('title') or image.coll_id}",
                        'excerpt': build_excerpt(image.description or image.tags or location, keyword),
                        'matched_fields': ['标题/描述/标签/地点'],
                        'updated_at': image.updated_at,
                        'route': {
                            'view': 'image',
                            'params': {
                                'coll_id': image.coll_id,
                                'image_id': image.image_id,
                            },
                        },
                        'meta': {
                            'coll_id': image.coll_id,
                            'coll_title': anthology.get('title') or '',
                            'image_url': image.image_url,
                            'tags': image.get_tags_list(),
                            'location': location,
                        },
                    })

            if 'resource' in selected_types:
                resources = Asset.objects.filter(
                    is_valid=True,
                    uploader=current_user_id,
                ).filter(
                    Q(name__icontains=keyword) |
                    Q(original_name__icontains=keyword) |
                    Q(file_extension__icontains=keyword) |
                    Q(mime_type__icontains=keyword)
                ).order_by('-upload_time')
                counts['resource'] = resources.count()
                for resource in resources[:limit]:
                    items.append({
                        'id': f'resource:{resource.id}',
                        'type': 'resource',
                        'title': resource.original_name or resource.name,
                        'subtitle': f"{resource.get_file_type_display()} · {resource.formatted_size}",
                        'excerpt': resource.name,
                        'matched_fields': ['文件名/扩展名/MIME'],
                        'updated_at': resource.update_time,
                        'route': {
                            'view': 'resources',
                            'params': {
                                'keyword': keyword,
                                'resource_id': resource.id,
                            },
                        },
                        'meta': {
                            'resource_id': resource.id,
                            'file_type': resource.file_type,
                            'source_type': resource.source_type,
                        },
                    })

            items.sort(key=lambda item: item.get('updated_at'), reverse=True)

            return success_result(data={
                'keyword': keyword,
                'total': sum(counts.values()),
                'items': items[:limit * max(1, len(selected_types))],
                'counts': counts,
            })
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
