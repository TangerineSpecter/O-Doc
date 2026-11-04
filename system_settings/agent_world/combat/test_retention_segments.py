"""Round compaction preserves chain continuity without one entry per round."""
import copy
import json

from django.test import SimpleTestCase

from .retention_segments import (EVENT_FIELDS, FACT_FIELDS, personal_ranges, shared_ranges,
                                 verify_personal, verify_shared)
from .store import digest


class RetentionSegmentsTests(SimpleTestCase):
    def personal(self, count):
        rows, previous = [], ''
        kinds = ['initialize', 'depart'] + ['round'] * count + ['terminal', 'trade', 'round', 'terminal']
        for sequence, kind in enumerate(kinds, 1):
            row = {'id': f'f{sequence}', 'actor_id': 'actor', 'owner_id': 'owner', 'sequence': sequence,
                   'kind': kind, 'exploration_id': 'run' if sequence <= count + 3 else 'later',
                   'elapsed_seconds': 0, 'payload': {'number': sequence}, 'previous_hash': previous}
            row['digest'] = previous = digest({key: row[key] for key in FACT_FIELDS})
            rows.append(row)
        return rows, {'owner_id': 'owner', 'head': len(rows), 'digest': previous, 'archive_sequence': 0}

    def shared(self, count):
        rows, previous = [], ''
        for sequence, kind in enumerate(['join'] + ['round'] * count + ['wave', 'round', 'leave'], 1):
            row = {'id': f'e{sequence}', 'party_id': 'party', 'owner_id': 'owner', 'sequence': sequence,
                   'kind': kind, 'payload': {'number': sequence}, 'previous_hash': previous}
            row['digest'] = previous = digest({key: row[key] for key in EVENT_FIELDS})
            rows.append(row)
        return rows, {'id': 'party', 'owner_id': 'owner', 'head': len(rows), 'digest': previous}

    def test_personal_ranges_preserve_nonround_facts_and_detect_damage(self):
        rows, chain = self.personal(100)
        gaps = personal_ranges(rows, owner='owner', actor='actor', run_ids={'run'})
        retained = [row for row in rows if not (row['kind'] == 'round' and row['exploration_id'] == 'run')]
        self.assertEqual(len(gaps), 1)
        verify_personal(rows, chain, actor='actor', owner='owner', ranges=[])
        verify_personal(retained, chain, actor='actor', owner='owner', ranges=gaps)
        for mutate in ('missing', 'wrong_owner', 'wrong_digest', 'bad_boundary'):
            broken = copy.deepcopy(gaps)
            if mutate == 'missing':
                broken = []
            elif mutate == 'wrong_owner':
                broken[0]['owner_id'] = 'other'
            elif mutate == 'wrong_digest':
                broken[0]['last_digest'] = 'a' * 64
            else:
                broken[0]['last_sequence'] += 1
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                verify_personal(retained, chain, actor='actor', owner='owner', ranges=broken)
        with self.assertRaises(ValueError):
            verify_personal(retained[1:], chain, actor='actor', owner='owner', ranges=gaps)

    def test_shared_ranges_bridge_only_removed_rounds(self):
        rows, party = self.shared(50)
        gaps = shared_ranges(rows, owner='owner', party='party')
        retained = [row for row in rows if row['kind'] != 'round']
        self.assertEqual(len(gaps), 2)
        verify_shared(rows, party, ranges=[])
        verify_shared(retained, party, ranges=gaps)
        broken = copy.deepcopy(retained)
        broken[-1]['payload']['number'] += 1
        with self.assertRaises(ValueError):
            verify_shared(broken, party, ranges=gaps)
        with self.assertRaises(ValueError):
            verify_shared(retained, party, ranges=gaps[:1])

    def test_contiguous_ordinary_rounds_use_one_fixed_size_range(self):
        few, _ = self.personal(2)
        many, _ = self.personal(1000)
        a = personal_ranges(few, owner='owner', actor='actor', run_ids={'run'})
        b = personal_ranges(many, owner='owner', actor='actor', run_ids={'run'})
        self.assertEqual((len(a), len(b)), (1, 1))
        self.assertLess(len(json.dumps(b)), len(json.dumps(a)) + 10)
