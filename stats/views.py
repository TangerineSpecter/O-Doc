from django.db import transaction, models
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from article.models import Article
from stats.models import ReadStat
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

                # 需要在 Article 模型里先加一个 total_read_seconds 字段
                Article.objects.filter(article_id=article_id).update(
                    total_read_seconds=models.F('total_read_seconds') + duration
                )

            return success_result()

        except Exception as e:
            # 统计接口报错不应影响主业务，打印日志即可
            print(f"Stats Error: {str(e)}")
            return error_result(ErrorCode.SYSTEM_ERROR, str(e))
