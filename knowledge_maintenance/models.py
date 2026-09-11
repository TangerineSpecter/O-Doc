import uuid

from django.db import models


class DailyReviewItem(models.Model):
    SLOT_TYPES = [
        ('old_article', '旧文章'),
        ('old_memo', '旧闪念'),
        ('recent_content', '近期内容'),
        ('reading_book', '在读图书'),
    ]
    SOURCE_TYPES = [('article', '文章'), ('memo', '闪念'), ('book', '图书')]
    STATUS_TYPES = [
        ('pending', '待处理'),
        ('completed', '已完成'),
        ('skipped', '已跳过'),
        ('replaced', '已替换'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.CharField(max_length=50, db_index=True)
    review_date = models.DateField(db_index=True)
    slot_type = models.CharField(max_length=30, choices=SLOT_TYPES)
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    source_id = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=STATUS_TYPES, default='pending')
    batch_no = models.PositiveIntegerField(default=1)
    sort_order = models.PositiveSmallIntegerField(default=0)
    reason_code = models.CharField(max_length=40)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'knowledge_daily_review_items'
        ordering = ['review_date', 'sort_order', 'created_at']
        indexes = [
            models.Index(fields=['user_id', 'review_date', 'status'], name='knowledge_r_user_da_2d3378_idx'),
            models.Index(fields=['source_type', 'source_id'], name='knowledge_r_source__fbd1c7_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user_id', 'review_date', 'batch_no', 'sort_order'],
                name='uniq_daily_review_batch_position',
            )
        ]


class HealthIssueIgnore(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.CharField(max_length=50, db_index=True)
    rule_code = models.CharField(max_length=40)
    source_type = models.CharField(max_length=20)
    source_id = models.CharField(max_length=40)
    source_fingerprint = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'knowledge_health_issue_ignores'
        indexes = [
            models.Index(fields=['user_id', 'rule_code'], name='knowledge_h_user_id_232428_idx'),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user_id', 'rule_code', 'source_type', 'source_id'],
                name='uniq_health_issue_ignore',
            )
        ]

