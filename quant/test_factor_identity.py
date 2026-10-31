"""Repeated extraction keeps stable identity and accepted Chinese labels."""
import copy
from django.test import TestCase
from quant import test_factor_curation as fixtures
from quant.models import AIRun, ResearchReport, FactorCandidate, FactorRevision
from quant.research.contracts import digest
from quant.factors.curation import revise_candidate, curation_data, curation_data_many
from quant.factors.services import publish_candidates
from quant.factors.versions.groups import groups


class ExtractionIdentityTests(TestCase):
    setUp = fixtures.CurationTests.setUp
    collect = fixtures.CurationTests.collect
    publish = fixtures.CurationTests.publish

    def duplicate(self, first, changed=False):
        original = first.report
        data = copy.deepcopy(original.data)
        if changed:
            data['factors'][0]['formula'] += ' * 2'
        run = AIRun.objects.create(entry=original.entry, source=original.source,
            kind='analyze', status='completed', request_key='repeat_'+str(ResearchReport.objects.count()), result=data)
        report = ResearchReport.objects.create(entry=original.entry, source=original.source, run=run,
            schema_version=3, data=data, markdown=original.markdown, content_hash=digest(data))
        publish_candidates(report)
        return FactorCandidate.objects.get(report=report)

    def test_unchanged_extraction_uses_original_root_and_chinese_curation(self):
        first = self.publish('repeat_source_0000001', 'Momentum')
        revise_candidate(first, dict(name='区间动量', family='momentum', aliases=[], tags=[], note=''), '', '')
        first.refresh_from_db()
        second = self.duplicate(first)
        displayed = curation_data_many([second])[second.pk]
        self.assertEqual(displayed['curation']['name'], '区间动量')
        self.assertEqual(displayed['current_revision_id'], '')
        self.assertEqual(displayed['curation_revision_id'], first.current_revision_id)
        self.assertTrue(displayed['curation_inherited'])
        self.assertEqual(displayed['revisions'], [])
        grouped = groups([second, first])
        self.assertEqual(len(grouped), 1)
        self.assertEqual(grouped[0][1].pk, first.pk)
        self.assertEqual(grouped[0][2]['versions_total'], 1)
        listing = self.client.get(f'/api/quant/{self.collection.pk}/factors/?groupBy=lineage').json()['data']
        self.assertEqual(listing['total'], 1)
        self.assertEqual(listing['items'][0]['curation']['name'], '区间动量')

    def test_changed_algorithm_is_not_silently_merged_or_renamed(self):
        first = self.publish('changed_source_000001', 'Momentum')
        revise_candidate(first, dict(name='区间动量', family='momentum', aliases=[], tags=[], note=''), '', '')
        changed = self.duplicate(first, changed=True)
        self.assertEqual(len(groups([first, changed])), 2)
        self.assertEqual(curation_data(changed)['curation']['name'], 'Momentum')

    def test_stale_inherited_edit_conflicts_then_fresh_retry_appends_local_history(self):
        first = self.publish('shared_curation_edit_01', 'RawName')
        initial = revise_candidate(first, dict(name='初始整理名', family='momentum', aliases=[], tags=['原标签'], note=''), '', '')
        first.refresh_from_db()
        second = self.duplicate(first)
        base = f'/api/quant/{self.collection.pk}/factors/'
        loaded = self.client.get(base + second.pk + '/').json()['data']
        self.assertTrue(loaded['curationInherited'])
        self.assertEqual(loaded['currentRevisionId'], '')
        self.assertEqual(loaded['curationRevisionId'], initial.pk)
        self.assertEqual(loaded['revisions'], [])
        stale = {**loaded['curation'], 'note': '只修改备注'}
        path = base + second.pk + '/'
        # A client must supply the version of the content it actually displayed.
        self.assertEqual(self.client.patch(path, {'data': stale, 'expectedRevisionId': ''}, format='json').status_code, 400)
        updated = revise_candidate(first, dict(name='最新整理名', family='momentum', aliases=[], tags=['新标签'], note=''), initial.pk, initial.pk)
        rejected = self.client.patch(path, {'data': stale, 'expectedRevisionId': '',
            'expectedCurationRevisionId': loaded['curationRevisionId']}, format='json')
        self.assertEqual(rejected.status_code, 409, rejected.data)
        self.assertEqual(FactorRevision.objects.count(), 2)
        self.assertEqual(self.client.get(path).json()['data']['curation']['name'], '最新整理名')
        fresh = self.client.get(path).json()['data']
        saved = self.client.patch(path, {'data': {**fresh['curation'], 'note': '重新核对后修改备注'},
            'expectedRevisionId': fresh['currentRevisionId'], 'expectedCurationRevisionId': fresh['curationRevisionId']}, format='json')
        self.assertEqual(saved.status_code, 200, saved.data)
        saved = saved.json()['data']
        self.assertFalse(saved['curationInherited'])
        self.assertEqual(saved['curation']['tags'], ['新标签'])
        self.assertEqual(len(saved['revisions']), 1)
        self.assertEqual(saved['revisions'][0]['parentId'], '')
        other = self.client.get(base + first.pk + '/').json()['data']
        self.assertEqual(other['currentRevisionId'], updated.pk)
        self.assertEqual(other['curationRevisionId'], saved['currentRevisionId'])
        self.assertTrue(other['curationInherited'])
        self.assertEqual(len(other['revisions']), 2)
        # A current shared token cannot bypass a stale local append pointer.
        self.assertEqual(self.client.patch(path, {'data': saved['curation'], 'expectedRevisionId': '',
            'expectedCurationRevisionId': saved['curationRevisionId']}, format='json').status_code, 409)

    def test_equal_timestamp_heads_use_the_same_tiebreak_for_all_duplicate_views(self):
        first = self.publish('shared_curation_tie_01')
        second = self.duplicate(first)
        a = revise_candidate(first, dict(name='整理甲', family='momentum', aliases=[], tags=[], note=''), '', '')
        b = revise_candidate(second, dict(name='整理乙', family='momentum', aliases=[], tags=[], note=''), '', a.pk)
        FactorRevision.objects.filter(pk=b.pk).update(created_at=a.created_at)
        first.refresh_from_db()
        second.refresh_from_db()
        projected = curation_data_many([first, second])
        expected = max(a.pk, b.pk)
        self.assertEqual(projected[first.pk]['curation_revision_id'], expected)
        self.assertEqual(projected[second.pk]['curation_revision_id'], expected)
