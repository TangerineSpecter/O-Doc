import hashlib
from django.db import transaction
from django.contrib.auth import get_user_model
from message.models import Notification
from user.models import UserProfile
from .travel_models import TravelJourney


@transaction.atomic
def notify(journey, key, reason):
    row = TravelJourney.objects.select_for_update().get(pk=journey.pk)
    state = dict(row.snapshot)
    notifications = list(state.get('notifications', []))
    if key in notifications:
        return
    profile = UserProfile.objects.filter(userid=row.owner_id).select_related('user').first()
    user = profile.user if profile else get_user_model().objects.filter(username=row.owner_id).first()
    if user is None:
        return
    notice_id = hashlib.sha256(f'travel:{row.pk}:{key}'.encode()).hexdigest()[:40]
    Notification.objects.get_or_create(pk=notice_id, defaults={'user': user, 'title': '旅行任务需要处理',
        'content': str(reason)[:1000], 'type': 'warning', 'link': f'/agent-world?travel={row.pk}'})
    notifications.append(key)
    state['notifications'] = notifications
    row.snapshot = state
    row.save(update_fields=['snapshot', 'updated_at'])
    journey.snapshot = state
