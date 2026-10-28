from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology
from quant.models import Entry, MT4Expert
from user.models import UserProfile


class QuantCoverQueryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='quant-cover-owner')
        self.other = User.objects.create_user(username='quant-cover-other')
        owner = f'user_{self.user.pk}'
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': owner})
        UserProfile.objects.update_or_create(user=self.other, defaults={'userid': f'user_{self.other.pk}'})
        self.collections = {}
        self.base = timezone.now() - timedelta(days=1)
        for kind, model in [('quant', Entry), ('backtest', MT4Expert)]:
            rows = [Anthology.objects.create(
                coll_id=f'{kind}-cover-{index}', title=f'{kind}文集{index}', type=kind,
                user_id=owner, permission='private', hide_cover_content=index == 3,
            ) for index in range(4)]
            # Even historical public records of these types remain owner-only.
            rows[0].permission = 'public'
            rows[0].save(update_fields=['permission'])
            foreign = Anthology.objects.create(coll_id=f'{kind}-cover-foreign', title=f'{kind}他人文集',
                                              type=kind, user_id=f'user_{self.other.pk}', permission='private')
            self.collections[kind] = rows
            for collection in [*rows, foreign]:
                for index, minutes in enumerate((1, 2, 2, 3, 4)):
                    name = f'条目{index}'
                    fields = {'title': name, 'content': '研究正文' * 100} if kind == 'quant' else {
                        'name': name, 'trading_logic': '交易逻辑' * 100, 'parameters': ['参数'] * 20,
                    }
                    item = model.objects.create(id=f'{collection.pk}-{index}', anthology=collection,
                                                is_valid=index != 4, **fields)
                    model.objects.filter(pk=item.pk).update(updated_at=self.base + timedelta(minutes=minutes))
        self.client = APIClient()

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_owner_covers_are_bounded_and_keep_distinct_tie_orders(self, _pending):
        self.client.force_authenticate(self.user)
        for kind, table, indexes in [('quant', 'quant_entry', (3, 2, 1)), ('backtest', 'quant_mt4expert', (3, 1, 2))]:
            with self.subTest(kind=kind), CaptureQueriesContext(connection) as queries:
                response = self.client.get('/api/anthology/list', {'type': kind})
            self.assertEqual(response.data['code'], 200)
            rows = {row['coll_id']: row for row in response.data['data']}
            self.assertEqual(set(rows), {collection.pk for collection in self.collections[kind]})
            for coll_id, row in rows.items():
                self.assertEqual(row['count'], 4)
                if coll_id == self.collections[kind][3].pk:
                    self.assertEqual(row['articles'], [])
                    continue
                self.assertEqual([entry['entry_id'] for entry in row['articles']],
                                 [f'{coll_id}-{index}' for index in indexes])
                for entry, index in zip(row['articles'], indexes):
                    self.assertEqual(entry['title'], f'条目{index}')
                    minutes = 3 if index == 3 else 2
                    self.assertEqual(entry['date'], (self.base + timedelta(minutes=minutes)).strftime('%m-%d'))
                    self.assertEqual(set(entry), {'entry_id', 'title', 'date'})
            statements = [query['sql'] for query in queries if f'FROM "{table}"' in query['sql']]
            self.assertEqual(len(statements), 2, statements)
            cover_query = next(query for query in statements if 'ROW_NUMBER' in query)
            self.assertNotIn('"content"', cover_query)
            self.assertNotIn('"trading_logic"', cover_query)
            self.assertNotIn('"parameters"', cover_query)

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_private_research_and_backtests_remain_owner_only(self, _pending):
        for user in (None, self.other):
            self.client.force_authenticate(user)
            response = self.client.get('/api/anthology/list')
            visible = {item['coll_id'] for item in response.data['data']}
            self.assertTrue(all(collection.pk not in visible for rows in self.collections.values() for collection in rows))

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_hidden_quant_and_backtest_covers_skip_preview_queries(self, _pending):
        self.client.force_authenticate(self.user)
        Anthology.objects.filter(type__in=('quant', 'backtest')).update(hide_cover_content=True)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list')
        self.assertTrue(all(not row['articles'] for row in response.data['data']))
        for table in ('quant_entry', 'quant_mt4expert'):
            statements = [query['sql'] for query in queries if f'FROM "{table}"' in query['sql']]
            self.assertEqual(len(statements), 1, statements)

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_mixed_research_types_keep_separate_previews(self, _pending):
        self.client.force_authenticate(self.user)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list')
        rows = {item['coll_id']: item for item in response.data['data']}
        for kind, indexes in [('quant', (3, 2, 1)), ('backtest', (3, 1, 2))]:
            collection = self.collections[kind][0]
            self.assertEqual([item['entry_id'] for item in rows[collection.pk]['articles']],
                             [f'{collection.pk}-{index}' for index in indexes])
        for table in ('quant_entry', 'quant_mt4expert'):
            self.assertEqual(len([query for query in queries if f'FROM "{table}"' in query['sql']]), 2)
