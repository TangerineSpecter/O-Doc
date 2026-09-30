"""保留完整状态变化，以事件截止时间还原历史榜单。"""
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from article.models import Article, ArticlePostComment, ArticlePostRating
from system_settings.sync_state import is_tracking_suspended
from .models import WorldChange
from .identity import actor_key, author


def payload(instance) -> tuple[str, dict]:
    if isinstance(instance, Article):
        recipient = author(instance)
        return 'post', {'post_id': instance.pk, 'collection_id': instance.coll_id, 'title': instance.title,
                        'author_id': (recipient.pk if recipient else instance.agent_post_author_id), 'creator_id': instance.agent_post_creator_id,
                        'author_name': instance.agent_post_creator_name, 'created_at': instance.created_at.isoformat(),
                        'valid': instance.is_valid, 'permission': instance.permission}
    rating = isinstance(instance, ArticlePostRating)
    return ('rating' if rating else 'comment'), {
        'post_id': instance.article_id, 'actor': actor_key(instance.actor_agent_id, instance.rater_id if rating else instance.creator_id),
        'valid': instance.is_valid, 'rating': instance.rating if rating else None,
    }


def record(instance, deleted=False) -> None:
    kind, data = payload(instance)
    if deleted:
        data['valid'] = False
    previous = WorldChange.objects.filter(kind=kind, object_id=instance.pk).order_by('-occurred_at', '-id').first()
    if previous and previous.payload == data:
        return
    WorldChange.objects.create(kind=kind, object_id=instance.pk, payload=data)


@receiver(post_save, sender=Article)
@receiver(post_save, sender=ArticlePostComment)
@receiver(post_save, sender=ArticlePostRating)
def track_change(sender, instance, raw=False, **kwargs):
    if raw or is_tracking_suspended():
        return
    record(instance)


@receiver(post_delete, sender=Article)
@receiver(post_delete, sender=ArticlePostComment)
@receiver(post_delete, sender=ArticlePostRating)
def track_delete(sender, instance, **kwargs):
    if not is_tracking_suspended():
        record(instance, deleted=True)


@receiver(post_save, sender='system_settings.Agent')
def track_agent_opening(sender, instance, created=False, raw=False, **kwargs):
    if created and not raw and not is_tracking_suspended():
        from .income import ensure_opening
        ensure_opening(instance)


@receiver(post_save, sender=Article)
def invalidate_social_post(sender, instance, raw=False, **kwargs):
    if raw or instance.is_valid or is_tracking_suspended(): return
    from .social_discussion import post_owner, invalidate
    from .social_models import SocialInbox
    from django.utils import timezone
    SocialInbox.objects.filter(source_kind='post', content_id=instance.pk, status__in=['pending', 'deferred']).update(status='invalid', updated_at=timezone.now())


@receiver(post_delete, sender=Article)
def invalidate_deleted_social_post(sender, instance, **kwargs):
    if is_tracking_suspended(): return
    from .social_discussion import post_owner, invalidate
    from .social_models import SocialInbox
    from django.utils import timezone
    SocialInbox.objects.filter(source_kind='post', content_id=instance.pk, status__in=['pending', 'deferred']).update(status='invalid', updated_at=timezone.now())


@receiver(post_save, sender=ArticlePostComment)
@receiver(post_delete, sender=ArticlePostComment)
def invalidate_social_comment(sender, instance, raw=False, signal=None, **kwargs):
    if raw or is_tracking_suspended(): return
    if signal == post_delete or not instance.is_valid:
        from .social_models import SocialInbox
        from django.utils import timezone
        SocialInbox.objects.filter(source_kind='post', source_id=instance.pk, status__in=['pending', 'deferred']).update(status='invalid', updated_at=timezone.now())
