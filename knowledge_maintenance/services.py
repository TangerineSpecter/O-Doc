import hashlib
import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone

from anthology.models import Anthology, Book
from article.models import Article, ArticleAnnotationComment
from assets.models import Asset
from memos.models import Memo
from system_settings.article_rag_scheduler import CONFIG_KEY as RAG_CONFIG_KEY
from system_settings.models import SystemSetting
from utils.resource_assets import (
    get_agent_resource_usage,
    get_article_resource_usage,
    get_image_resource_usage,
)

from .models import DailyReviewItem, HealthIssueIgnore


REVIEW_SLOTS = ('old_article', 'old_memo', 'recent_content', 'comment_review')
REASON_TEXTS = {
    'article_not_read_30d': '有一阵子没读过了，重新看看也许会有新发现',
    'memo_not_touched_14d': '这条闪念沉淀了一段时间，适合重新审视',
    'recent_content': '这是近期留下的内容，可以继续看看或补充',
    'comment_revisit': '重读当时的划线与评论，看看观点有没有变化',
    'fallback_content': '从知识库里重新遇见一条内容',
}
HEALTH_RULE_TITLES = {
    'article_empty': '文章正文为空',
    'article_uncategorized': '文章尚未分类',
    'article_untagged': '文章尚未添加标签',
    'memo_untagged': '闪念尚未添加标签',
    'rag_pending': '文章尚未同步到知识库',
    'asset_missing': '本地文件缺失',
    'asset_unlinked': '资源长期未关联',
}


@dataclass(frozen=True)
class ReviewCandidate:
    source_type: str
    source_id: str
    reason_code: str
    rank_time: datetime

    @property
    def key(self):
        return self.source_type, self.source_id


def _owned_collection_ids(user_id, collection_type):
    return Anthology.objects.filter(
        user_id=user_id,
        type=collection_type,
        is_valid=True,
    ).values_list('coll_id', flat=True)


def _plain_excerpt(value, limit=120):
    text = re.sub(r'```.*?```', ' ', value or '', flags=re.DOTALL)
    text = re.sub(r'!\[[^\]]*]\([^)]+\)', ' ', text)
    text = re.sub(r'\[([^\]]+)]\([^)]+\)', r'\1', text)
    text = re.sub(r'[#>*_`~\-\[\]()]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:limit] + ('…' if len(text) > limit else '')


def _stable_hash(user_id, review_date, candidate):
    value = f'{user_id}:{review_date.isoformat()}:{candidate.source_type}:{candidate.source_id}'
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _candidate_pools(user_id, review_date):
    now = timezone.now()
    article_ids = _owned_collection_ids(user_id, 'article')
    articles = list(
        Article.objects.filter(author=user_id, coll_id__in=article_ids, is_valid=True)
        .annotate(last_user_read=Max('read_stats__created_at', filter=Q(read_stats__user_identifier=user_id)))
    )
    memos = list(Memo.objects.filter(user_id=user_id, is_valid=True))
    comments = list(
        ArticleAnnotationComment.objects.filter(
            annotation__article__author=user_id,
            annotation__article__coll_id__in=article_ids,
            annotation__article__is_valid=True,
            annotation__is_valid=True,
            is_valid=True,
        ).select_related('annotation', 'annotation__article')
    )

    old_article_cutoff = now - timedelta(days=30)
    old_memo_cutoff = now - timedelta(days=14)
    recent_start = now - timedelta(days=21)
    recent_end = now - timedelta(days=3)

    old_articles = []
    recent_content = []
    fallback = []
    for article in articles:
        interaction = article.last_user_read or article.created_at
        candidate = ReviewCandidate('article', article.article_id, 'fallback_content', interaction)
        fallback.append(candidate)
        if interaction <= old_article_cutoff:
            old_articles.append(ReviewCandidate('article', article.article_id, 'article_not_read_30d', interaction))
        if recent_start <= article.updated_at <= recent_end:
            recent_content.append(ReviewCandidate('article', article.article_id, 'recent_content', article.updated_at))

    old_memos = []
    for memo in memos:
        fallback.append(ReviewCandidate('memo', memo.memo_id, 'fallback_content', memo.updated_at))
        if memo.updated_at <= old_memo_cutoff:
            old_memos.append(ReviewCandidate('memo', memo.memo_id, 'memo_not_touched_14d', memo.updated_at))
        if recent_start <= memo.updated_at <= recent_end:
            recent_content.append(ReviewCandidate('memo', memo.memo_id, 'recent_content', memo.updated_at))

    comment_reviews = [
        ReviewCandidate('comment', comment.comment_id, 'comment_revisit', comment.updated_at)
        for comment in comments
    ]

    def oldest_first(values):
        return sorted(values, key=lambda item: (item.rank_time, _stable_hash(user_id, review_date, item)))

    def newest_first(values):
        return sorted(values, key=lambda item: (-item.rank_time.timestamp(), _stable_hash(user_id, review_date, item)))

    return {
        'old_article': oldest_first(old_articles),
        'old_memo': oldest_first(old_memos),
        'recent_content': newest_first(recent_content),
        'comment_review': newest_first(comment_reviews),
        'fallback': oldest_first(fallback),
    }


def _recent_selection_dates(user_id, review_date):
    rows = DailyReviewItem.objects.filter(
        user_id=user_id,
        review_date__gte=review_date - timedelta(days=30),
        review_date__lte=review_date,
    ).values_list('source_type', 'source_id', 'review_date')
    result = {}
    for source_type, source_id, selected_date in rows:
        key = (source_type, source_id)
        if key not in result or selected_date > result[key]:
            result[key] = selected_date
    return result


def _select_candidate(primary, fallback, selected, history, review_date):
    for exclusion_days in (30, 7, 0):
        cutoff = review_date - timedelta(days=exclusion_days)
        for pool in (primary, fallback):
            for candidate in pool:
                if candidate.key in selected:
                    continue
                previous_date = history.get(candidate.key)
                if previous_date is not None and previous_date >= cutoff:
                    continue
                return candidate
    return None


def _source_exists(source_type, source_id, user_id):
    if source_type == 'article':
        return Article.objects.filter(
            article_id=source_id,
            author=user_id,
            coll_id__in=_owned_collection_ids(user_id, 'article'),
            is_valid=True,
        ).exists()
    if source_type == 'memo':
        return Memo.objects.filter(memo_id=source_id, user_id=user_id, is_valid=True).exists()
    if source_type == 'comment':
        return ArticleAnnotationComment.objects.filter(
            comment_id=source_id,
            annotation__article__author=user_id,
            annotation__article__coll_id__in=_owned_collection_ids(user_id, 'article'),
            annotation__article__is_valid=True,
            annotation__is_valid=True,
            is_valid=True,
        ).exists()
    return False


def _create_review_items(user_id, review_date, slots, batch_no):
    pools = _candidate_pools(user_id, review_date)
    history = _recent_selection_dates(user_id, review_date)
    selected = set(
        DailyReviewItem.objects.filter(user_id=user_id, review_date=review_date)
        .exclude(status='replaced')
        .values_list('source_type', 'source_id')
    )
    created = []
    for slot in slots:
        candidate = _select_candidate(pools[slot], pools['fallback'], selected, history, review_date)
        if not candidate:
            continue
        selected.add(candidate.key)
        created.append(DailyReviewItem(
            user_id=user_id,
            review_date=review_date,
            slot_type=slot,
            source_type=candidate.source_type,
            source_id=candidate.source_id,
            batch_no=batch_no,
            sort_order=REVIEW_SLOTS.index(slot),
            reason_code=candidate.reason_code,
        ))
    if created:
        # 同一用户可能在多个标签页同时打开首页；唯一约束配合忽略冲突避免重复卡片。
        DailyReviewItem.objects.bulk_create(created, ignore_conflicts=True)
    return created


@transaction.atomic
def ensure_daily_review(user_id, review_date=None):
    review_date = review_date or timezone.now().date()
    active = list(DailyReviewItem.objects.select_for_update().filter(
        user_id=user_id,
        review_date=review_date,
    ).exclude(status='replaced'))
    missing_slots = []
    for item in active:
        if item.slot_type not in REVIEW_SLOTS or not _source_exists(item.source_type, item.source_id, user_id):
            item.status = 'replaced'
            item.save(update_fields=['status', 'updated_at'])
            if item.slot_type in REVIEW_SLOTS:
                missing_slots.append(item.slot_type)
    active = [item for item in active if item.status != 'replaced']
    occupied_slots = {item.slot_type for item in active}
    missing_slots.extend(slot for slot in REVIEW_SLOTS if slot not in occupied_slots)
    if missing_slots:
        latest_batch = DailyReviewItem.objects.filter(user_id=user_id, review_date=review_date).aggregate(Max('batch_no'))['batch_no__max'] or 0
        _create_review_items(user_id, review_date, tuple(dict.fromkeys(missing_slots)), latest_batch + 1)
    return list(DailyReviewItem.objects.filter(user_id=user_id, review_date=review_date).exclude(status='replaced'))


@transaction.atomic
def refresh_daily_review(user_id):
    review_date = timezone.now().date()
    pending = list(DailyReviewItem.objects.select_for_update().filter(
        user_id=user_id,
        review_date=review_date,
        status='pending',
        slot_type__in=REVIEW_SLOTS,
    ))
    slots = [item.slot_type for item in pending]
    if pending:
        latest_batch = DailyReviewItem.objects.filter(user_id=user_id, review_date=review_date).aggregate(Max('batch_no'))['batch_no__max'] or 0
        replacements = _create_review_items(user_id, review_date, slots, latest_batch + 1)
        replaced_slots = {item.slot_type for item in replacements}
        if replaced_slots:
            DailyReviewItem.objects.filter(
                id__in=[item.id for item in pending if item.slot_type in replaced_slots]
            ).update(status='replaced', updated_at=timezone.now())
    return ensure_daily_review(user_id, review_date)


def _serialize_review_source(item):
    reason_text = REASON_TEXTS.get(item.reason_code, REASON_TEXTS['fallback_content'])
    base = {
        'id': str(item.id),
        'review_date': item.review_date,
        'slot_type': item.slot_type,
        'source_type': item.source_type,
        'source_id': item.source_id,
        'status': item.status,
        'reason_code': item.reason_code,
        'reason_text': reason_text,
        'sort_order': item.sort_order,
    }
    if item.source_type == 'article':
        source = Article.objects.filter(article_id=item.source_id, is_valid=True).first()
        if not source:
            return None
        return {**base, 'title': source.title, 'excerpt': _plain_excerpt(source.content), 'meta': {'updated_at': source.updated_at, 'word_count': source.word_count}, 'target': {'view': 'article', 'params': {'coll_id': source.coll_id, 'article_id': source.article_id}}}
    if item.source_type == 'memo':
        source = Memo.objects.filter(memo_id=item.source_id, is_valid=True).first()
        if not source:
            return None
        return {**base, 'title': _plain_excerpt(source.content, 42) or '闪念备忘', 'excerpt': _plain_excerpt(source.content), 'meta': {'updated_at': source.updated_at, 'tag': source.tag}, 'target': {'view': 'memos', 'params': {'memo_id': source.memo_id}}}
    if item.source_type == 'comment':
        source = ArticleAnnotationComment.objects.filter(
            comment_id=item.source_id,
            is_valid=True,
            annotation__is_valid=True,
            annotation__article__is_valid=True,
        ).select_related('annotation', 'annotation__article').first()
        if not source:
            return None
        article = source.annotation.article
        return {
            **base,
            'title': article.title,
            'excerpt': _plain_excerpt(source.content),
            'meta': {
                'selected_text': _plain_excerpt(source.annotation.selected_text, 240),
                'comment': source.content,
                'commenter_name': source.creator_name or ('Agent' if source.creator_type == 'agent' else '用户'),
                'commenter_type': source.creator_type,
                'commented_at': source.created_at,
                'article_id': article.article_id,
                'annotation_id': source.annotation_id,
            },
            'target': {'view': 'article', 'params': {'coll_id': article.coll_id, 'article_id': article.article_id}},
        }
    return None


def review_payload(user_id, review_date=None, generate=True):
    review_date = review_date or timezone.now().date()
    items = ensure_daily_review(user_id, review_date) if generate else list(
        DailyReviewItem.objects.filter(
            user_id=user_id,
            review_date=review_date,
            slot_type__in=REVIEW_SLOTS,
        ).exclude(status='replaced')
    )
    serialized = [value for value in (_serialize_review_source(item) for item in items) if value]
    serialized.sort(key=lambda item: item['sort_order'])
    completed = sum(item['status'] == 'completed' for item in serialized)
    skipped = sum(item['status'] == 'skipped' for item in serialized)
    return {
        'date': review_date,
        'total': len(serialized),
        'completed': completed,
        'skipped': skipped,
        'pending': sum(item['status'] == 'pending' for item in serialized),
        'handled': completed + skipped,
        'items': serialized,
        'streak': review_streak(user_id),
    }


def review_streak(user_id):
    today = timezone.now().date()
    rows = DailyReviewItem.objects.filter(
        user_id=user_id,
        review_date__gte=today - timedelta(days=365),
        review_date__lte=today,
    ).exclude(status='replaced').values_list('review_date', 'status')
    by_date = {}
    for review_date, status in rows:
        by_date.setdefault(review_date, []).append(status)
    cursor = today
    if cursor not in by_date or any(status == 'pending' for status in by_date[cursor]):
        cursor -= timedelta(days=1)
    streak = 0
    while cursor in by_date and by_date[cursor] and all(status in ('completed', 'skipped') for status in by_date[cursor]):
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _fingerprint(*values):
    raw = json.dumps(values, ensure_ascii=False, default=str, separators=(',', ':'))
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _issue(rule_code, severity, source_type, source_id, title, description, fingerprint, action, meta=None):
    return {
        'issue_key': f'{rule_code}:{source_type}:{source_id}',
        'rule_code': rule_code,
        'rule_title': HEALTH_RULE_TITLES[rule_code],
        'severity': severity,
        'source_type': source_type,
        'source_id': str(source_id),
        'title': title,
        'description': description,
        'fingerprint': fingerprint,
        'action': action,
        'meta': meta or {},
    }


def collect_health_issues(user_id):
    issues = []
    article_coll_ids = list(_owned_collection_ids(user_id, 'article'))
    articles = list(
        Article.objects.filter(author=user_id, coll_id__in=article_coll_ids, is_valid=True)
        .select_related('category').prefetch_related('tags')
    )
    rag_setting = SystemSetting.objects.filter(key=RAG_CONFIG_KEY).first()
    rag_enabled = bool((rag_setting.value or {}).get('enabled')) if rag_setting else False
    rag_used = any(article.last_rag_synced_at for article in articles)

    for article in articles:
        edit_action = {'type': 'navigate', 'target': {'view': 'editor', 'params': {'article_id': article.article_id}}}
        article_fingerprint = _fingerprint(article.updated_at, article.title, article.content, article.category_id, sorted(tag.tag_id for tag in article.tags.all()))
        if not (article.content or '').strip():
            issues.append(_issue('article_empty', 'warning', 'article', article.article_id, article.title, '正文为空，建议补充内容或确认是否需要保留。', article_fingerprint, edit_action))
        if not article.category or not article.category.is_valid:
            issues.append(_issue('article_uncategorized', 'info', 'article', article.article_id, article.title, '未设置有效分类，后续查找和整理会更困难。', article_fingerprint, edit_action))
        if not any(tag.is_valid for tag in article.tags.all()):
            issues.append(_issue('article_untagged', 'info', 'article', article.article_id, article.title, '还没有标签，可以在编辑器中补充。', article_fingerprint, edit_action))
        if (rag_enabled or rag_used) and not article.is_rag_synced and (article.content or '').strip():
            issues.append(_issue('rag_pending', 'warning', 'article', article.article_id, article.title, '文章尚未进入 RAG 知识库。', article_fingerprint, {'type': 'rag_sync', 'article_id': article.article_id}))

    memo_cutoff = timezone.now() - timedelta(days=7)
    for memo in Memo.objects.filter(user_id=user_id, is_valid=True, updated_at__lte=memo_cutoff, tag=''):
        fingerprint = _fingerprint(memo.updated_at, memo.content, memo.tag)
        issues.append(_issue('memo_untagged', 'info', 'memo', memo.memo_id, _plain_excerpt(memo.content, 48) or '闪念备忘', '这条闪念已保存超过 7 天，但还没有标签。', fingerprint, {'type': 'navigate', 'target': {'view': 'memos', 'params': {'memo_id': memo.memo_id}}}))

    assets = list(Asset.objects.filter(uploader=user_id, is_valid=True))
    asset_ids = {str(asset.id) for asset in assets}
    article_usage = set(get_article_resource_usage(asset_ids).keys())
    image_usage = set(get_image_resource_usage(asset_ids).keys())
    agent_usage = set(get_agent_resource_usage(asset_ids).keys())
    books = list(Book.objects.filter(anthology__user_id=user_id, anthology__is_valid=True, is_valid=True).select_related('asset', 'cover_asset'))
    book_usage = set()
    book_by_asset = {}
    for book in books:
        book_usage.add(str(book.asset_id))
        book_by_asset[str(book.asset_id)] = (book, 'file')
        if book.cover_asset_id:
            book_usage.add(str(book.cover_asset_id))
            book_by_asset[str(book.cover_asset_id)] = (book, 'cover')
    referenced = article_usage | image_usage | agent_usage | book_usage
    unlinked_cutoff = timezone.now() - timedelta(days=7)

    for asset in assets:
        asset_id = str(asset.id)
        absolute_path = os.path.join(settings.MEDIA_ROOT, asset.file_path)
        book_ref = book_by_asset.get(asset_id)
        intentionally_cloud_only = bool(
            book_ref and book_ref[1] == 'file' and
            book_ref[0].local_state == 'cloud_only' and book_ref[0].remote_available
        )
        fingerprint = _fingerprint(asset.update_time, asset.file_hash, asset.is_linked, os.path.isfile(absolute_path))
        if not os.path.isfile(absolute_path) and not intentionally_cloud_only:
            if book_ref and book_ref[1] == 'file':
                book = book_ref[0]
                action = {'type': 'navigate', 'target': {'view': 'book', 'params': {'coll_id': book.anthology_id, 'book_id': book.book_id}}}
                description = '图书记录仍在，但本地正文不存在，请从云端恢复或补传文件。'
            else:
                action = {'type': 'navigate', 'target': {'view': 'resources', 'params': {'missing': 'true'}}}
                description = '数据库记录仍在，但磁盘上的文件不存在。'
            issues.append(_issue('asset_missing', 'critical', 'asset', asset_id, asset.original_name or asset.name, description, fingerprint, action, {'file_type': asset.file_type}))
        if asset.upload_time <= unlinked_cutoff and asset_id not in referenced and not asset.linked_article_id:
            issues.append(_issue('asset_unlinked', 'info', 'asset', asset_id, asset.original_name or asset.name, '上传超过 7 天且没有被任何内容引用。', fingerprint, {'type': 'navigate', 'target': {'view': 'resources', 'params': {'linked': 'false'}}}, {'file_type': asset.file_type}))
    return issues


def health_payload(user_id, severity='', rule_code='', include_ignored=False, page=1, page_size=20):
    issues = collect_health_issues(user_id)
    ignore_map = {
        (item.rule_code, item.source_type, item.source_id): item.source_fingerprint
        for item in HealthIssueIgnore.objects.filter(user_id=user_id)
    }
    for issue in issues:
        key = (issue['rule_code'], issue['source_type'], issue['source_id'])
        issue['ignored'] = ignore_map.get(key) == issue['fingerprint']

    visible_for_score = [issue for issue in issues if not issue['ignored']]
    severity_counts = {
        level: sum(issue['severity'] == level for issue in visible_for_score)
        for level in ('critical', 'warning', 'info')
    }
    rule_counts = {
        code: sum(issue['rule_code'] == code for issue in visible_for_score)
        for code in HEALTH_RULE_TITLES
    }
    score = max(0, 100 - min(40, severity_counts['critical'] * 10) - min(30, severity_counts['warning'] * 3) - min(30, severity_counts['info']))
    status = '良好' if score >= 90 else '待整理' if score >= 70 else '需处理'

    filtered = issues if include_ignored else visible_for_score
    if severity:
        filtered = [issue for issue in filtered if issue['severity'] == severity]
    if rule_code:
        filtered = [issue for issue in filtered if issue['rule_code'] == rule_code]
    severity_order = {'critical': 0, 'warning': 1, 'info': 2}
    filtered.sort(key=lambda issue: (severity_order[issue['severity']], issue['rule_code'], issue['title']))
    total = len(filtered)
    start = (page - 1) * page_size
    return {
        'score': score,
        'status': status,
        'severity_counts': severity_counts,
        'rule_counts': rule_counts,
        'total': total,
        'page': page,
        'page_size': page_size,
        'items': filtered[start:start + page_size],
    }


def overview_payload(user_id):
    review = review_payload(user_id)
    health = health_payload(user_id, page_size=3)
    return {
        'review': {
            'date': review['date'],
            'total': review['total'],
            'handled': review['handled'],
            'pending': review['pending'],
            'streak': review['streak'],
            'lead_item': next((item for item in review['items'] if item['status'] == 'pending'), None),
        },
        'health': {
            'score': health['score'],
            'status': health['status'],
            'severity_counts': health['severity_counts'],
            'total': sum(health['severity_counts'].values()),
        },
    }
