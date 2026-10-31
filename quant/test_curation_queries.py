"""Read query counts stay bounded as curated algorithms fill a report/library."""
import copy
from types import SimpleNamespace
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from quant import test_factor_curation as fixtures
from quant.documents.presentation import current_report
from quant.documents.sections import FIELDS, pointer
from quant.factors.services import publish_candidates
from quant.graph.presentation import graph_data
from quant.models import AIRun, FactorCandidate, FactorRevision, ResearchReport
from quant.research.contracts import digest
from quant.research.presentation import report_data


class CurationQueryTests(TestCase):
    setUp = fixtures.CurationTests.setUp
    collect = fixtures.CurationTests.collect
    publish = fixtures.CurationTests.publish

    def report_with_factors(self, original, key, count):
        data = copy.deepcopy(original.data)
        data['factors'] = [{**copy.deepcopy(data['factors'][0]), 'name': f'{key}-{index}'} for index in range(count)]
        run = AIRun.objects.create(entry=original.entry, source=original.source, kind='analyze',
            status='completed', request_key=key, result=data)
        report = ResearchReport.objects.create(entry=original.entry, source=original.source, run=run,
            schema_version=3, data=data, markdown=original.markdown, content_hash=digest(data))
        publish_candidates(report)
        self.curate(list(report.factor_candidates.all()))
        return report

    def curate(self, candidates):
        revisions = []
        for candidate in candidates:
            data = {'name': '已整理：' + candidate.data['name'], 'family': candidate.data['family'],
                'tags': ['人工整理'], 'aliases': [], 'note': ''}
            revision = FactorRevision(candidate=candidate, data=data, content_hash=digest(data))
            candidate.current_revision_id = revision.pk
            revisions.append(revision)
        FactorRevision.objects.bulk_create(revisions)
        FactorCandidate.objects.bulk_update(candidates, ['current_revision_id'])

    def measured(self, fn):
        with CaptureQueriesContext(connection) as queries:
            value = fn()
        return value, len(queries)

    def test_graph_scans_do_not_query_peer_heads_for_each_candidate(self):
        first = self.publish('curation_graph_queries')
        self.curate([first])
        self.report_with_factors(first.report, 'graph_query_initial', 9)
        _, small_count = self.measured(lambda: graph_data(self.collection, first.pk))
        for index, count in enumerate((20, 20)):
            self.report_with_factors(first.report, f'graph_query_batch_{index}', count)
        graph, large_count = self.measured(lambda: graph_data(self.collection, first.pk))
        self.assertEqual(graph['index']['total'], 50)
        self.assertEqual(len([node for node in graph['nodes'] if node['kind'] == 'factor']), 13)
        self.assertTrue(all(node['label'].startswith('已整理：') for node in graph['nodes'] if node['kind'] == 'factor'))
        self.assertLessEqual(large_count, small_count + 2)

    def test_report_and_current_document_batch_names_without_repeating_full_projection(self):
        first = self.publish('curation_report_queries')
        counts = []
        for count in (1, 20):
            report = self.report_with_factors(first.report, f'report_query_{count}', count)
            value, report_count = self.measured(lambda: report_data(report, include_history=False))
            self.assertEqual(len(value['factor_names']), count)
            document = SimpleNamespace(sections={key: pointer(report) for key in FIELDS}, revision=1)
            current, document_count = self.measured(lambda: current_report(document))
            self.assertEqual(current['factor_names'], value['factor_names'])
            self.assertLessEqual(document_count, report_count + 2)
            counts.append((report_count, document_count))
        self.assertLessEqual(counts[1][0], counts[0][0] + 1)
        self.assertLessEqual(counts[1][1], counts[0][1] + 1)

    def test_report_bindings_keep_ordinal_names_and_inherit_heads_outside_the_report(self):
        first = self.publish('curation_bound_names', 'RawName')
        self.curate([first])
        report = self.report_with_factors(first.report, 'curation_bound_report', 1)
        report.factor_bindings = {'0': first.pk, '1': first.pk}
        report.save(update_fields=['factor_bindings'])
        names = report_data(report, include_history=False)['factor_names']
        self.assertEqual(names, {'0': '已整理：RawName', '1': '已整理：RawName'})
