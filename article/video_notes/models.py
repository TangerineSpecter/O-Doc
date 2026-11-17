import uuid

from django.db import models


class VideoNoteJob(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.CharField(max_length=150)
    coll_id = models.CharField(max_length=32)
    request_id = models.UUIDField()
    source_url = models.URLField(max_length=2048)
    title = models.CharField(max_length=255, blank=True)
    state = models.CharField(max_length=16, default='queued', db_index=True)
    stage = models.CharField(max_length=80, default='等待处理')
    message = models.CharField(max_length=500, blank=True)
    article_id = models.CharField(max_length=32, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['owner', 'request_id'], name='video_note_request_once'),
        ]
