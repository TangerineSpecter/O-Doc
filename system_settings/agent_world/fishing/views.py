"""账号隔离、只读目录和出钓管理；不提供人工发鱼或改经验。"""
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from utils.response_utils import success_result, valid_result
from ..life_views import owner_of
from ..life_models import LifeProfile
from .models import FishingConfig, FishingTrip
from .catalog import current
from .service import configure, finish, retry
from .queries import summary, discovery, trip_data


def page(value) -> int:
    try:
        result = int(value)
    except (ValueError, TypeError):
        raise ValueError('页码无效')
    if not 1 <= result <= 100000:
        raise ValueError('页码无效')
    return result


class FishingView(APIView):
    permission_classes = [IsAuthenticated]
    section = 'overview'

    def get(self, request, identity=None):
        owner = owner_of(request)
        try:
            number = page(request.query_params.get('page', 1))
            actor = request.query_params.get('actor_id', '')
            if actor and not LifeProfile.objects.filter(pk=actor, owner_id=owner).exists():
                return valid_result('居民不存在', status=404)
            config = FishingConfig.objects.filter(pk=owner).first()
            if self.section == 'config':
                return success_result({'enabled': bool(config and config.enabled)})
            if self.section == 'catalog':
                return success_result({'rules': current(owner), 'discovery': discovery(owner, actor)})
            if self.section == 'profile':
                if not LifeProfile.objects.filter(pk=identity, owner_id=owner).exists():
                    return valid_result('居民不存在', status=404)
                return success_result({**summary(owner, identity), 'discovery': discovery(owner, identity)})
            rows = FishingTrip.objects.filter(owner_id=owner).order_by('-created_at', '-id')
            if actor:
                rows = rows.filter(actor_id=actor)
            if identity:
                row = rows.filter(pk=identity).first()
                return success_result(trip_data(row, detail=True, event_page=number)) if row else valid_result('出钓不存在', status=404)
            active = rows.filter(ended_at__isnull=True)
            history = rows.filter(ended_at__isnull=False)
            from system_settings.models import Agent
            actors = Agent.objects.filter(pk__in=LifeProfile.objects.filter(owner_id=owner).values('pk'), archived_at__isnull=True)
            return success_result({'enabled': bool(config and config.enabled),
                'active': [trip_data(row) for row in active],
                'items': [trip_data(row) for row in history[(number-1)*20:number*20]], 'total': history.count(), 'page': number,
                'residents': [{'id': a.pk, 'name': a.name, **summary(owner, a.pk)} for a in actors]})
        except ValueError as exc:
            return valid_result(str(exc), status=400)

    def post(self, request, identity=None):
        owner = owner_of(request)
        try:
            if self.section == 'config':
                row = configure(owner, request.data.get('enabled'))
                return success_result({'enabled': row.enabled})
            trip = FishingTrip.objects.filter(pk=identity, owner_id=owner).first()
            if trip is None:
                return valid_result('出钓不存在', status=404)
            if self.section == 'recall':
                finish(trip.pk, '主动提前返回', cancelled=True)
            elif self.section == 'retry':
                retry(trip.pk)
            else:
                return valid_result('不支持此操作', status=400)
            return success_result(trip_data(FishingTrip.objects.get(pk=trip.pk)))
        except ValueError as exc:
            return valid_result(str(exc), status=400)
