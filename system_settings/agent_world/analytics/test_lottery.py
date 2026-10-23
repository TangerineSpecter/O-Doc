from datetime import timedelta
from decimal import Decimal
from . import tests as base_tests
from django.test import TestCase
from ..lottery_models import LotteryRound, LotteryTicket
from ..models import WorldLedger


class LotteryAnalyticsTests(TestCase):
    setUp = base_tests.AnalyticsTests.setUp
    fetch = base_tests.AnalyticsTests.fetch

    def round(self, key, owner='admin', status='settled', result=None):
        return LotteryRound.objects.create(id=key, owner_id=owner, sequence=LotteryRound.objects.filter(owner_id=owner).count()+1,
            opens_at=self.at-timedelta(days=3), closes_at=self.at, draws_at=self.at,
            settled_at=self.at if status == 'settled' else None, status=status,
            result=result if result is not None else {'winning_numbers': [1, 2, 3]})

    def ticket(self, key, row, numbers, actor=None, at=None, purchase='batch'):
        return LotteryTicket.objects.create(id=key, round=row, owner_id=row.owner_id,
            actor_id=actor or self.a.pk, actor_name='历史彩民' if actor == 'historical' else '彩票居民',
            life_item_id=purchase, purchase_key=purchase, ordinal=LotteryTicket.objects.filter(purchase_key=purchase).count(),
            numbers=numbers, created_at=at or self.at)

    def ledger(self, key, amount, kind, actor=None, owner='admin', tier=None, at=None):
        return WorldLedger.objects.create(id=key, agent_id=actor or self.a.pk, kind='lottery', amount=Decimal(amount),
            created_at=at or self.at, snapshot={'owner_id': owner, 'lottery_kind': kind, 'tier': tier})

    def test_duplicate_tickets_tiers_pending_cash_and_purchase_dedup(self):
        row = self.round('round')
        for i, numbers in enumerate([[1,2,3], [1,2,4], [1,2,4], [1,5,6], [7,8,9]]):
            self.ticket(str(i), row, numbers)
        self.ticket('pending', self.round('open', status='open'), [1,2,3], purchase='pending-batch')
        self.ledger('buy', '-25.00', 'purchase')
        self.ledger('buy-pending', '-5.00', 'purchase')
        self.ledger('first', '180.01', 'award', tier=1)
        self.ledger('second', '50.00', 'award', tier=2)
        self.ledger('third', '20.00', 'award', tier=3)
        result = self.fetch(self.a.pk)
        total = result['lotteryStatistics']['overview']
        self.assertEqual((total['purchases'], total['tickets'], total['rounds']), (2, 6, 2))
        self.assertEqual((total['settledTickets'], total['pendingTickets'], total['winningTickets']), (5, 1, 4))
        self.assertEqual((total['firstTickets'], total['secondTickets'], total['thirdTickets'], total['unwonTickets']), (1,2,1,1))
        self.assertEqual(total['winRate'], 80)
        self.assertEqual((total['expense'], total['prizes'], total['net'], total['maxPrize']), ('30.00', '250.01', '220.01', '180.01'))
        self.assertEqual((total['secondAwards'], total['secondPrize']), (1, '50.00'))
        self.assertEqual(next(c['count'] for c in result['categories'] if c['key'] == 'lottery'), 2)
        self.assertEqual(total, self.fetch(self.a.pk)['lotteryStatistics']['overview'])

    def test_cash_window_independent_from_ticket_cohort_and_unknown_draw(self):
        old = self.at-timedelta(days=5)
        future = self.at+timedelta(days=5)
        self.ticket('old-ticket', self.round('old-round'), [1,2,3], at=old)
        self.ticket('new-ticket', self.round('new-round'), [1,2,4], purchase='new')
        self.ticket('unknown-ticket', self.round('unknown', result={}), [1,2,3], purchase='unknown')
        self.ledger('old-buy', '-5.00', 'purchase', at=old)
        self.ledger('new-buy', '-10.00', 'purchase')
        self.ledger('old-prize-now', '99.99', 'award', tier=1)
        self.ledger('new-prize-future', '50.00', 'award', tier=2, at=future)
        total = self.fetch(self.a.pk)['lotteryStatistics']['overview']
        self.assertEqual((total['tickets'], total['settledTickets'], total['unknownTickets']), (2,1,1))
        self.assertEqual((total['prizes'], total['expense'], total['net']), ('99.99', '10.00', '89.99'))
        self.assertEqual(total['winRate'], 100)

    def test_owner_resident_historical_and_distinct_world_rounds(self):
        row = self.round('shared')
        self.ticket('a', row, [1,2,4], purchase='a')
        self.ticket('b', row, [1,2,4], actor=self.b.pk, purchase='b')
        self.ticket('history', row, [1,2,3], actor='historical', purchase='h')
        self.ticket('foreign', self.round('foreign', owner='other'), [1,2,3], purchase='foreign')
        self.ledger('foreign-cash', '999999.00', 'award', owner='other', tier=1)
        total = self.fetch()['lotteryStatistics']['overview']
        self.assertEqual((total['tickets'], total['rounds'], total['winningRounds'], total['prizes']), (3,1,1,'0.00'))
        historical, = self.fetch('historical')['lotteryStatistics']['residents']
        self.assertTrue(historical['departed'])
        self.assertEqual(historical['tickets'], 1)
        only, = self.fetch(self.b.pk)['lotteryStatistics']['residents']
        self.assertEqual(only['id'], self.b.pk)
        self.assertEqual(only['tickets'], 1)

    def test_empty_pending_only_and_half_open_date_window(self):
        total = self.fetch(self.a.pk)['lotteryStatistics']['overview']
        self.assertIsNone(total['winRate'])
        self.assertEqual(total['net'], '0.00')
        row = self.round('open', status='open')
        # Start midnight included; next midnight after the end date excluded.
        start = self.at.replace(hour=0)
        self.ticket('start', row, [1,2,3], at=start, purchase='start')
        self.ticket('end', row, [1,2,3], at=start+timedelta(days=2), purchase='end')
        total = self.fetch(self.a.pk)['lotteryStatistics']['overview']
        self.assertEqual((total['tickets'], total['pendingTickets']), (1,1))
        self.assertIsNone(total['winRate'])

    def test_money_precision_and_unauthorized_resident(self):
        self.ledger('large', '1234567890.93', 'award', tier=1)
        self.ledger('small', '-0.01', 'purchase')
        total = self.fetch(self.a.pk)['lotteryStatistics']['overview']
        self.assertEqual(total['net'], '1234567890.92')
        self.assertEqual(total['maxPrize'], '1234567890.93')
        from system_settings.models import Agent
        from ..life_models import LifeProfile
        foreign = Agent.objects.create(name='其他账号居民')
        LifeProfile.objects.create(id=foreign.pk, owner_id='other')
        response = self.client.get('/api/settings/agent-world/analytics/', {
            'start_date': '2026-10-01', 'end_date': '2026-10-02', 'actor_id': foreign.pk})
        self.assertEqual(response.status_code, 403)
