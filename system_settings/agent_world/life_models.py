"""生活意向参与同步；执行授权继续使用既有本机租约。"""
import uuid
from django.db import models
from django.utils import timezone


def life_id():
    return uuid.uuid4().hex


class LifeTimedModel(models.Model):
    class Meta:
        abstract=True

    def save(self,*args,**kwargs):
        from .farm_gate import farm_gate
        with farm_gate():return self._save_life(*args,**kwargs)

    def _save_life(self,*args,**kwargs):
        from .life_time import storage_time
        for field in self._meta.fields:
            if isinstance(field,models.DateTimeField):
                value=getattr(self,field.attname)
                if value is not None:setattr(self,field.attname,storage_time(value))
        return super().save(*args,**kwargs)


class LifeConfig(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)  # owner
    settings = models.JSONField(default=dict)
    paused_agents = models.JSONField(default=list)
    migrated = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)


class LifeProfile(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40)  # stable actor
    owner_id = models.CharField(max_length=40, db_index=True)
    preferences = models.TextField(blank=True)
    direction = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class LifeGoal(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40, default=life_id)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    title = models.CharField(max_length=200)
    condition = models.JSONField(default=dict)  # kind: subjective, savings, travel, inventory
    progress = models.TextField(blank=True)
    status = models.CharField(max_length=16, default='active')
    reason = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class LifeCycle(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    snapshot = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class LifeItem(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=64)
    owner_id = models.CharField(max_length=40, db_index=True)
    actor_id = models.CharField(max_length=40, db_index=True)
    cycle = models.ForeignKey(LifeCycle, null=True, on_delete=models.PROTECT)
    original_at = models.DateTimeField()
    scheduled_at = models.DateTimeField(db_index=True)
    activity = models.CharField(max_length=32, default='unplanned')
    task_id = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=16, default='pending')
    intent = models.TextField(blank=True)
    budget = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    spent = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    record_id = models.CharField(max_length=40, blank=True)
    context = models.JSONField(default=dict)
    result = models.JSONField(default=dict)
    attempts = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['owner_id', 'actor_id', 'status'], name='life_owner_actor_state')]


class LifeRevision(LifeTimedModel):
    id = models.CharField(primary_key=True, max_length=40, default=life_id)
    item = models.ForeignKey(LifeItem, on_delete=models.CASCADE, related_name='revisions')
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    reason = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)


class LifeIntegrity(models.Model):
    id = models.CharField(primary_key=True, max_length=40)
    hashes = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
