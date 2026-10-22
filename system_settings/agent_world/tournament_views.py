"""Account-isolated tournament reads; no GET request schedules or grants anything."""
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.response_utils import success_result, valid_result
from .life_views import owner_of
from .tournament_models import Tournament, TournamentMatch
from .tournament_queries import overview, summary, detail, match_summary


class TournamentView(APIView):
    permission_classes = [IsAuthenticated]
    section = 'current'

    def get(self, request, identity=None, match_id=None):
        owner = owner_of(request)
        if self.section == 'list':
            try:
                page = int(request.query_params.get('page', 1))
                if not 1 <= page <= 100000:
                    raise ValueError
            except (TypeError, ValueError):
                return valid_result('页码无效', status=400)
            rows = Tournament.objects.filter(owner_id=owner, status__in=['completed', 'skipped']).order_by('-week')
            offset = (page - 1) * 20
            return success_result({'items': [summary(row) for row in rows[offset:offset + 20]],
                                   'total': rows.count(), 'page': page})
        if identity is None:
            return success_result(overview(owner))
        event = Tournament.objects.filter(pk=identity, owner_id=owner).first()
        if not event:
            return valid_result('赛事不存在', status=404)
        if match_id:
            match = TournamentMatch.objects.filter(pk=match_id, owner_id=owner, round__tournament=event).first()
            if not match:
                return valid_result('比赛不存在', status=404)
            return success_result({**match_summary(match), 'report': match.report})
        return success_result(detail(event))
