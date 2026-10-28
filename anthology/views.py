from collections import defaultdict

from django.db.models import Count, F, Q, Window
from django.db.models.functions import RowNumber
from django.shortcuts import get_object_or_404
from django.http import Http404
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from utils.response_utils import valid_result

from article.models import Article, Image, ArticlePostRating, ArticlePostComment
from article.access import get_visible_article_queryset
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result
from .models import Anthology, Book, BookReadingProgress
from .serializers import AnthologySerializer


def get_visible_anthology_queryset(request):
    """
    游客只能访问公开文集；登录用户可访问公开文集和自己创建的私密文集。
    当前系统的 admin 业务用户通过 get_current_user_identifier 兼容为 user_id='admin'。
    """
    from novel.access import visible_anthologies
    queryset = visible_anthologies(Anthology.objects.filter(is_valid=True), request)
    if request.user and request.user.is_authenticated:
        current_user_id = get_current_user_identifier(request)
        return queryset.filter(
            Q(user_id=current_user_id)
            | (Q(permission='public') & ~Q(type__in=['learning', 'quant', 'backtest']))
        )
    return queryset.filter(permission='public').exclude(type__in=['learning', 'quant', 'backtest'])


def get_owned_anthology_queryset(request):
    queryset = Anthology.objects.filter(user_id=get_current_user_identifier(request), is_valid=True)
    return queryset if request.user.is_authenticated else queryset.exclude(type__in=['learning', 'novel', 'quant', 'backtest'])


def _count_map(queryset, field):
    """按字段分组统计条目数，供文集列表批量复用（pk 兼容非 id 主键模型，如 Image）。"""
    return {row[field]: row['total'] for row in queryset.values(field).annotate(total=Count('pk'))}


def _build_anthology_count_maps(anthologies):
    """一次批量统计各类型文集条目数，避免每个文集各发 2-4 条 COUNT。"""
    maps = {
        'novel': {}, 'novel_published': {}, 'novel_adopted': {},
        'quant': {}, 'backtest': {}, 'image': {},
        'learning': {}, 'learning_pending': {}, 'book': {},
    }
    by_type = defaultdict(list)
    for anthology in anthologies:
        by_type[anthology.type].append(anthology)

    novel_ids = [anthology.pk for anthology in by_type['novel']]
    if novel_ids:
        from novel.models import Chapter
        from novel.access import published_chapters
        base = Chapter.objects.filter(project_id__in=novel_ids, is_valid=True)
        maps['novel'] = _count_map(base, 'project_id')
        maps['novel_published'] = _count_map(published_chapters(base), 'project_id')
        maps['novel_adopted'] = _count_map(base.exclude(adopted_id=''), 'project_id')

    quant_ids = [anthology.pk for anthology in by_type['quant']]
    if quant_ids:
        from quant.models import Entry
        maps['quant'] = _count_map(Entry.objects.filter(anthology_id__in=quant_ids, is_valid=True), 'anthology_id')

    backtest_ids = [anthology.pk for anthology in by_type['backtest']]
    if backtest_ids:
        from quant.models import MT4Expert
        maps['backtest'] = _count_map(MT4Expert.objects.filter(anthology_id__in=backtest_ids, is_valid=True), 'anthology_id')

    image_ids = [anthology.coll_id for anthology in by_type['image']]
    if image_ids:
        maps['image'] = _count_map(Image.objects.filter(coll_id__in=image_ids, is_valid=True), 'coll_id')

    learning_ids = [anthology.pk for anthology in by_type['learning']]
    if learning_ids:
        from learning.models import Exercise
        from learning.services import ACTIVE
        graded = Exercise.objects.filter(course_id__in=learning_ids, attempt__grade__isnull=False)
        maps['learning'] = {
            row['course_id']: row['total']
            for row in graded.values('course_id').annotate(total=Count('pk', distinct=True))
        }
        pending = Exercise.objects.filter(course_id__in=learning_ids, status__in=ACTIVE)
        maps['learning_pending'] = _count_map(pending, 'course_id')

    book_ids = [anthology.pk for anthology in by_type['book']]
    if book_ids:
        maps['book'] = _count_map(Book.objects.filter(anthology_id__in=book_ids, is_valid=True), 'anthology_id')

    return maps


def _image_cover_summaries(anthologies):
    """Batch the latest twelve cover photos per visible, non-hidden collection."""
    ids = [anthology.pk for anthology in anthologies if anthology.type == 'image' and not anthology.hide_cover_content]
    if not ids:
        return {}
    images = (Image.objects.filter(coll_id__in=ids, is_valid=True)
              .annotate(cover_rank=Window(expression=RowNumber(), partition_by=[F('coll_id')],
                                          order_by=F('created_at').desc()))
              .filter(cover_rank__lte=12)
              .order_by('coll_id', '-created_at')
              .values('coll_id', 'image_id', 'title', 'image_url', 'created_at'))
    summaries = defaultdict(list)
    for image in images:
        summaries[image['coll_id']].append({
            'image_id': image['image_id'], 'imageId': image['image_id'], 'title': image['title'],
            'image_url': image['image_url'], 'imageUrl': image['image_url'],
            'date': image['created_at'].strftime('%m-%d'),
        })
    return summaries


def _book_cover_summaries(anthologies):
    """Batch the latest twelve book covers per visible, non-hidden collection."""
    ids = [anthology.pk for anthology in anthologies if anthology.type == 'book' and not anthology.hide_cover_content]
    if not ids:
        return {}
    books = (Book.objects.filter(anthology_id__in=ids, is_valid=True)
             .annotate(cover_rank=Window(expression=RowNumber(), partition_by=[F('anthology_id')],
                                         order_by=F('updated_at').desc()))
             .filter(cover_rank__lte=12)
             .order_by('anthology_id', '-updated_at')
             .values('anthology_id', 'book_id', 'title', 'updated_at'))
    summaries = defaultdict(list)
    for book in books:
        book_id = book['book_id']
        cover_url = f'/api/anthology/book/{book_id}/cover'
        summaries[book['anthology_id']].append({
            'book_id': book_id, 'bookId': book_id, 'title': book['title'],
            'cover_url': cover_url, 'coverUrl': cover_url, 'date': book['updated_at'].strftime('%m-%d'),
        })
    return summaries


def _agent_cover_summaries(request, anthologies):
    """Batch visible recent posts and interaction counts for Agent collection cards."""
    ids = [anthology.pk for anthology in anthologies if anthology.type == 'agent' and not anthology.hide_cover_content]
    if not ids:
        return {}
    posts = list(get_visible_article_queryset(request).filter(coll_id__in=ids)
                 .annotate(cover_rank=Window(expression=RowNumber(), partition_by=[F('coll_id')],
                                             order_by=F('created_at').desc()))
                 .filter(cover_rank__lte=3)
                 .order_by('coll_id', '-created_at')
                 .values('article_id', 'coll_id', 'title', 'created_at', 'post_summary',
                         'agent_post_creator_id', 'agent_post_creator_name', 'agent_post_creator_avatar',
                         'agent_post_category', 'agent_post_rating'))
    if not posts:
        return {}
    post_ids = [post['article_id'] for post in posts]
    ratings = _count_map(ArticlePostRating.objects.filter(article_id__in=post_ids, is_valid=True).order_by(), 'article_id')
    comments = _count_map(ArticlePostComment.objects.filter(article_id__in=post_ids, is_valid=True).order_by(), 'article_id')
    summaries = defaultdict(list)
    for post in posts:
        created_at = post['created_at']
        summaries[post['coll_id']].append({
            'article_id': post['article_id'], 'title': post['title'], 'date': created_at.strftime('%m-%d'),
            'summary': post['post_summary'], 'agent_id': post['agent_post_creator_id'],
            'agent_name': post['agent_post_creator_name'] or 'Agent', 'agent_avatar': post['agent_post_creator_avatar'],
            'category': post['agent_post_category'], 'rating': post['agent_post_rating'],
            'rating_count': ratings.get(post['article_id'], 0), 'comment_count': comments.get(post['article_id'], 0),
            'created_at': created_at.isoformat() if created_at else None,
        })
    return summaries


def _article_cover_summaries(request, anthologies):
    """Batch ordinary collection cards while retaining their manual sort order."""
    special_types = {'agent', 'book', 'image', 'learning', 'novel', 'quant', 'backtest'}
    ids = [anthology.pk for anthology in anthologies
           if anthology.type not in special_types and not anthology.hide_cover_content]
    if not ids:
        return {}
    articles = (get_visible_article_queryset(request).filter(coll_id__in=ids)
                .annotate(cover_rank=Window(expression=RowNumber(), partition_by=[F('coll_id')],
                                            order_by=[F('sort').asc(), F('updated_at').desc()]))
                .filter(cover_rank__lte=3)
                .order_by('coll_id', 'sort', '-updated_at')
                .values('article_id', 'coll_id', 'title', 'updated_at'))
    summaries = defaultdict(list)
    for article in articles:
        summaries[article['coll_id']].append({
            'article_id': article['article_id'], 'title': article['title'],
            'date': article['updated_at'].strftime('%m-%d'),
        })
    return summaries


def _research_cover_summaries(anthologies):
    """Batch owner-visible quant and MT4 cards with their original tie ordering."""
    summaries = defaultdict(list)
    for kind in ('quant', 'backtest'):
        ids = [anthology.pk for anthology in anthologies if anthology.type == kind and not anthology.hide_cover_content]
        if not ids:
            continue
        if kind == 'quant':
            from quant.models import Entry
            model, title_field, tie_order = Entry, 'title', '-id'
        else:
            from quant.models import MT4Expert
            model, title_field, tie_order = MT4Expert, 'name', 'id'
        tie_expression = F('id').desc() if tie_order == '-id' else F('id').asc()
        rows = (model.objects.filter(anthology_id__in=ids, is_valid=True)
                .annotate(cover_rank=Window(expression=RowNumber(), partition_by=[F('anthology_id')],
                                            order_by=[F('updated_at').desc(), tie_expression]))
                .filter(cover_rank__lte=3)
                .order_by('anthology_id', '-updated_at', tie_order)
                .values('id', 'anthology_id', title_field, 'updated_at'))
        for row in rows:
            summaries[row['anthology_id']].append({
                'entry_id': row['id'], 'title': row[title_field], 'date': row['updated_at'].strftime('%m-%d'),
            })
    return summaries


def _novel_cover_summaries(request, anthologies):
    """Batch author and published-reader previews without loading manuscripts."""
    from novel.models import Chapter, Revision
    from novel.access import published_chapters

    owner = get_current_user_identifier(request) if request.user.is_authenticated else None
    visible = [anthology for anthology in anthologies if anthology.type == 'novel' and not anthology.hide_cover_content]
    owned_ids = [anthology.pk for anthology in visible if owner is not None and anthology.user_id == owner]
    reader_ids = [anthology.pk for anthology in visible if owner is None or anthology.user_id != owner]
    summaries = defaultdict(list)
    for ids, is_owner in ((owned_ids, True), (reader_ids, False)):
        if not ids:
            continue
        chapters = Chapter.objects.filter(project_id__in=ids, is_valid=True)
        if not is_owner:
            chapters = published_chapters(chapters)
        chapters = list(chapters.annotate(cover_rank=Window(
            expression=RowNumber(), partition_by=[F('project_id')],
            order_by=[F('position').asc(), F('created_at').asc(), F('id').asc()],
        )).filter(cover_rank__lte=3).order_by('project_id', 'position', 'created_at', 'id')
            .values('id', 'project_id', 'title', 'published_id', 'created_at'))
        revision_titles = {}
        if not is_owner:
            revision_ids = [chapter['published_id'] for chapter in chapters if chapter['published_id']]
            if revision_ids:
                revision_titles = {(revision_id, chapter_id): title for revision_id, chapter_id, title in
                                   Revision.objects.filter(pk__in=revision_ids).values_list('id', 'chapter_id', 'title')}
        for chapter in chapters:
            title = chapter['title'] if is_owner else revision_titles.get((chapter['published_id'], chapter['id']))
            if title is None:
                continue
            summaries[chapter['project_id']].append({
                'chapter_id': chapter['id'], 'title': title, 'date': chapter['created_at'].strftime('%m-%d'),
            })
    return summaries


class AnthologyCreateView(APIView):
    """创建文集接口"""

    def post(self, request):
        # time.sleep(10)
        # 使用序列化器验证和保存数据
        serializer = AnthologySerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        # 保存新的文集
        anthology = serializer.save()

        # 使用统一的成功响应格式，使用预定义的成功错误码
        json_data = AnthologySerializer(anthology, context={'request': request}).data
        return success_result(json_data)


class AnthologyDetailView(APIView):
    """根据coll_id获取文集详情接口"""

    def get(self, request, coll_id):
        # 使用coll_id查询文集
        anthology = get_object_or_404(get_visible_anthology_queryset(request), coll_id=coll_id)

        # 使用序列化器将文集对象转换为JSON格式
        json_data = AnthologySerializer(anthology, context={'request': request}).data
        if anthology.type == 'novel':
            from novel.models import Chapter
            from novel.access import published_chapters
            if not request.user.is_authenticated or anthology.user_id != get_current_user_identifier(request):
                json_data['count'] = published_chapters(Chapter.objects.filter(project_id=coll_id, is_valid=True)).count()

        # HiddenField 不返回所属用户；前端管理入口使用服务端计算的权限。
        json_data['can_manage'] = bool(
            request.user.is_authenticated
            and anthology.user_id == get_current_user_identifier(request)
        )
        return success_result(json_data)


class AnthologyListView(APIView):
    """
    文集列表视图
    游客查询公开文集；登录用户查询公开文集和自己创建的私密文集，每个文集包含前3个文章
    """

    def get(self, request):
        try:
            # 获取筛选参数
            coll_type = request.query_params.get('type')

            anthologies = get_visible_anthology_queryset(request)
            if coll_type:
                anthologies = anthologies.filter(type=coll_type)

            # 查询用户可见的有效文集，按置顶、排序升序排序
            anthologies = list(anthologies.select_related('novel').order_by('-is_top', 'sort'))
            count_maps = _build_anthology_count_maps(anthologies)
            image_cover_summaries = _image_cover_summaries(anthologies)
            book_cover_summaries = _book_cover_summaries(anthologies)
            agent_cover_summaries = _agent_cover_summaries(request, anthologies)
            article_cover_summaries = _article_cover_summaries(request, anthologies)
            research_cover_summaries = _research_cover_summaries(anthologies)
            novel_cover_summaries = _novel_cover_summaries(request, anthologies)
            try:
                from system_settings.embedding_recovery import get_local_article_pending_counts

                local_rag_pending_by_collection = get_local_article_pending_counts()
            except Exception:
                local_rag_pending_by_collection = None

            # 准备返回数据
            result_list = []

            for anthology in anthologies:
                item_summaries = []
                item_count = anthology.count
                if anthology.type == 'novel':
                    from novel.presentation import anthology_description
                    own = request.user.is_authenticated and anthology.user_id == get_current_user_identifier(request)
                    item_count = (count_maps['novel'] if own else count_maps['novel_published']).get(anthology.pk, 0)
                    if not anthology.hide_cover_content:
                        item_summaries = novel_cover_summaries.get(anthology.pk, [])
                elif anthology.type == 'quant':
                    item_count = count_maps['quant'].get(anthology.pk, 0)
                    if not anthology.hide_cover_content:
                        item_summaries = research_cover_summaries.get(anthology.pk, [])
                elif anthology.type == 'backtest':
                    item_count = count_maps['backtest'].get(anthology.pk, 0)
                    if not anthology.hide_cover_content:
                        item_summaries = research_cover_summaries.get(anthology.pk, [])
                elif anthology.type == 'image':
                    item_count = count_maps['image'].get(anthology.coll_id, 0)
                    if not anthology.hide_cover_content:
                        item_summaries = image_cover_summaries.get(anthology.coll_id, [])
                elif anthology.type == 'learning':
                    item_count = count_maps['learning'].get(anthology.pk, 0)
                elif anthology.type == 'book':
                    item_count = count_maps['book'].get(anthology.pk, 0)
                    if not anthology.hide_cover_content:
                        item_summaries = book_cover_summaries.get(anthology.pk, [])
                elif anthology.type == 'agent':
                    if not anthology.hide_cover_content:
                        item_summaries = agent_cover_summaries.get(anthology.pk, [])
                elif not anthology.hide_cover_content:
                    item_summaries = article_cover_summaries.get(anthology.coll_id, [])

                # 构建文集数据
                anthology_data = {
                    'coll_id': anthology.coll_id,
                    'user_id': anthology.user_id,
                    'title': anthology.title,
                    'count': item_count,
                    'rag_not_synced_count': anthology.rag_not_synced_count,
                    'local_rag_pending_count': (
                        local_rag_pending_by_collection.get(str(anthology.coll_id), 0)
                        if local_rag_pending_by_collection is not None and anthology.type in {'article', 'agent'}
                        else None
                    ),
                    'icon_id': anthology.icon_id,
                    'isTop': anthology.is_top,
                    'hideCoverContent': anthology.hide_cover_content,
                    'description': anthology_description(anthology, owner=own) if anthology.type == 'novel' else anthology.description,
                    'articles': item_summaries,
                    'permission': anthology.permission,
                    'can_manage': bool(request.user.is_authenticated and anthology.user_id == get_current_user_identifier(request)),
                    'type': anthology.type
                }
                if anthology.type in ('quant', 'backtest'):
                    anthology_data['updated_at'] = anthology.updated_at

                if anthology.type == 'learning':
                    anthology_data['pending_count'] = count_maps['learning_pending'].get(anthology.pk, 0)
                    anthology_data['rag_not_synced_count'] = 0
                if anthology.type in ('quant', 'backtest'):
                    anthology_data['rag_not_synced_count'] = 0
                if anthology.type == 'novel':
                    anthology_data['rag_not_synced_count'] = 0
                    if own:
                        anthology_data['adopted_count'] = count_maps['novel_adopted'].get(anthology.pk, 0)
                        anthology_data['published_count'] = count_maps['novel_published'].get(anthology.pk, 0)
                result_list.append(anthology_data)

            return success_result(data=result_list)

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AnthologySortView(APIView):
    """文集排序接口"""

    def put(self, request, coll_id):
        try:
            # 获取排序参数
            sort = request.data.get('sort', 0)
            if not isinstance(sort, int) or sort < 1:
                return error_result(error=ErrorCode.PARAM_ERROR, message="排序参数必须是大于0的整数")

            # 获取要排序的文集
            anthology = get_object_or_404(get_owned_anthology_queryset(request), coll_id=coll_id)

            # 检查是否为置顶文集，如果是则不允许排序
            if anthology.is_top:
                return error_result(error=ErrorCode.PARAM_ERROR, message="置顶文集不允许排序")

            # 获取当前所有非置顶且有效的文集，按当前排序规则排序
            all_non_top_anthologies = list(get_owned_anthology_queryset(request).filter(
                is_top=False
            ).order_by('-updated_at', 'sort'))

            # 找到当前文集在列表中的位置
            current_index = None
            for i, item in enumerate(all_non_top_anthologies):
                if item.coll_id == coll_id:
                    current_index = i
                    break

            if current_index is None:
                return error_result(error=ErrorCode.PARAM_ERROR, message="文集不存在")

            # 确保目标位置在有效范围内
            max_position = len(all_non_top_anthologies)
            target_position = min(max(sort, 1), max_position)
            target_index = target_position - 1  # 转换为0-based索引

            # 从列表中移除当前文集并插入到目标位置
            moved_anthology = all_non_top_anthologies.pop(current_index)
            all_non_top_anthologies.insert(target_index, moved_anthology)

            # 重新分配所有文集的sort值，确保连续且唯一
            for i, item in enumerate(all_non_top_anthologies):
                new_sort = i + 1  # 从1开始的连续整数
                if item.sort != new_sort:
                    item.sort = new_sort
                    item.save()

            return success_result()

        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AnthologyUpdateView(APIView):
    """文集编辑接口"""

    def put(self, request, coll_id):
        try:
            # 获取要编辑的文集
            anthology = get_object_or_404(get_owned_anthology_queryset(request), coll_id=coll_id)

            # 使用序列化器验证和更新数据
            serializer = AnthologySerializer(anthology, data=request.data, partial=True, context={'request': request})
            serializer.is_valid(raise_exception=True)

            # 保存更新
            updated_anthology = serializer.save()

            # 返回更新后的数据
            return success_result(data=AnthologySerializer(updated_anthology, context={'request': request}).data)

        except ValidationError as e:
            return valid_result(msg=str(e.detail), status=400)
        except Http404:
            return valid_result(msg='文集不存在或无权访问', status=404)
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))


class AnthologyDeleteView(APIView):
    """文集删除接口"""

    def delete(self, request, coll_id):
        try:
            # 获取要删除的文集
            anthology = get_object_or_404(get_owned_anthology_queryset(request), coll_id=coll_id)

            # 执行逻辑删除
            anthology.is_valid = False
            anthology.save()

            return success_result()

        except Http404:
            return valid_result(msg='文集不存在或无权访问', status=404)
        except Exception as e:
            return error_result(error=ErrorCode.SYSTEM_ERROR, data=str(e))
