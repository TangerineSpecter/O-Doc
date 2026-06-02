from django.db import transaction, models
from django.db.models import Sum, Count, Q
from django.db.models.functions import ExtractHour, ExtractWeekDay, TruncDate
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from article.models import Article, Image
from assets.models import Asset
from categories.models import Category
from memos.models import Memo
from stats.models import ReadStat
from tags.models import Tag
from utils.drf_utils import get_current_user_identifier
from utils.error_codes import ErrorCode
from utils.response_utils import success_result, error_result


class ReportReadDurationView(APIView):
    """
    上报阅读时长接口
    """
    permission_classes = [AllowAny]  # 允许游客上报

    def post(self, request):
        try:
            article_id = request.data.get('article_id')
            duration = request.data.get('duration')  # 增量时长或总时长，这里建议传本次新增的秒数

            if not article_id or not duration:
                return error_result()

            # 确保时长是有效数字
            try:
                duration = int(duration)
                if duration <= 0 or duration > 86400:  # 限制单次上报不超过24小时，防止脏数据
                    return success_result(msg="时长无效，已忽略")
            except ValueError:
                return error_result()

            # 1. 获取用户标识
            user_identifier = 'anonymous'
            if request.user.is_authenticated:
                user_identifier = str(request.user.id)
            else:
                # 获取IP作为标识 (简单处理)
                x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
                if x_forwarded_for:
                    user_identifier = x_forwarded_for.split(',')[0]
                else:
                    user_identifier = request.META.get('REMOTE_ADDR')

            # 2. 记录日志 (stats应用)
            # 策略A：每次心跳都存一条新记录（数据量大，但详尽）
            # 策略B：同一天同一用户同一文章只存一条，累加时长（推荐）

            from django.utils import timezone
            today = timezone.now().date()

            with transaction.atomic():
                # 查找今天该用户对该文章的记录
                stat, created = ReadStat.objects.get_or_create(
                    article_id=article_id,
                    user_identifier=user_identifier,
                    created_at__date=today,
                    defaults={'duration': 0}
                )

                # 累加时长
                stat.duration = models.F('duration') + duration
                stat.save()

            return success_result()

        except Exception as e:
            # 统计接口报错不应影响主业务，打印日志即可
            print(f"Stats Error: {str(e)}")
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))


class StatisticsView(APIView):
    """
    获取全站统计数据
    """
    permission_classes = [AllowAny]  # 根据需求，统计信息可能需要管理员权限，这里暂时放开方便展示

    def get(self, request):
        try:
            from django.utils import timezone

            try:
                selected_year = int(request.query_params.get('year') or timezone.now().year)
            except (TypeError, ValueError):
                selected_year = timezone.now().year
            current_user_id = get_current_user_identifier(request)
            visible_tag_user_ids = ['admin']
            if current_user_id != 'admin':
                visible_tag_user_ids.append(current_user_id)

            # --- 1. 核心 KPI 数据 ---
            valid_articles = Article.objects.filter(is_valid=True)

            total_articles = valid_articles.count()

            # 聚合计算字数。阅读时长以 ReadStat 为准，保持与趋势图和阅读时长榜单口径一致。
            agg_data = valid_articles.aggregate(
                total_words=Sum('word_count')
            )

            total_words = agg_data.get('total_words') or 0
            # 将秒转换为小时
            total_duration_sec = ReadStat.objects.filter(article__is_valid=True).aggregate(
                total_duration_sec=Sum('duration')
            ).get('total_duration_sec') or 0
            total_duration_hours = round(total_duration_sec / 3600, 1)

            total_assets = Asset.objects.filter(is_valid=True).count()

            # --- 2. 24小时阅读趋势 (Hourly Data) ---
            # 统计全站历史数据，按小时提取并分组 (ExtractHour)
            # 这里的 hour=ExtractHour('created_at') 会自动把所有日期的 "created_at" 提取为 0-23 的数字
            hourly_stats = ReadStat.objects.annotate(
                hour=ExtractHour('created_at')
            ).values('hour').annotate(
                visits=Count('id'),
                duration=Sum('duration')
            ).order_by('hour')

            # 格式化为 0-23 的数组
            hourly_data_map = {item['hour']: item for item in hourly_stats}
            hourly_data = []
            for i in range(24):
                item = hourly_data_map.get(i, {'visits': 0, 'duration': 0})
                hourly_data.append({
                    'hour': f"{i:02d}:00",
                    'visits': item['visits'],
                    'duration': round(item['duration'] / 60, 1)  # 转换为分钟
                })

            # --- 3. 创作习惯 (按周几发布) ---
            # 1=Sunday, 2=Monday, ..., 7=Saturday (Django ExtractWeekDay 标准)
            # 注意：不同数据库 week_day 定义可能不同，通常 1 是周日
            weekly_stats = valid_articles.annotate(
                weekday=ExtractWeekDay('created_at')
            ).values('weekday').annotate(
                count=Count('article_id')
            ).order_by('weekday')

            week_map = {1: '周日', 2: '周一', 3: '周二', 4: '周三', 5: '周四', 6: '周五', 7: '周六'}
            # 初始化所有天数为0
            weekly_data_dict = {k: 0 for k in range(1, 8)}
            for item in weekly_stats:
                weekly_data_dict[item['weekday']] = item['count']

            # 调整顺序：周一到周日 (2,3,4,5,6,7,1)
            sorted_week_keys = [2, 3, 4, 5, 6, 7, 1]
            weekly_publish = [
                {'day': week_map[k], 'count': weekly_data_dict[k]}
                for k in sorted_week_keys
            ]

            # --- 4. 分类占比 ---
            category_stats = Category.objects.annotate(
                value=Count('articles')
            ).filter(value__gt=0).values('name', 'value').order_by('-value')

            # --- 5. 热门标签 ---
            tag_stats = Tag.objects.filter(
                is_valid=True,
                user_id__in=visible_tag_user_ids
            ).annotate(
                count=Count(
                    'articles',
                    filter=Q(articles__is_valid=True),
                    distinct=True
                )
            ).filter(count__gt=0).values('name', 'count').order_by('-count')[:10]

            # --- 6. 排行榜 ---
            # 访问 TOP 5
            top_visits = valid_articles.order_by('-read_count').values('article_id', 'title', 'read_count')[:5]
            top_visits_data = [
                {'id': i + 1, 'title': item['title'], 'value': item['read_count']}
                for i, item in enumerate(top_visits)
            ]

            # 时长 TOP 5
            top_duration_qs = ReadStat.objects.filter(
                article__is_valid=True
            ).values(
                'article__article_id',
                'article__title'
            ).annotate(
                total_actual_seconds=Sum('duration')
            ).order_by('-total_actual_seconds')[:5]

            top_duration_data = []
            for i, item in enumerate(top_duration_qs):
                seconds = item['total_actual_seconds'] or 0

                # 动态单位逻辑：小于 1 小时 (3600秒) 显示分钟，否则显示小时
                if seconds < 3600:
                    val_str = f"{round(seconds / 60, 1)} 分钟"
                else:
                    val_str = f"{round(seconds / 3600, 1)} 小时"

                top_duration_data.append({
                    'id': i + 1,
                    'title': item['article__title'],
                    'value': val_str
                })

            # --- 7. 年度创作热力图 ---
            article_daily_stats = valid_articles.filter(
                created_at__year=selected_year
            ).annotate(
                date=TruncDate('created_at')
            ).values('date').annotate(
                articles=Count('article_id')
            )

            image_daily_stats = Image.objects.filter(
                is_valid=True,
                created_at__year=selected_year
            ).annotate(
                date=TruncDate('created_at')
            ).values('date').annotate(
                images=Count('image_id')
            )

            memo_daily_stats = Memo.objects.filter(
                is_valid=True,
                created_at__year=selected_year
            ).annotate(
                date=TruncDate('created_at')
            ).values('date').annotate(
                memos=Count('memo_id')
            )

            daily_creation_map = {}

            def ensure_daily_item(date_value):
                date_key = date_value.isoformat()
                if date_key not in daily_creation_map:
                    daily_creation_map[date_key] = {
                        'date': date_key,
                        'articles': 0,
                        'images': 0,
                        'memos': 0,
                        'total': 0
                    }
                return daily_creation_map[date_key]

            for item in article_daily_stats:
                daily_item = ensure_daily_item(item['date'])
                daily_item['articles'] = item['articles']

            for item in image_daily_stats:
                daily_item = ensure_daily_item(item['date'])
                daily_item['images'] = item['images']

            for item in memo_daily_stats:
                daily_item = ensure_daily_item(item['date'])
                daily_item['memos'] = item['memos']

            daily_creation = []
            for item in daily_creation_map.values():
                item['total'] = item['articles'] + item['images'] + item['memos']
                daily_creation.append(item)

            daily_creation.sort(key=lambda item: item['date'])

            return success_result(data={
                'kpi': {
                    'total_articles': total_articles,
                    'total_words': total_words,
                    'total_assets': total_assets,
                    'total_duration_hours': total_duration_hours
                },
                'hourly_data': hourly_data,
                'weekly_publish': weekly_publish,
                'category_stats': list(category_stats),
                'tag_stats': list(tag_stats),
                'top_visits': top_visits_data,
                'top_duration': top_duration_data,
                'daily_creation': daily_creation,
                'selected_year': selected_year
            })

        except Exception as e:
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))
