"""悬赏看板接口：发布、列表、详情、验收、驳回与重新征询。"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from anthology.models import Anthology
from utils.drf_utils import get_current_user_identifier
from utils.response_utils import success_result, valid_result

from .bounty_models import Bounty
from .bounty_service import (bounty_data, cancel, create, owner_agents, review,
                             renew_invites)
from .farm_gate import guarded
from .models import WorldCategory
from .publish_config import is_travel_name, search_servers

PAGE_SIZE = 20


def owner_of(request):
    return get_current_user_identifier(request)


class BountyView(APIView):
    permission_classes = [IsAuthenticated]
    kind = 'list'

    def get(self, request, bounty_id: str = ''):
        owner = owner_of(request)
        if self.kind == 'options':
            return success_result(self._options(owner))
        if bounty_id:
            bounty = Bounty.objects.filter(pk=bounty_id, owner_id=owner).first()
            if bounty is None:
                return valid_result('悬赏不存在', status=404)
            return success_result(bounty_data(bounty, detail=True))
        return self._list(owner, request)

    def _list(self, owner: str, request):
        try:
            page = int(request.query_params.get('page', '1'))
            if page < 1 or page > 100000:
                raise ValueError
        except ValueError:
            return valid_result('页码无效', status=400)
        rows = Bounty.objects.filter(owner_id=owner)
        status = (request.query_params.get('status') or '').strip()
        if status:
            wanted = [value for value in status.split(',') if value]
            if wanted:
                rows = rows.filter(status__in=wanted)
        start = (page - 1) * PAGE_SIZE
        batch = list(rows.order_by('-created_at', '-id')[start:start + PAGE_SIZE + 1])
        has_more = len(batch) > PAGE_SIZE
        batch = batch[:PAGE_SIZE]
        collections = dict(Anthology.objects.filter(pk__in=[row.collection_id for row in batch])
                           .values_list('pk', 'title'))
        categories = dict(WorldCategory.objects.filter(pk__in=[row.category_id for row in batch])
                          .values_list('pk', 'name'))
        return success_result({'items': [bounty_data(row, collections=collections,
                                                     categories=categories) for row in batch],
                               'hasMore': has_more})

    def _options(self, owner: str):
        collections = list(Anthology.objects.filter(type='agent', is_valid=True, user_id=owner)
                           .order_by('-updated_at').values('coll_id', 'title'))
        categories = [{'id': row.pk, 'name': row.name}
                      for row in WorldCategory.objects.filter(enabled=True).order_by('sort', 'name')
                      if row.workflow_kind != 'travel' and not is_travel_name(row.name)]
        residents = [{'id': agent.pk, 'name': agent.name, 'avatar': agent.avatar or '',
                      'money': str(agent.money)} for agent in owner_agents(owner)]
        return {'collections': [{'id': row['coll_id'], 'title': row['title']} for row in collections],
                'categories': categories, 'residents': residents,
                'searchReady': bool(search_servers()), 'inviteDelayMinutes': 10,
                'claimHours': 24, 'rejectLimit': None}

    @guarded
    @transaction.atomic
    def post(self, request, bounty_id: str = ''):
        try:
            owner = owner_of(request)
            action = str(request.data.get('action') or '').strip()
            if not action:
                bounty = create(owner, request.data)
                from .life_time import local_time
                return success_result({'id': bounty.pk, 'status': bounty.status,
                                       'inviteAt': local_time(bounty.invite_at).isoformat()})
            bounty = Bounty.objects.filter(pk=bounty_id, owner_id=owner).first()
            if bounty is None:
                return valid_result('悬赏不存在', status=404)
            if action == 'cancel':
                cancel(owner, bounty_id)
            elif action == 'review':
                approve = request.data.get('approve')
                if type(approve) is not bool:
                    return valid_result('请明确通过或驳回', status=400)
                review(owner, bounty_id, approve, request.data.get('reason') or '')
            elif action == 'reinvite':
                if bounty.status != 'open':
                    return valid_result('只有待领取的悬赏可以重新征询', status=400)
                renew_invites(bounty, timezone.now() + timedelta(minutes=10))
            elif action == 'run-now':
                if bounty.status != 'open':
                    return valid_result('只有待领取的悬赏可以立即征询', status=400)
                renew_invites(bounty, timezone.now(), keep_pending=True)
            else:
                return valid_result('未知操作', status=400)
            bounty.refresh_from_db()
            return success_result(bounty_data(bounty, detail=True))
        except ValueError as exc:
            return valid_result(str(exc), status=400)
