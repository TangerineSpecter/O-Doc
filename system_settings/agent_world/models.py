"""Agent 世界持久数据；全部参与 WebDAV 同步。"""
import uuid
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


def world_id():
    return str(uuid.uuid4())


class WorldCategory(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=world_id)
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    sort = models.IntegerField(default=0)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['sort', 'id']


class WorldProfession(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=world_id)
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class WorldProfessionCategory(models.Model):
    id = models.CharField(primary_key=True, max_length=140, default=world_id)
    profession = models.ForeignKey(WorldProfession, on_delete=models.CASCADE, related_name='bonuses')
    category = models.ForeignKey(WorldCategory, on_delete=models.PROTECT)
    percentage = models.DecimalField(max_digits=12, decimal_places=4, default=0, validators=[MinValueValidator(0)])

    class Meta:
        app_label = 'system_settings'
        constraints = [models.UniqueConstraint(fields=['profession', 'category'], name='world_profession_category_unique'),
                       models.CheckConstraint(condition=models.Q(percentage__gte=0), name='world_bonus_nonnegative')]


class WorldIncomeConfig(models.Model):
    """每次保存创建一个版本；月末按 effective_at 选择配置。"""
    id = models.CharField(primary_key=True, max_length=64, default=world_id)
    effective_at = models.DateTimeField(default=timezone.now)
    enabled = models.BooleanField(default=False)
    post_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    comment_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    prize_enabled = models.BooleanField(default=False)
    first_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    second_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    third_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(0)])

    class Meta:
        app_label = 'system_settings'
        ordering = ['-effective_at', '-id']
        constraints = [models.CheckConstraint(condition=models.Q(**{f'{name}__gte': 0}), name=f'world_{name}_nonnegative')
                       for name in ['post_amount', 'comment_amount', 'first_amount', 'second_amount', 'third_amount']]


class WorldLedger(models.Model):
    # Deterministic business key also serves as the sync identity.
    id = models.CharField(primary_key=True, max_length=220)
    agent_id = models.CharField(max_length=40, db_index=True)
    agent_name = models.CharField(max_length=50, blank=True)
    kind = models.CharField(max_length=20)
    amount = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'


class WorldIncomeEvent(models.Model):
    """记录不结算的事件，避免配置开启或迁移后追补。"""
    id = models.CharField(primary_key=True, max_length=220)
    status = models.CharField(max_length=30)
    snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'


class WorldChange(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=world_id)
    kind = models.CharField(max_length=20)
    object_id = models.CharField(max_length=80, db_index=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    payload = models.JSONField(default=dict)

    class Meta:
        app_label = 'system_settings'
        ordering = ['occurred_at', 'id']


class WorldCategoryMigration(models.Model):
    id = models.CharField(primary_key=True, max_length=64, default=world_id)
    collection_id = models.CharField(max_length=80)
    old_category = models.CharField(max_length=50, blank=True)
    category = models.ForeignKey(WorldCategory, on_delete=models.PROTECT)
    post_ids = models.JSONField(default=list)
    performed_by = models.CharField(max_length=80)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'


class WorldMonthSettlement(models.Model):
    id = models.CharField(primary_key=True, max_length=160)
    collection_id = models.CharField(max_length=80)
    collection_title = models.CharField(max_length=100, blank=True, default="")
    month = models.CharField(max_length=7)
    cutoff = models.DateTimeField()
    config_id = models.CharField(max_length=64, blank=True)
    ranking = models.JSONField(default=list)
    awards = models.JSONField(default=list)
    status = models.CharField(max_length=20, default='frozen')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.UniqueConstraint(fields=['collection_id', 'month'], name='world_month_collection_unique')]
