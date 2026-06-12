import hashlib
import re
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q

from article.models import Article, ArticleAnnotation, ArticleAnnotationComment
from user.models import UserProfile
from utils.drf_utils import get_current_user_identifier


ANCHOR_CONTEXT_CHARS = 60
MAX_COMMENT_LENGTH = 2000
MAX_SELECTED_TEXT_LENGTH = 1000
FUZZY_ANCHOR_CHARS = 8
FUZZY_LENGTH_TOLERANCE = 10
FUZZY_IGNORED_CHARS = set('`*_~=#|[]{}<>%')


class AnnotationError(ValueError):
    pass


@dataclass
class Anchor:
    selected_text: str
    start_offset: int
    end_offset: int
    prefix_text: str
    suffix_text: str
    content_hash: str


def article_content_hash(content):
    return hashlib.sha256((content or '').encode('utf-8')).hexdigest()


def markdown_to_plain_text(markdown):
    text = markdown or ''
    text = re.sub(r'```[\s\S]*?```', ' ', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'==([^=]+)==', r'\1', text)
    text = re.sub(r'!\[[^\]]*]\([^)]+\)', ' ', text)
    text = re.sub(r'\[([^\]]+)]\([^)]+\)', r'\1', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'^\s{0,3}#{1,6}\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s{0,3}>\s?', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+[.)]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'[*_~#>|]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def normalize_selected_text(value):
    return re.sub(r'\s+', ' ', (value or '').strip())


def _build_anchor(plain_text, selected_text, start_offset, end_offset, content_hash):
    return Anchor(
        selected_text=selected_text,
        start_offset=start_offset,
        end_offset=end_offset,
        prefix_text=plain_text[max(0, start_offset - ANCHOR_CONTEXT_CHARS):start_offset],
        suffix_text=plain_text[end_offset:end_offset + ANCHOR_CONTEXT_CHARS],
        content_hash=content_hash,
    )


def _fuzzy_normalize_with_map(value):
    chars = []
    index_map = []
    for index, char in enumerate(value or ''):
        if char.isspace() or char in FUZZY_IGNORED_CHARS:
            continue
        chars.append(char.casefold())
        index_map.append(index)
    return ''.join(chars), index_map


def _find_unique_fuzzy_span(plain_text, selected_text):
    normalized_text, index_map = _fuzzy_normalize_with_map(plain_text)
    normalized_selected, _ = _fuzzy_normalize_with_map(selected_text)
    if not normalized_text or not normalized_selected:
        return None

    matches = [match.start() for match in re.finditer(re.escape(normalized_selected), normalized_text)]
    if len(matches) > 1:
        raise AnnotationError('文本不唯一，请提供更长的 selectedText')
    if len(matches) == 1:
        start = index_map[matches[0]]
        end = index_map[matches[0] + len(normalized_selected) - 1] + 1
        return start, end

    anchor_size = min(FUZZY_ANCHOR_CHARS, max(2, len(normalized_selected) // 3))
    prefix = normalized_selected[:anchor_size]
    suffix = normalized_selected[-anchor_size:]
    candidates = []
    search_start = 0
    while True:
        prefix_index = normalized_text.find(prefix, search_start)
        if prefix_index < 0:
            break
        suffix_search_from = prefix_index + len(prefix)
        while True:
            suffix_index = normalized_text.find(suffix, suffix_search_from)
            if suffix_index < 0:
                break
            candidate_length = suffix_index + len(suffix) - prefix_index
            if candidate_length > len(normalized_selected) + FUZZY_LENGTH_TOLERANCE:
                break
            if abs(candidate_length - len(normalized_selected)) <= FUZZY_LENGTH_TOLERANCE:
                start = index_map[prefix_index]
                end = index_map[suffix_index + len(suffix) - 1] + 1
                candidates.append((start, end))
                break
            suffix_search_from = suffix_index + 1
        search_start = prefix_index + 1

    unique_candidates = list(dict.fromkeys(candidates))
    if len(unique_candidates) > 1:
        raise AnnotationError('文本不唯一，请提供更长的 selectedText')
    return unique_candidates[0] if unique_candidates else None


def build_anchor_from_offsets(article, selected_text, start_offset, end_offset):
    plain_text = markdown_to_plain_text(article.content)
    selected_text = normalize_selected_text(selected_text)
    if not selected_text:
        raise AnnotationError('selectedText 不能为空')
    if len(selected_text) > MAX_SELECTED_TEXT_LENGTH:
        raise AnnotationError('selectedText 不能超过 1000 字')

    try:
        start_offset = int(start_offset)
        end_offset = int(end_offset)
    except (TypeError, ValueError):
        raise AnnotationError('startOffset/endOffset 必须是数字')

    if start_offset < 0 or end_offset <= start_offset or end_offset > len(plain_text):
        raise AnnotationError('选区偏移无效')

    actual_text = normalize_selected_text(plain_text[start_offset:end_offset])
    if actual_text != selected_text:
        fallback = locate_unique_text(article, selected_text)
        if fallback:
            return fallback
        raise AnnotationError('选区内容与文章正文不匹配')

    return _build_anchor(plain_text, selected_text, start_offset, end_offset, article_content_hash(article.content))


def locate_unique_text(article, selected_text):
    plain_text = markdown_to_plain_text(article.content)
    selected_text = normalize_selected_text(selected_text)
    if not selected_text:
        raise AnnotationError('selectedText 不能为空')
    if len(selected_text) > MAX_SELECTED_TEXT_LENGTH:
        raise AnnotationError('selectedText 不能超过 1000 字')

    content_hash = article_content_hash(article.content)
    matches = [match.start() for match in re.finditer(re.escape(selected_text), plain_text)]
    if not matches:
        fuzzy_span = _find_unique_fuzzy_span(plain_text, selected_text)
        if not fuzzy_span:
            return None
        return _build_anchor(plain_text, selected_text, fuzzy_span[0], fuzzy_span[1], content_hash)
    if len(matches) > 1:
        raise AnnotationError('文本不唯一，请提供更长的 selectedText')

    start_offset = matches[0]
    end_offset = start_offset + len(selected_text)
    return _build_anchor(plain_text, selected_text, start_offset, end_offset, content_hash)


def relocate_annotation(annotation):
    article = annotation.article
    current_hash = article_content_hash(article.content)
    plain_text = markdown_to_plain_text(article.content)
    if current_hash == annotation.content_hash:
        return {
            'located': True,
            'start_offset': annotation.start_offset,
            'end_offset': annotation.end_offset,
            'reason': '',
        }

    selected_text = normalize_selected_text(annotation.selected_text)
    candidates = [match.start() for match in re.finditer(re.escape(selected_text), plain_text)]
    if not candidates:
        return {'located': False, 'start_offset': None, 'end_offset': None, 'reason': '原文已变化，未找到划线内容'}

    scored = []
    for start in candidates:
        end = start + len(selected_text)
        prefix = plain_text[max(0, start - ANCHOR_CONTEXT_CHARS):start]
        suffix = plain_text[end:end + ANCHOR_CONTEXT_CHARS]
        score = 0
        if annotation.prefix_text and prefix.endswith(annotation.prefix_text[-20:]):
            score += 1
        if annotation.suffix_text and suffix.startswith(annotation.suffix_text[:20]):
            score += 1
        scored.append((score, start, end))

    scored.sort(reverse=True)
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return {'located': False, 'start_offset': None, 'end_offset': None, 'reason': '原文已变化，划线内容不唯一'}

    _, start, end = scored[0]
    return {'located': True, 'start_offset': start, 'end_offset': end, 'reason': '文章已变化，已根据上下文重新定位'}


def assert_no_overlap(article, start_offset, end_offset):
    overlapping = ArticleAnnotation.objects.filter(
        article=article,
        is_valid=True,
        start_offset__lt=end_offset,
        end_offset__gt=start_offset,
    ).exists()
    if overlapping:
        raise AnnotationError('该内容已有批注，暂不支持重叠批注')


def get_user_identity(request):
    user_id = get_current_user_identifier(request)
    name = user_id
    avatar = ''

    if request and request.user and request.user.is_authenticated:
        profile = UserProfile.objects.filter(userid=user_id).select_related('user').first()
        if not profile:
            profile = UserProfile.objects.filter(user=request.user).select_related('user').first()
        if profile:
            name = profile.nickname or profile.user.first_name or profile.user.username or user_id
            avatar = profile.avatar or ''

    return {
        'creator_type': 'user',
        'creator_id': user_id,
        'creator_name': name,
        'creator_avatar': avatar,
    }


def get_agent_identity(agent=None):
    name = str(getattr(agent, 'name', '') or '').strip() or '访客'
    avatar = str(getattr(agent, 'avatar', '') or '').strip()
    return {
        'creator_type': 'agent',
        'creator_id': f'agent:{name}',
        'creator_name': name,
        'creator_avatar': avatar,
    }


def _send_article_comment_notification(article, identity, comment):
    from utils.notification_service import NotificationService

    author = str(article.author or '').strip()
    creator_name = str(identity.get('creator_name') or '').strip() or '有人'
    creator_id = str(identity.get('creator_id') or '').strip()
    if not author:
        return
    if identity.get('creator_type') == 'user' and creator_id == author:
        return

    title = f'{creator_name} 评论了《{article.title}》'
    content = str(comment or '').strip()
    NotificationService.send(
        author,
        title,
        content,
        level='info',
        link=f'/article/{article.coll_id}/{article.article_id}',
    )


def create_annotation_with_comment(article, anchor, comment, identity):
    comment = str(comment or '').strip()
    if not comment:
        raise AnnotationError('comment 不能为空')
    if len(comment) > MAX_COMMENT_LENGTH:
        raise AnnotationError('comment 不能超过 2000 字')

    with transaction.atomic():
        annotation = ArticleAnnotation.objects.create(
            article=article,
            selected_text=anchor.selected_text,
            start_offset=anchor.start_offset,
            end_offset=anchor.end_offset,
            prefix_text=anchor.prefix_text,
            suffix_text=anchor.suffix_text,
            content_hash=anchor.content_hash,
            **identity,
        )
        created_comment = ArticleAnnotationComment.objects.create(
            annotation=annotation,
            content=comment,
            **identity,
        )
    _send_article_comment_notification(article, identity, created_comment.content)
    return annotation


def add_comment(annotation, comment, identity):
    comment = str(comment or '').strip()
    if not comment:
        raise AnnotationError('comment 不能为空')
    if len(comment) > MAX_COMMENT_LENGTH:
        raise AnnotationError('comment 不能超过 2000 字')
    created_comment = ArticleAnnotationComment.objects.create(
        annotation=annotation,
        content=comment,
        **identity,
    )
    _send_article_comment_notification(annotation.article, identity, created_comment.content)
    return created_comment


def can_manage_article(request, article):
    if not request or not request.user or not request.user.is_authenticated:
        return False
    user_id = get_current_user_identifier(request)
    return article.author == user_id


def can_delete_comment(request, comment):
    if not request or not request.user or not request.user.is_authenticated:
        return False
    user_id = get_current_user_identifier(request)
    return comment.creator_type == 'user' and comment.creator_id == user_id or comment.annotation.article.author == user_id


def can_delete_annotation(request, annotation):
    if not request or not request.user or not request.user.is_authenticated:
        return False
    user_id = get_current_user_identifier(request)
    return (
        annotation.creator_type == 'user' and annotation.creator_id == user_id
        or annotation.article.author == user_id
    )


def annotation_queryset_for_article(article):
    return ArticleAnnotation.objects.filter(article=article, is_valid=True).prefetch_related('comments')


def visible_comments(annotation):
    return annotation.comments.filter(is_valid=True).order_by('created_at')


def serialize_comment(comment):
    return {
        'comment_id': comment.comment_id,
        'annotation_id': comment.annotation_id,
        'content': comment.content,
        'creator_type': comment.creator_type,
        'creator_id': comment.creator_id,
        'creator_name': comment.creator_name,
        'creator_avatar': comment.creator_avatar,
        'created_at': comment.created_at,
        'updated_at': comment.updated_at,
    }


def serialize_annotation(annotation):
    location = relocate_annotation(annotation)
    comments = [serialize_comment(comment) for comment in visible_comments(annotation)]
    return {
        'annotation_id': annotation.annotation_id,
        'article_id': annotation.article_id,
        'selected_text': annotation.selected_text,
        'start_offset': location['start_offset'] if location['located'] else annotation.start_offset,
        'end_offset': location['end_offset'] if location['located'] else annotation.end_offset,
        'stored_start_offset': annotation.start_offset,
        'stored_end_offset': annotation.end_offset,
        'prefix_text': annotation.prefix_text,
        'suffix_text': annotation.suffix_text,
        'content_hash': annotation.content_hash,
        'located': location['located'],
        'location_reason': location['reason'],
        'creator_type': annotation.creator_type,
        'creator_id': annotation.creator_id,
        'creator_name': annotation.creator_name,
        'creator_avatar': annotation.creator_avatar,
        'comment_count': len(comments),
        'comments': comments,
        'created_at': annotation.created_at,
        'updated_at': annotation.updated_at,
    }
