"""Ticket purchase cohorts and actual cash flows; never multiply fixed awards by tickets."""
from decimal import Decimal, ROUND_HALF_UP
from ..lottery_models import LotteryTicket
from ..models import WorldLedger
from .service import money

COUNT_FIELDS = ('purchases', 'tickets', 'settledTickets', 'pendingTickets', 'winningTickets',
                'firstTickets', 'secondTickets', 'thirdTickets', 'unwonTickets', 'unknownTickets',
                'firstAwards', 'secondAwards', 'thirdAwards')
MONEY_FIELDS = ('expense', 'prizes', 'firstPrize', 'secondPrize', 'thirdPrize')


def empty():
    return {**dict.fromkeys(COUNT_FIELDS, 0), **dict.fromkeys(MONEY_FIELDS, Decimal(0)),
            'maxPrize': Decimal(0), 'roundIds': set(), 'winningRoundIds': set(), 'purchaseKeys': set()}


def serialize(row):
    result = {key: value for key, value in row.items() if key not in ('roundIds', 'winningRoundIds', 'purchaseKeys')}
    win_rate = None
    if row['settledTickets']:
        ratio = Decimal(100) * row['winningTickets'] / row['settledTickets']
        win_rate = float(ratio.quantize(Decimal('0.1'), rounding=ROUND_HALF_UP))
    result.update(rounds=len(row['roundIds']), winningRounds=len(row['winningRoundIds']),
                  purchases=len(row['purchaseKeys']),
                  winRate=win_rate,
                  net=money(row['prizes'] - row['expense']))
    for key in (*MONEY_FIELDS, 'maxPrize'):
        result[key] = money(row[key])
    return result


def load_lottery_statistics(owner, start, end, residents):
    rows = {actor: {**resident, **empty()} for actor, resident in residents.items()}
    total = empty()
    tickets = LotteryTicket.objects.filter(owner_id=owner, round__owner_id=owner,
        actor_id__in=rows, created_at__gte=start, created_at__lt=end).select_related('round')
    for ticket in tickets:
        row = rows[ticket.actor_id]
        for target in (row, total):
            target['tickets'] += 1
            target['roundIds'].add(ticket.round_id)
            target['purchaseKeys'].add((ticket.actor_id, ticket.purchase_key))
            if ticket.round.status != 'settled':
                target['pendingTickets'] += 1
                continue
            winning = ticket.round.result.get('winning_numbers')
            # A missing historical draw is unknown, never invent a losing result.
            if not isinstance(winning, list) or len(winning) != 3:
                target['unknownTickets'] += 1
                continue
            target['settledTickets'] += 1
            matches = len(set(ticket.numbers) & set(winning))
            field = {3: 'firstTickets', 2: 'secondTickets', 1: 'thirdTickets', 0: 'unwonTickets'}[matches]
            target[field] += 1
            if matches:
                target['winningTickets'] += 1
                target['winningRoundIds'].add(ticket.round_id)
    entries = WorldLedger.objects.filter(agent_id__in=rows, kind='lottery', snapshot__owner_id=owner,
        created_at__gte=start, created_at__lt=end)
    for entry in entries:
        kind = (entry.snapshot or {}).get('lottery_kind')
        for target in (rows[entry.agent_id], total):
            if kind == 'purchase' and entry.amount < 0:
                target['expense'] -= entry.amount
            elif kind == 'award' and entry.amount > 0:
                target['prizes'] += entry.amount
                target['maxPrize'] = max(target['maxPrize'], entry.amount)
                tier = (entry.snapshot or {}).get('tier')
                prefix = {1: 'first', 2: 'second', 3: 'third'}.get(tier)
                if prefix:
                    target[prefix + 'Awards'] += 1
                    target[prefix + 'Prize'] += entry.amount
    ordered = sorted(rows.values(), key=lambda row: (-(row['prizes'] - row['expense']), -row['winningTickets'], row['id']))
    return {'overview': serialize(total), 'residents': [serialize(row) for row in ordered]}
