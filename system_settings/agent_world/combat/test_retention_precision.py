"""Cross-device precision loss must not manufacture a combat archive fork."""
import copy
import unittest

from system_settings.sync_state import canonical_hash
from utils.sync_policy import SyncError
from .retention_precision import reconcile_party_times


def marker(times):
    content = {'version': 1, 'archive': {'kind': 'party', 'exact_event_times': times}, 'kills': ['same']}
    return {'model': 'system_settings.combatpartysettlement', 'pk': 'party', 'fields': {
        'owner_id': 'owner', 'version': 1, 'content': content, 'digest': canonical_hash(content)}}


class RetentionPrecisionTests(unittest.TestCase):
    def test_snapshot_round_trip_preserves_more_precise_event_times_in_either_direction(self):
        original = marker({'one': '2026-11-01T04:02:03.123456+00:00',
                           'two': '2026-11-01T12:02:04.234000+08:00'})
        restored = marker({'one': '2026-11-01T04:02:03.123+00:00',
                           'two': '2026-11-01T04:02:04.234987Z'})
        forward = reconcile_party_times(original, restored)
        reverse = reconcile_party_times(restored, original)
        self.assertEqual(forward, reverse)
        self.assertEqual(forward['fields']['content']['archive']['exact_event_times'], {
            'one': '2026-11-01T04:02:03.123456+00:00', 'two': '2026-11-01T04:02:04.234987Z'})
        self.assertEqual(forward['fields']['digest'], canonical_hash(forward['fields']['content']))
        self.assertEqual(original['fields']['content']['archive']['exact_event_times']['two'],
                         '2026-11-01T12:02:04.234000+08:00')

    def test_real_differences_are_not_silently_merged(self):
        original = marker({'one': '2026-11-01T04:02:03.123456+00:00'})
        for value in ('2026-11-01T04:02:03.123999+00:00', '2026-11-01T04:02:03.124000+00:00'):
            with self.subTest(value=value), self.assertRaises(SyncError):
                reconcile_party_times(original, marker({'one': value}))
        changed = copy.deepcopy(original)
        changed['fields']['content']['kills'].append('different')
        with self.assertRaises(SyncError):
            reconcile_party_times(original, changed)

    def test_identical_instants_have_a_deterministic_representation(self):
        first = marker({'one': '2026-11-01T12:02:03+08:00'})
        second = marker({'one': '2026-11-01T04:02:03Z'})
        self.assertEqual(reconcile_party_times(first, second), reconcile_party_times(second, first))


if __name__ == '__main__':
    unittest.main()
