from django.db import transaction
from django.db.models import F
from django.utils import timezone

from article.models import Article
from .models import ReadStat


@transaction.atomic
def record_duration(article_id, reader, seconds):
    rows = ReadStat.objects.filter(article_id=article_id, user_identifier=reader,
                                   created_at__date=timezone.now().date()).order_by('pk')
    # Existing duplicate rows can come from earlier heartbeats or restored data.
    stat = rows.first()
    if stat is None:
        # A missing daily row cannot be locked. Serialize first writes on its article,
        # then recheck after another reader's transaction may have committed.
        if not Article.objects.select_for_update().filter(pk=article_id).exists():
            return False
        stat = rows.first()
        if stat is None:
            ReadStat.objects.create(article_id=article_id, user_identifier=reader, duration=seconds)
            return True
    stat.duration = F('duration') + seconds
    stat.save(update_fields=['duration'])
    return True
