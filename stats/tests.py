import json
from unittest.mock import patch

from django.core import serializers
from django.db import connection
from django.test import TestCase

from article.models import Article
from stats.models import ReadStat
from utils.sync_manager import SyncManager


class ReadStatSequenceTests(TestCase):
    def test_snapshot_restore_resets_read_stat_sequence(self):
        article = Article.objects.create(
            article_id='art_sequence_test',
            title='序列测试',
            content='测试正文',
            coll_id='coll_sequence_test',
        )
        read_stat = ReadStat.objects.create(
            article=article,
            user_identifier='admin',
            duration=10,
        )
        snapshot = json.loads(serializers.serialize('json', [article, read_stat]))

        with patch.object(
            connection.ops,
            'sequence_reset_sql',
            return_value=['SELECT 1'],
        ) as sequence_reset_sql:
            SyncManager().apply_snapshot_data(snapshot)

        restored_models = sequence_reset_sql.call_args.args[1]
        self.assertIn(ReadStat, restored_models)

    def test_postgresql_restore_locks_auto_sequence_tables(self):
        class FakeCursor:
            def __init__(self):
                self.statements = []

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, statement):
                self.statements.append(statement)

        cursor = FakeCursor()
        with patch.object(connection, 'vendor', 'postgresql'), \
                patch.object(connection, 'cursor', return_value=cursor):
            SyncManager._lock_restored_sequence_tables([Article, ReadStat])

        self.assertEqual(cursor.statements, [
            'LOCK TABLE "stats_read_record" IN SHARE ROW EXCLUSIVE MODE',
        ])
