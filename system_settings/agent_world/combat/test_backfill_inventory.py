import json
import os
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from .backfill_inventory import inventory
from .migration_guard import PROTECTION_ENV
from .models import CombatFact, CombatIntegrity, Exploration
from .party_models import AdventureEvent, AdventureParty


class CombatBackfillInventoryTests(TestCase):
    def test_inventory_is_owner_scoped_counts_actual_end_times_and_never_deletes(self):
        now = timezone.now()
        for key, status, ended in (
            ('old', 'completed', now-timedelta(days=8)),
            ('recent', 'completed', now-timedelta(days=6)),
            ('open', 'active', None),
            ('unknown', 'completed', None),
        ):
            Exploration.objects.create(pk=key, owner_id='owner-a', actor_id=key, actor_name=key,
                catalog_id='test', status=status, ended_at=ended)
        Exploration.objects.create(pk='foreign', owner_id='owner-b', actor_id='foreign', actor_name='foreign',
                                   catalog_id='test', status='completed', ended_at=now-timedelta(days=9))
        CombatFact.objects.create(pk='one-round', owner_id='owner-a', actor_id='old',
                                  sequence=1, kind='round', digest='digest')
        CombatIntegrity.objects.create(pk='old', owner_id='owner-a', archive_sequence=3, archive_digest='digest')
        AdventureParty.objects.create(pk='party', owner_id='owner-a', catalog_id='test',
            dungeon_id='test', leader_id='old', status='completed', ends_at=now)
        AdventureEvent.objects.create(pk='event', party_id='party', owner_id='owner-a',
                                      sequence=1, kind='round', digest='digest')
        with patch.dict(os.environ, {PROTECTION_ENV: '1'}):
            result = inventory('owner-a', now=now)
            output = StringIO()
            call_command('inventory_combat_backfill', '--owner', 'owner-a', stdout=output)
        account = result['accounts'][0]
        self.assertEqual([row['owner'] for row in result['accounts']], ['owner-a'])
        self.assertEqual(account['explorations'], {'total': 4, 'open': 1,
            'ended_older_than_seven_days': 1, 'ended_without_time': 1})
        self.assertEqual(account['personal_facts'], {'round': 1})
        self.assertEqual(account['shared_events'], {'round': 1})
        self.assertEqual(account['old_archive_boundaries']['archived_residents'], 1)
        self.assertTrue(result['this_process_protected'])
        self.assertFalse(result['cleanup_ready'])
        self.assertFalse(json.loads(output.getvalue())['cleanup_ready'])
        self.assertEqual(CombatFact.objects.count(), 1)
        self.assertEqual(AdventureEvent.objects.count(), 1)
        self.assertEqual(CombatIntegrity.objects.get(pk='old').archive_sequence, 3)
