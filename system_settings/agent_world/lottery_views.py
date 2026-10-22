"""大乐透只读查询与开关；不暴露代购、指定号码或人工开奖。"""
from django.db.models import Count
from decimal import Decimal
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from utils.response_utils import success_result, valid_result
from .life_views import owner_of
from .life_time import local_time
from .lottery_models import LotteryConfig, LotteryRound, LotteryTicket
from .lottery_rules import RULES
from .lottery_service import configure, current_round, carry_in


def config_data(config):
    return {'enabled': bool(config and config.enabled),
            'first_draw_at': local_time(config.first_draw_at).isoformat() if config else None, 'rules': RULES}


def round_data(row):
    count = getattr(row, 'ticket_total', None)
    if count is None:
        count = row.tickets.count()
    pool_amount = row.result['pool'] if row.status == 'settled' else str(carry_in(row) + Decimal(RULES['ticket_price']) * count + Decimal(RULES['subsidy']))
    return {'id': row.pk, 'sequence': row.sequence, 'status': row.status,
            'opens_at': local_time(row.opens_at).isoformat(), 'closes_at': local_time(row.closes_at).isoformat(),
            'draws_at': local_time(row.draws_at).isoformat(), 'rules': row.rules,
            'pool': pool_amount, 'ticket_count': count,
            'result': row.result, 'settled_at': local_time(row.settled_at).isoformat() if row.settled_at else None}


class LotteryConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return success_result(config_data(LotteryConfig.objects.filter(pk=owner_of(request)).first()))

    def post(self, request):
        try:
            return success_result(config_data(configure(owner_of(request), request.data.get('enabled'))))
        except ValueError as exc:
            return valid_result(str(exc), status=400)


class LotteryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, section='current', round_id=None):
        owner = owner_of(request)
        try:
            page = int(request.query_params.get('page', 1))
            if not 1 <= page <= 100000:
                raise ValueError('页码无效')
        except (ValueError, TypeError):
            return valid_result('页码无效', status=400)
        size, offset = 20, (page - 1) * 20
        if section == 'rounds' and round_id is None:
            rows = LotteryRound.objects.filter(owner_id=owner).annotate(ticket_total=Count('tickets')).order_by('-sequence')
            return success_result({'items': [round_data(row) for row in rows[offset:offset + size]],
                                   'total': rows.count(), 'page': page})
        row = LotteryRound.objects.filter(pk=round_id, owner_id=owner).first() if round_id else current_round(owner)
        if round_id and row is None:
            return valid_result('期次不存在', status=404)
        if section == 'tickets':
            rows = LotteryTicket.objects.filter(owner_id=owner)
            if row:
                rows = rows.filter(round=row)
            else:
                rows = rows.none()
            actor = request.query_params.get('actor_id')
            if actor:
                rows = rows.filter(actor_id=actor)
            rows = rows.order_by('created_at', 'id')
            values = [{'id': t.pk, 'actor_id': t.actor_id, 'actor_name': t.actor_name, 'numbers': t.numbers,
                       'created_at': local_time(t.created_at).isoformat(),
                       'matches': len(set(t.numbers) & set(row.result.get('winning_numbers', []))) if row and row.status == 'settled' else None}
                      for t in rows[offset:offset + size]]
            return success_result({'items': values, 'total': rows.count(), 'page': page})
        return success_result({'config': config_data(LotteryConfig.objects.filter(pk=owner).first()),
                               'round': round_data(row) if row else None})
