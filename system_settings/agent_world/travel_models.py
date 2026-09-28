"""旅行目的地与本机种子导入记录。"""
from django.db import models
from django.utils import timezone


class TravelDestination(models.Model):
    # GeoNames 数字 ID 保持跨设备稳定，不按城市名称去重。
    id = models.CharField(primary_key=True, max_length=32)
    country_code = models.CharField(max_length=2, db_index=True)
    country = models.CharField(max_length=200)
    region = models.CharField(max_length=300, blank=True)
    city = models.CharField(max_length=300)
    original_name = models.CharField(max_length=300, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    enabled = models.BooleanField(default=True, db_index=True)
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.CheckConstraint(condition=models.Q(price__gt=0), name='travel_price_positive')]

    def save(self, *args, **kwargs):
        self.updated_at = timezone.now()
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {'updated_at'}
        super().save(*args, **kwargs)


class TravelSeedState(models.Model):
    """本机已导入文件的散列；不参与同步。"""
    id = models.CharField(primary_key=True, max_length=64)
    imported_at = models.DateTimeField(default=timezone.now)
    row_count = models.PositiveIntegerField()

    class Meta:
        app_label = 'system_settings'


class TravelJourney(models.Model):
    id = models.CharField(primary_key=True, max_length=64)
    task = models.ForeignKey('system_settings.AgentTask', null=True, on_delete=models.SET_NULL)
    agent = models.ForeignKey('system_settings.Agent', null=True, on_delete=models.SET_NULL)
    actor_id = models.CharField(max_length=40, db_index=True)
    owner_id = models.CharField(max_length=40)
    status = models.CharField(max_length=24, default='active', db_index=True)
    phase = models.CharField(max_length=24, default='choose')
    snapshot = models.JSONField(default=dict)
    destination_id = models.CharField(max_length=32, blank=True)
    departed_at = models.DateTimeField(null=True)
    arrived_at = models.DateTimeField(null=True)
    returned_at = models.DateTimeField(null=True)
    article_id = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'
        ordering = ['-created_at', '-id']


class TravelNode(models.Model):
    id = models.CharField(primary_key=True, max_length=100)
    journey = models.ForeignKey(TravelJourney, on_delete=models.CASCADE, related_name='nodes')
    kind = models.CharField(max_length=24)
    status = models.CharField(max_length=24, default='pending')
    input = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    error = models.CharField(max_length=1000, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'system_settings'


class AgentInventoryItem(models.Model):
    id = models.CharField(primary_key=True, max_length=140)
    actor_id = models.CharField(max_length=40, db_index=True)
    owner_id = models.CharField(max_length=40, default='')
    actor_name = models.CharField(max_length=50, blank=True, default='')
    origin_actor_id = models.CharField(max_length=40, blank=True, default='')
    origin_actor_name = models.CharField(max_length=50, blank=True, default='')
    rarity = models.CharField(max_length=16, default='common', choices=[('common', '普通'), ('uncommon', '精良'), ('rare', '稀有'), ('epic', '史诗'), ('legendary', '传说')])
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=24, default='souvenir')
    quantity = models.PositiveIntegerField()
    source = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
        constraints = [models.CheckConstraint(condition=models.Q(quantity__gt=0), name='inventory_quantity_positive'),
            models.CheckConstraint(condition=models.Q(value__gte=0), name='inventory_value_nonnegative')]


class TravelRuntime(models.Model):
    """本机节点锁、重试计数、队列时间及补图轮询；不同步。"""
    id = models.CharField(primary_key=True, max_length=100)
    token = models.CharField(max_length=64, blank=True)
    until = models.DateTimeField(null=True)
    next_at = models.DateTimeField(default=timezone.now)
    attempts = models.PositiveIntegerField(default=0)
    photo_started_at = models.DateTimeField(null=True)
    authorized = models.BooleanField(default=False)

    class Meta:
        app_label = 'system_settings'


class TravelMaterialCache(models.Model):
    id = models.CharField(primary_key=True, max_length=32)
    materials = models.JSONField(default=list)
    prepared = models.JSONField(default=dict)
    fetched_at = models.DateTimeField(default=timezone.now)

    class Meta:
        app_label = 'system_settings'
