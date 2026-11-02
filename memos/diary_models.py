"""Personal diaries have their own records and never enter the memo/Agent feed."""
import uuid
from django.db import models
from django.utils import timezone


def diary_id():
    return uuid.uuid4().hex


def diary_today():
    now = timezone.now()
    return timezone.localtime(now).date() if timezone.is_aware(now) else now.date()


class DiaryEntry(models.Model):
    diary_id = models.CharField(primary_key=True, max_length=32, default=diary_id, editable=False)
    user_id = models.CharField(max_length=50, db_index=True)
    title = models.CharField(max_length=150)
    content = models.TextField()
    entry_date = models.DateField(default=diary_today)
    cover_url = models.URLField(max_length=1000, blank=True, default='')
    cover_asset = models.ForeignKey('assets.Asset', null=True, blank=True, on_delete=models.SET_NULL, related_name='diary_covers')
    image_asset_ids = models.JSONField(default=list, blank=True)
    mood = models.CharField(max_length=20, blank=True, default='', choices=[('happy', '开心'), ('calm', '平静'), ('excited', '兴奋'), ('tired', '疲惫'), ('sad', '低落'), ('angry', '生气')])
    weather = models.CharField(max_length=20, blank=True, default='', choices=[('sunny', '晴天'), ('cloudy', '多云'), ('overcast', '阴天'), ('rainy', '下雨'), ('snowy', '下雪'), ('windy', '有风')])
    tags = models.JSONField(default=list, blank=True)
    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'diary_entries'
        ordering = ['-entry_date', '-created_at']
