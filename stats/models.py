from django.db import models


class ReadStat(models.Model):
    """
    阅读统计记录表
    记录谁(User/IP)、在什么时候、看了哪篇文章、看了多久
    """
    # 关联文章
    article = models.ForeignKey(
        'article.Article',
        on_delete=models.CASCADE,
        related_name='read_stats',
        verbose_name="文章",
        help_text="关联的文章"
    )

    # 用户标识 (如果是登录用户存ID，游客存IP或指纹)
    user_identifier = models.CharField(
        max_length=64,
        db_index=True,
        verbose_name="用户标识",
        help_text="登录用户ID或游客IP"
    )

    # 单词阅读时长 (秒)
    duration = models.PositiveIntegerField(
        default=0,
        verbose_name="阅读时长(秒)",
        help_text="该次访问的停留时长"
    )

    # 记录时间
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="记录时间"
    )

    class Meta:
        verbose_name = "阅读统计"
        verbose_name_plural = "阅读统计"
        db_table = "stats_read_record"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.article.title} - {self.duration}s"
