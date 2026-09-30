"""账号隔离的朋友圈、通知与社交配置接口，不在请求中启动模型。"""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.response_utils import success_result, valid_result
from utils.drf_utils import get_current_user_identifier
from article.annotation_service import get_user_identity
from .farm_gate import guarded
from .social_models import Moment, MomentComment, SocialInbox
from .social_content import publish, comment, like, delete_moment, moment_data, comment_data
from .social_discussion import user_actor
from .social_config import config_for, settings_for, validate


def identity_for(request):
    row = get_user_identity(request)
    return {'name': row.get('creator_name', ''), 'avatar': row.get('creator_avatar', '')}


class SocialView(APIView):
    permission_classes = [IsAuthenticated]
    kind = 'moments'

    def get(self, request, identity=None):
        owner = get_current_user_identifier(request)
        actor = user_actor(owner)
        if self.kind == 'config':
            config = config_for(owner)
            from .life_models import LifeProfile
            from system_settings.models import Agent
            ids = LifeProfile.objects.filter(owner_id=owner).values_list('pk', flat=True)
            return success_result({'settings': settings_for(config), 'overrides': config.overrides,
                'agents': list(Agent.objects.filter(pk__in=ids).values('id', 'name'))})
        if self.kind == 'inbox':
            notifications = SocialInbox.objects.filter(owner_id=owner, target_id=actor).exclude(status='invalid')
            rows = notifications.order_by('-created_at')[:100]
            items = list(rows.values())
            from article.models import Article
            post_ids = [r['content_id'] for r in items if r['source_kind'] == 'post']
            posts = dict(Article.objects.filter(pk__in=post_ids, is_valid=True).values_list('pk', 'coll_id'))
            for item in items:
                if item['source_kind'] == 'post' and item['content_id'] in posts:
                    item['content_url'] = f"/article/{posts[item['content_id']]}/{item['content_id']}#comment-{item['source_id']}"
            return success_result({'items': items, 'unread': notifications.filter(read_at=None).count()})
        if self.kind == 'comments':
            if not Moment.objects.filter(pk=identity, owner_id=owner, is_valid=True).exists(): return valid_result('动态不存在', status=404)
            rows = MomentComment.objects.filter(moment_id=identity, is_valid=True).order_by('created_at', 'pk')
            return success_result({'comments': [comment_data(c) for c in rows]})
        rows = Moment.objects.filter(owner_id=owner, is_valid=True).order_by('-created_at', '-pk')
        selected = request.query_params.get('actor_id') or request.query_params.get('actorId')
        if selected == 'me': selected = actor
        if selected: rows = rows.filter(actor_id=selected)
        if request.query_params.get('related') == '1':
            incoming = SocialInbox.objects.filter(owner_id=owner, target_id=actor, source_kind='moment').values_list('content_id', flat=True)
            touched = MomentComment.objects.filter(actor_id=actor, moment__owner_id=owner).values_list('moment_id', flat=True)
            rows = rows.filter(Q(actor_id=actor) | Q(pk__in=incoming) | Q(pk__in=touched) | Q(likes__actor_id=actor, likes__is_valid=True)).distinct()
        cursor = request.query_params.get('before')
        if cursor:
            marker = rows.filter(pk=cursor).first()
            if marker: rows = rows.filter(Q(created_at__lt=marker.created_at) | Q(created_at=marker.created_at, pk__lt=marker.pk))
        values = list(rows[:31])
        return success_result({'moments': [moment_data(r, actor) for r in values[:30]],
                               'next_cursor': values[29].pk if len(values) > 30 else None})

    @guarded
    @transaction.atomic
    def post(self, request, identity=None):
        owner = get_current_user_identifier(request)
        actor = user_actor(owner)
        try:
            if self.kind == 'config':
                config = config_for(owner)
                config.settings = validate(owner, request.data.get('settings', {}))
                overrides = request.data.get('overrides', {})
                if not isinstance(overrides, dict): raise ValueError('角色覆盖配置无效')
                from .life_models import LifeProfile
                if LifeProfile.objects.filter(owner_id=owner, pk__in=overrides).count() != len(overrides): raise ValueError('角色不属于此世界')
                config.overrides = {k: validate(owner, v, override=True) for k, v in overrides.items()}
                for actor_id in config.overrides:
                    validate(owner, settings_for(config, actor_id))
                config.save()
                from .social_migration import seed_legacy_relations
                seed_legacy_relations(owner)
                return self.get(request)
            if self.kind == 'inbox':
                SocialInbox.objects.filter(owner_id=owner, target_id=actor, pk=identity).update(read_at=timezone.now())
                return success_result({'read': True})
            if self.kind == 'comments':
                row = comment(owner, identity, actor, identity_for(request), request.data.get('content'),
                              request.data.get('parent_id', ''), request.data.get('reply_to_actor_id', ''))
                return success_result({'comment': comment_data(row)})
            if self.kind == 'like':
                like(owner, identity, actor, identity_for(request), request.data.get('active'))
                return success_result(moment_data(Moment.objects.get(pk=identity, owner_id=owner), actor))
            if self.kind == 'recover-image':
                row = Moment.objects.select_for_update().get(pk=identity, owner_id=owner, is_valid=True)
                if not row.image_state.get('request'): raise ValueError('没有可查询的配图请求')
                row.image_state = {**row.image_state, 'status': 'pending', 'manual': True}
                row.image_state.pop('polled_at', None)
                row.save()
                from .social_media import queue_manual_image
                queue_manual_image(row)
                return success_result(moment_data(row, actor))
            if self.kind == 'regenerate':
                from .social_media import retry_image, queue_manual_image
                row = Moment.objects.select_for_update().get(pk=identity, owner_id=owner, is_valid=True)
                retry_image(row)
                queue_manual_image(row)
                return success_result(moment_data(row, actor))
            row = publish(owner, actor, identity_for(request), request.data.get('content'), request.data.get('images', []))
            return success_result({'moment': moment_data(row, actor)})
        except (ValueError, TypeError) as exc: return valid_result(str(exc), status=400)
        except (Moment.DoesNotExist, MomentComment.DoesNotExist): return valid_result('动态或评论不存在', status=404)

    @guarded
    def delete(self, request, identity):
        owner = get_current_user_identifier(request)
        try:
            delete_moment(owner, identity, user_actor(owner))
            return success_result({'deleted': True})
        except Moment.DoesNotExist: return valid_result('无法删除此动态', status=404)
