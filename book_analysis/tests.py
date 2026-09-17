import hashlib
import tempfile
import json
import zipfile
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pymupdf as fitz
from django.contrib.auth.models import User
from django.db import connection
from django.db import transaction
from django.test.utils import CaptureQueriesContext
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from anthology.models import Anthology, Book
from assets.models import Asset
from utils.sync_manager import SyncManager
from utils.ai_service import AIAuthenticationError
from .access import published
from .biography_map import create_biography_map
from .ask_views import answer_stream
from .errors import AnalysisError
from .extraction import extract_segment, salvage_payload, summarize_all, validate_payload, verified_date
from .graph import add_segment, correct_edge, correct_node, node_detail, read_graph
from .inspection import edit_boundary, inspect_book, rebuild_source_cache, recommend_mode, suggest_subject
from .jobs import cancel_run, check_run, claim_run, copy_previous_revision, create_run, digest_chapter, execute_claim, retry_run
from .models import BiographyQuote, BookAnalysis, Chapter, ChapterResult, Correction, ExecutionEvent, GraphEdge, GraphNode, NodeSource, Revision, SourceCache, WorkerLease
from .parsers import ParsedChapter, iter_segments, source_path, stable_id


class BookAnalysisTests(APITestCase):
    def test_biography_map_is_thematic_and_chapter_scoped(self):
        chapters = [SimpleNamespace(chapter=SimpleNamespace(ordinal=1, title='少年'), digest={'summary': '马化腾喜欢天文。'})]
        response = {'themes': [{'title': '兴趣与探索', 'summary': '从天文兴趣看探索习惯。', 'branches': [{'title': '天文观察', 'summary': '早期保持对未知事物的兴趣。', 'chapters': [1]}]}]}
        with patch('book_analysis.biography_map.AIService.chat_completion', return_value=json.dumps(response, ensure_ascii=False)) as complete:
            result = create_biography_map(chapters, '马化腾', '少年兴趣')
        self.assertEqual(result['themes'][0]['branches'][0]['chapters'], [1])
        self.assertIn('独立于章节目录', complete.call_args.args[0])
        response['themes'][0]['branches'][0]['chapters'] = [2]
        with patch('book_analysis.biography_map.AIService.chat_completion', return_value=json.dumps(response, ensure_ascii=False)):
            with self.assertRaises(AnalysisError):
                create_biography_map(chapters, '马化腾', '少年兴趣')

    def test_biography_subject_confirmed_and_versioned(self):
        self.assertEqual(recommend_mode('林雨自传', []), 'biography')
        self.assertEqual(suggest_subject('林雨自传'), '林雨')
        self.assertEqual(suggest_subject('人物传记'), '')
        self.inspected()
        with self.assertRaises(AnalysisError):
            create_run(self.book, 'biography')
        first = create_run(self.book, 'biography', subject_name='林雨')
        self.assertEqual(first.revision.subject_name, '林雨')
        self.assertEqual(BookAnalysis.objects.get(book=self.book).subject_name, '林雨')
        self.assertEqual(create_run(self.book, 'biography', subject_name='林雨').pk, first.pk)
        with self.assertRaises(AnalysisError):
            create_run(self.book, 'biography', subject_name='陈青')
        first.state = 'cancelled'
        first.save(update_fields=['state'])
        second = create_run(self.book, 'biography', subject_name='陈青')
        self.assertNotEqual(first.revision.settings_version, second.revision.settings_version)
        self.assertEqual(second.revision.subject_name, '陈青')

    def test_biography_quote_requires_exact_speech_and_attribution(self):
        chapter = self.inspected()[0]
        text = '林雨说：“我相信自由比名利重要。”后来林雨去了远方。'
        raw = {'nodes': [{'id': 'p', 'kind': 'person', 'name': '林雨', 'quote': '林雨说', 'description': '传主'}], 'edges': [], 'summary': '', 'quotes': [{'speaker': '林雨', 'quote': '我相信自由比名利重要。', 'attribution_quote': '林雨说：“我相信自由比名利重要。”', 'event_id': ''}], 'reflections': [{'text': '可以反思自由的意义。', 'quote': '后来林雨去了远方。'}]}
        result = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertEqual(result['quotes'][0]['speaker'], '林雨')
        self.assertEqual(result['reflections'][0]['evidence']['quote'], '后来林雨去了远方。')
        revision = Revision.objects.create(book=self.book, source_hash=self.book.asset.file_hash, mode='biography', subject_name='林雨', settings_version=1)
        add_segment(revision, chapter, result)
        self.assertEqual(BiographyQuote.objects.filter(revision=revision).count(), 1)
        raw['quotes'][0]['speaker'] = '陈青'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        raw['quotes'][0]['speaker'] = '林雨'
        raw['quotes'][0]['attribution_quote'] = '后来林雨去了远方。'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')

    def test_biography_quote_survives_invalid_optional_event_reference(self):
        chapter = self.inspected()[0]
        text = '林雨说：“我相信自由比名利重要。”'
        raw = {'nodes': [], 'edges': [], 'summary': '', 'quotes': [{'speaker': '林雨', 'quote': '我相信自由比名利重要。', 'attribution_quote': text, 'event_id': 'missing'}]}
        result = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertEqual(result['quotes'][0]['event_id'], '')
        self.assertEqual(result['quotes'][0]['text'], '我相信自由比名利重要。')

    def test_biography_background_links_only_to_sourced_claim(self):
        chapter = self.inspected()[0]
        text = '陈青创办网站。陈青的成功影响了林雨，林雨觉得互联网有创业机会。'
        raw = {'nodes': [{'id': 'c', 'kind': 'claim', 'name': '看到创业机会', 'description': '林雨觉得互联网有创业机会', 'quote': '陈青的成功影响了林雨，林雨觉得互联网有创业机会'}], 'edges': [], 'summary': '', 'flow': [{'kind': 'background', 'title': '陈青创办网站', 'detail': '陈青创办网站。', 'quote': '陈青创办网站。', 'impact_quote': '陈青的成功影响了林雨，林雨觉得互联网有创业机会', 'claim_id': 'c'}], 'reflections': [{'claim_id': 'c', 'text': '哪些外部实例会改变你的选择？', 'quote': '林雨觉得互联网有创业机会'}]}
        result = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        claim_id = result['nodes'][0]['canonical_id']
        self.assertEqual(result['flow'][0]['claim_id'], claim_id)
        self.assertEqual(result['reflections'][0]['claim_id'], claim_id)
        raw['flow'][0]['claim_id'] = 'unknown'
        self.assertEqual(validate_payload(raw, text, chapter, 0, [], subject_name='林雨')['flow'][0]['claim_id'], '')

    def test_biography_result_is_version_scoped_and_quotes_survive_incremental_copy(self):
        chapters = self.inspected()
        first = create_run(self.book, 'biography', start=1, end=1, subject_name='林雨')
        chapter = chapters[0]
        text = '林雨说：“我相信自由比名利重要。”林雨离开家乡。'
        raw = {'nodes': [{'id': 'e', 'kind': 'event', 'name': '离开家乡', 'description': '林雨离开家乡', 'quote': '林雨离开家乡。'}, {'id': 'c', 'kind': 'claim', 'name': '自由更重要', 'description': '认为自由重要', 'quote': '我相信自由比名利重要。'}], 'edges': [], 'summary': '传主离开家乡', 'quotes': [{'speaker': '林雨', 'quote': '我相信自由比名利重要。', 'attribution_quote': '林雨说：“我相信自由比名利重要。”'}]}
        payload = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        add_segment(first.revision, chapter, payload)
        ChapterResult.objects.create(id=stable_id(first.revision.pk, chapter.pk), revision=first.revision, chapter=chapter, digest={'summary': '传主离开家乡', 'reflections': []})
        first.revision.state = 'partial'
        first.revision.overview = {'covered_chapters': [1], 'total_chapters': len(chapters)}
        first.revision.save()
        analysis = BookAnalysis.objects.get(book=self.book)
        analysis.published_revision = first.revision.pk
        analysis.save()
        first.state = 'completed'
        first.save(update_fields=['state'])
        response = self.client.get(self.url + '/biography')
        self.assertEqual(response.status_code, 200)
        data = response.json()['data']
        self.assertEqual(data['subjectName'], '林雨')
        self.assertEqual(data['events']['total'], 1)
        self.assertEqual(data['ideas']['total'], 1)
        self.assertEqual(data['quotes']['total'], 1)
        self.assertEqual(data['quotes']['items'][0]['attributionEvidence']['quote'], '林雨说：“我相信自由比名利重要。”')
        outline = self.client.get(self.url + '/biography/outline').json()['data']
        self.assertEqual(outline['total'], 1)
        self.assertEqual(outline['chapters'][0]['id'], chapter.pk)
        self.assertEqual(outline['chapters'][0]['events'], 1)
        self.assertEqual(outline['chapters'][0]['ideas'], 1)
        self.assertEqual(outline['chapters'][0]['quotes'], 1)
        self.assertEqual({item['kind'] for item in outline['chapters'][0]['anchors']}, {'event', 'claim'})
        self.assertEqual(self.client.get(self.url + '/biography/outline', {'throughChapter': 1}).json()['data']['total'], 1)
        self.assertEqual(self.client.get(self.url + '/biography', {'chapterId': chapters[1].pk}).json()['data']['quotes']['total'], 0)
        second = create_run(self.book, 'biography', start=2, end=2, subject_name='林雨')
        copy_previous_revision(second)
        self.assertEqual(BiographyQuote.objects.filter(revision=second.revision).count(), 1)
        self.assertEqual(ChapterResult.objects.filter(revision=second.revision).count(), 1)
        self.assertEqual(self.client.get(self.url + '/biography', {'revisionId': first.revision.pk}).status_code, 200)

    def test_biography_detail_finds_other_pages_and_independent_quote_links(self):
        chapter = self.inspected()[0]
        analysis = BookAnalysis.objects.get(book=self.book)
        analysis.mode, analysis.subject_name = 'biography', '林雨'
        revision = Revision.objects.create(book=self.book, source_hash=analysis.source_hash, mode='biography', subject_name='林雨', settings_version=analysis.settings_version, state='partial')
        analysis.published_revision = revision.pk
        analysis.save()
        ChapterResult.objects.create(id=stable_id(revision.pk, chapter.pk), revision=revision, chapter=chapter, digest={'summary': ''})
        passage = '林雨说：“做产品必须保持专注和耐心。”'
        evidence = {'chapter_id': chapter.pk, 'chapter_title': chapter.title, 'ordinal': chapter.ordinal, 'quote': passage, 'locator': {'format': 'txt', 'offset': 100}}
        claim_evidence = {**evidence, 'quote': '做产品必须保持专注和耐心。', 'locator': {'format': 'txt', 'offset': 105}}
        unrelated_evidence = {**evidence, 'quote': '林雨去了远方。', 'locator': {'format': 'txt', 'offset': 900}}
        for index in range(25):
            for kind in ('event', 'claim'):
                node = GraphNode.objects.create(id=stable_id(revision.pk, kind, index), revision=revision, canonical_id=f'{kind}-{index}', kind=kind, name=f'{kind} {index}', ordinal=chapter.ordinal * 1000000000 + index, facts=[{'description': '有原文依据', 'evidence': claim_evidence if kind == 'claim' and index == 24 else unrelated_evidence}])
                NodeSource.objects.create(id=stable_id(node.pk, chapter.pk), node=node, chapter=chapter)
        quote = BiographyQuote.objects.create(id=stable_id(revision.pk, 'quote'), revision=revision, chapter=chapter, speaker='林雨', text='做产品必须保持专注和耐心。', evidence=claim_evidence, attribution_evidence=evidence, event_id='event-24', ordinal=chapter.ordinal * 1000000000)
        page = self.client.get(self.url + '/biography', {'chapterId': chapter.pk, 'page': 2}).json()['data']
        self.assertEqual(page['quotes']['items'], [])
        for kind, target in (('event', 'event-24'), ('claim', 'claim-24')):
            response = self.client.get(self.url + '/biography/detail', {'chapterId': chapter.pk, 'targetId': target, 'targetKind': kind})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['data']['page'], 2)
            self.assertEqual([item['id'] for item in response.json()['data']['relatedQuotes']], [quote.pk])
        response = self.client.get(self.url + '/biography/detail', {'chapterId': chapter.pk, 'targetId': quote.pk, 'targetKind': 'quote'})
        self.assertEqual(response.json()['data']['relatedClaims'], [{'id': 'claim-24', 'name': 'claim 24'}])
        self.assertEqual(response.json()['data']['page'], 1)

    def test_biography_extraction_uses_confirmed_subject_and_separates_reflection(self):
        import json
        chapter = self.inspected()[0]
        text = '林雨说：“我相信自由比名利重要。”'
        raw = {'nodes': [], 'edges': [], 'summary': '林雨谈自由', 'quotes': [{'speaker': '林雨', 'quote': '我相信自由比名利重要。', 'attribution_quote': text}], 'reflections': [{'text': '可以思考自由对自己的意义。', 'quote': text}], 'qa': [], 'inspiration': []}
        with patch('book_analysis.extraction.AIService.chat_completion', return_value=json.dumps(raw, ensure_ascii=False)) as complete:
            result = extract_segment(text, chapter, 0, 'biography', [], subject_name='林雨')
        self.assertIn('读者确认传主为「林雨」', complete.call_args.args[0])
        self.assertEqual(result['quotes'][0]['speaker'], '林雨')
        self.assertEqual(result['reflections'][0]['text'], '可以思考自由对自己的意义。')

    def test_biography_insight_requires_matching_event_and_exact_source(self):
        chapter = self.inspected()[0]
        text = '林雨创办公司，后来因资金不足关闭。林雨说：“这让我学会控制成本。”'
        raw = {'nodes': [{'id': 'e', 'kind': 'event', 'name': '创办公司', 'description': '林雨创办公司', 'quote': '林雨创办公司'}],
               'edges': [], 'summary': '创业与关闭', 'insights': [
                   {'event_id': 'e', 'kind': 'outcome', 'text': '公司因资金不足关闭', 'quote': '后来因资金不足关闭'},
                   {'event_id': 'e', 'kind': 'lesson', 'text': '学会控制成本', 'quote': '这让我学会控制成本'}]}
        result = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertEqual([item['kind'] for item in result['insights']], ['outcome', 'lesson'])
        self.assertEqual(result['insights'][0]['event_id'], result['nodes'][0]['canonical_id'])
        self.assertEqual(result['insights'][1]['evidence']['quote'], '这让我学会控制成本')
        with patch('book_analysis.jobs.summarize_all', return_value='本章体现创业、关闭与成本认识。') as summarize:
            digest = digest_chapter(chapter, [result], 'biography')
        self.assertEqual(len(digest['insights']), 2)
        self.assertIn('公司因资金不足关闭', summarize.call_args.args[0][0])
        raw['insights'][0]['quote'] = '并不存在的结果'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        raw['insights'][0]['quote'] = '后来因资金不足关闭'
        raw['insights'][0]['event_id'] = 'missing'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')

    def test_biography_meeting_remains_an_event_without_inferred_outcome(self):
        chapter = self.inspected()[0]
        text = '林雨与周宁周末见面，讨论网站的页面设计。'
        raw = {'nodes': [{'id': 'e', 'kind': 'event', 'name': '与周宁见面', 'description': '林雨与周宁周末见面', 'quote': text}],
               'edges': [], 'summary': '林雨与周宁见面', 'insights': [{'event_id': 'e', 'kind': 'conversation', 'text': '讨论网站的页面设计', 'quote': '讨论网站的页面设计'}],
               'reflections': [{'event_id': 'e', 'text': '技术交流可能成为合作的起点；这是 AI 解读。', 'quote': '讨论网站的页面设计'}]}
        result = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertEqual(result['nodes'][0]['kind'], 'event')
        self.assertEqual(result['insights'][0]['kind'], 'conversation')
        self.assertEqual(result['reflections'][0]['event_id'], result['nodes'][0]['canonical_id'])
        raw['insights'] = []
        self.assertEqual(len(validate_payload(raw, text, chapter, 0, [], subject_name='林雨')['nodes']), 1)
        raw['insights'] = [{'event_id': 'e', 'kind': 'motivation', 'text': '林雨与周宁周末见面', 'quote': '林雨与周宁周末见面'}]
        self.assertEqual(validate_payload(raw, text, chapter, 0, [], subject_name='林雨')['insights'], [])
        raw['reflections'][0]['event_id'] = 'missing'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')

    def test_biography_external_milestone_is_not_the_subjects_experience(self):
        chapter = self.inspected()[0]
        text = '陈青创办网站。陈青卖出邮箱系统。陈青的成功让林雨意识到互联网也有创业机会，林雨决定创业。'
        raw = {'nodes': [
            {'id': 'other', 'kind': 'event', 'name': '陈青创办网站', 'description': '陈青创办网站。', 'quote': '陈青创办网站。'},
            {'id': 'subject', 'kind': 'event', 'name': '受到创业成功启发', 'description': '林雨意识到互联网也有创业机会。', 'quote': '陈青的成功让林雨意识到互联网也有创业机会，林雨决定创业。'},
        ], 'edges': [], 'summary': '创业启发', 'insights': [
            {'event_id': 'subject', 'kind': 'cause', 'text': '陈青的成功让林雨意识到互联网有创业机会', 'quote': '陈青的成功让林雨意识到互联网也有创业机会'},
        ]}
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        raw['nodes'][0]['quote'] = text
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        saved, dropped = salvage_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertIn('nodes[0]', dropped)
        self.assertEqual(saved['omitted_candidates'], len(dropped))
        self.assertEqual([node['name'] for node in saved['nodes']], ['受到创业成功启发'])
        self.assertEqual(saved['insights'][0]['kind'], 'cause')
        with patch('book_analysis.jobs.summarize_all', return_value='林雨受到创业启发。'):
            digest = digest_chapter(chapter, [saved], 'biography')
        self.assertEqual(digest['omitted_candidates'], len(dropped))

    def test_biography_repair_moves_external_event_into_sourced_background(self):
        import json
        chapter = self.inspected()[0]
        text = '陈青创办网站。陈青的成功影响了林雨，林雨决定创业。'
        invalid = {'nodes': [{'id': 'other', 'kind': 'event', 'name': '陈青创办网站', 'description': '陈青创办网站。', 'quote': '陈青创办网站。'}], 'edges': [], 'summary': ''}
        repaired = {'nodes': [{'id': 'subject', 'kind': 'event', 'name': '决定创业', 'description': '林雨决定创业。', 'quote': '林雨决定创业。'}], 'edges': [], 'summary': '', 'flow': [
            {'kind': 'background', 'title': '陈青创办网站', 'detail': '陈青创办网站。', 'quote': '陈青创办网站。', 'impact_quote': '陈青的成功影响了林雨'},
            {'kind': 'decision', 'title': '林雨决定创业', 'detail': '林雨决定创业。', 'quote': '林雨决定创业。', 'event_id': 'subject'},
        ]}
        with patch('book_analysis.extraction.AIService.chat_completion', side_effect=[json.dumps(invalid, ensure_ascii=False), json.dumps(repaired, ensure_ascii=False)]) as complete:
            result = extract_segment(text, chapter, 0, 'biography', [], subject_name='林雨')
        self.assertEqual([step['kind'] for step in result['flow']], ['background', 'decision'])
        self.assertIn('不要作为传主 event', complete.call_args_list[1].args[0])

    def test_biography_flow_keeps_sourced_external_context_out_of_life_events(self):
        chapter = self.inspected()[0]
        text = '陈青创办网站。陈青出售邮箱系统。陈青的成功影响了林雨，林雨决定创业。'
        raw = {'nodes': [{'id': 'subject', 'kind': 'event', 'name': '决定创业', 'description': '林雨决定创业。', 'quote': '林雨决定创业。'}],
               'edges': [], 'summary': '林雨受到启发', 'flow': [
                   {'kind': 'background', 'title': '陈青创办网站', 'detail': '陈青创办网站。', 'quote': '陈青创办网站。', 'impact_quote': '陈青的成功影响了林雨', 'event_id': 'subject'},
                   {'kind': 'background', 'title': '陈青出售邮箱', 'detail': '陈青出售邮箱系统。', 'quote': '陈青出售邮箱系统。', 'impact_quote': '陈青的成功影响了林雨', 'event_id': 'subject'},
                   {'kind': 'impact', 'title': '林雨受到影响', 'detail': '陈青的成功影响了林雨。', 'quote': '陈青的成功影响了林雨', 'event_id': 'subject'},
                   {'kind': 'decision', 'title': '林雨决定创业', 'detail': '林雨决定创业。', 'quote': '林雨决定创业。', 'event_id': 'subject'},
               ]}
        result = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertEqual([node['name'] for node in result['nodes']], ['决定创业'])
        self.assertEqual([step['kind'] for step in result['flow']], ['background', 'background', 'impact', 'decision'])
        self.assertEqual(result['flow'][0]['impact_evidence']['quote'], '陈青的成功影响了林雨')
        with patch('book_analysis.jobs.summarize_all', return_value='林雨受到启发并创业。'):
            digest = digest_chapter(chapter, [result], 'biography')
        self.assertEqual(len(digest['flow']), 4)
        self.assertNotIn('position', digest['flow'][0])
        raw['flow'][0]['impact_quote'] = '陈青出售邮箱系统。'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        saved, dropped = salvage_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertIn('flow[0]', dropped)
        self.assertEqual(len(saved['flow']), 3)
        self.assertEqual(len(saved['nodes']), 1)
        raw['flow'][0]['impact_quote'] = '陈青的成功影响了林雨'
        raw['flow'][1]['event_id'] = 'missing'
        self.assertEqual(validate_payload(raw, text, chapter, 0, [], subject_name='林雨')['flow'][1]['event_id'], '')

    def test_biography_guessed_date_is_cleared_and_duplicate_outcome_is_omitted(self):
        chapter = self.inspected()[0]
        text = '林雨入职公司，成为工程师。'
        raw = {'nodes': [{'id': 'event', 'kind': 'event', 'name': '入职公司', 'description': '林雨入职公司，成为工程师。', 'quote': text, 'time_order': '某年'}],
               'edges': [], 'summary': '', 'insights': [{'event_id': 'event', 'kind': 'outcome', 'text': '林雨入职公司成为工程师', 'quote': text}]}
        result = validate_payload(raw, text, chapter, 0, [], subject_name='林雨')
        self.assertEqual(result['nodes'][0]['time_order'], '')
        self.assertEqual(result['insights'], [])
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [])

    def test_short_segment_tail_stays_with_its_context(self):
        text = '甲' * 80 + '\n' + '乙' * 20
        segments = list(iter_segments(text, size=100))
        self.assertEqual(''.join(segment for _, segment in segments), text)
        self.assertEqual(len(segments), 1)

    def test_biography_quotes_are_in_sync_scope_not_local_cache(self):
        from system_settings.sync_state import should_track
        targets = set(SyncManager()._iter_target_models())
        self.assertIn(BiographyQuote, targets)
        self.assertTrue(should_track(BiographyQuote))
        self.assertNotIn(SourceCache, targets)

    def test_model_timeout_releases_lease_and_keeps_completed_chapter(self):
        import json
        from .test_bounded_completion import CONFIG, FakeStream, fake_factory
        self.inspected()
        run = create_run(self.book, 'story')
        streams = []
        def responder(parameters):
            prompt = parameters['messages'][0]['content']
            if '<book_text>' in prompt:
                body = prompt.split('<book_text>\n', 1)[1].split('\n</book_text>', 1)[0]
                stream = FakeStream(hang=True) if '核对证词' in body else FakeStream(json.dumps(self.raw_payload(body), ensure_ascii=False))
            else:
                stream = FakeStream('章节摘要')
            streams.append(stream)
            return stream
        clients = []
        with patch('utils.ai_service.AIService.get_default_client_config', return_value=CONFIG), patch('utils.bounded_completion.AsyncOpenAI', side_effect=fake_factory(responder, [], clients)), patch('utils.bounded_completion.DEADLINE_SECONDS', .15), patch('book_analysis.retrieval.index_revision') as index, patch('book_analysis.jobs.logger.exception'):
            execute_claim(claim_run())
        run.refresh_from_db()
        self.assertEqual(run.state, 'failed')
        self.assertIn('超时', run.error)
        self.assertEqual(len(run.completed_ids), 1)
        self.assertEqual(ChapterResult.objects.filter(revision=run.revision).count(), 1)
        self.assertTrue(GraphNode.objects.filter(revision=run.revision).exists())
        self.assertFalse(WorkerLease.objects.get(pk='book-analysis').owner)
        self.assertTrue(all(client.closed for client in clients))
        self.assertTrue(all(stream.closed for stream in streams))
        index.assert_called_once()
        self.assertEqual(run.events.last().kind, 'run_failed')

    def test_stop_during_silent_stream_becomes_cancelled_without_resetting_flag(self):
        from .jobs import check_model_run
        from .test_bounded_completion import CONFIG, FakeStream, fake_factory
        self.inspected()
        run = create_run(self.book, 'story')
        stream, requests, clients = FakeStream(hang=True), [], []
        def control(claimed, token):
            if requests:
                cancel_run(claimed)
            check_model_run(claimed, token)
        with patch('utils.ai_service.AIService.get_default_client_config', return_value=CONFIG), patch('utils.bounded_completion.AsyncOpenAI', side_effect=fake_factory(lambda _: stream, requests, clients)), patch('book_analysis.jobs.check_model_run', side_effect=control):
            execute_claim(claim_run())
        run.refresh_from_db()
        self.assertEqual(run.state, 'cancelled')
        self.assertTrue(run.cancel_requested)
        self.assertFalse(ChapterResult.objects.filter(revision=run.revision).exists())
        self.assertFalse(WorkerLease.objects.get(pk='book-analysis').owner)
        self.assertTrue(stream.closed and clients[0].closed)
        self.assertEqual(run.events.last().kind, 'run_cancelled')

    def test_execution_records_repair_and_model_metadata_without_secrets(self):
        import json
        from .test_bounded_completion import FakeStream, fake_factory
        self.inspected()
        run = create_run(self.book, 'story')
        calls = []
        def complete(kwargs):
            prompt = kwargs['messages'][0]['content']
            calls.append(prompt)
            extract = '<book_text>' in prompt
            if len(calls) == 1:
                content, finish = 'not JSON', 'stop'
            elif extract:
                content = json.dumps(self.raw_payload(prompt.split('<book_text>\n', 1)[1].split('\n</book_text>', 1)[0]), ensure_ascii=False)
                finish = 'stop'
            else:
                content, finish = '章节导读概要', 'stop'
            return FakeStream(content, finish)
        def config(use_simple_model=False):
            return {'api_key': 'never-persist-key', 'base_url': 'https://example.invalid/v1', 'model_name': 'simple-chat' if use_simple_model else 'main-chat', 'model_role': 'simple' if use_simple_model else 'default', 'provider_name': '测试提供商'}
        with patch('utils.ai_service.AIService.get_default_client_config', side_effect=config), patch('utils.bounded_completion.AsyncOpenAI', side_effect=fake_factory(complete, [], [])), patch('book_analysis.retrieval.index_revision'):
            execute_claim(claim_run())
        run.refresh_from_db()
        self.assertEqual(run.state, 'completed', run.error)
        events = list(run.events.order_by('id'))
        kinds = [event.kind for event in events]
        for kind in ('queued', 'worker_claimed', 'model_request_started', 'model_first_output', 'model_response', 'validation_failed', 'repair_retry', 'validation_passed', 'segment_saved', 'chapter_summary_started', 'chapter_completed', 'book_summary_started', 'run_completed'):
            self.assertIn(kind, kinds)
        requests = [event for event in events if event.kind == 'model_request_started']
        self.assertEqual(requests[0].details['model_role'], 'simple')
        self.assertEqual(requests[1].details['attempt'], 2)
        self.assertTrue(any(e.details.get('model_role') == 'simple' and e.details.get('phase') == 'chapter_summary' for e in requests))
        response = self.client.get(self.url)
        serialized = response.json()['data']['run']
        self.assertIn('createdAt', serialized['events'][0])
        self.assertNotIn('never-persist-key', str(serialized))
        self.assertNotIn('<book_text>', str(serialized))

    def test_execution_history_pagination_and_book_permissions(self):
        self.inspected()
        run = create_run(self.book, 'story')
        ExecutionEvent.objects.bulk_create([ExecutionEvent(run=run, kind='test', title='安全执行记录') for _ in range(100)])
        path = self.url + f'/runs/{run.pk}/events'
        first = self.client.get(path).json()['data']
        self.assertEqual(len(first['items']), 80)
        self.assertTrue(first['hasMore'])
        second = self.client.get(path, {'before': first['items'][0]['id']}).json()['data']
        self.assertEqual(len(second['items']), 21)
        self.assertFalse(second['hasMore'])
        self.assertEqual(self.client.get(path, {'before': '-1'}).status_code, 400)
        another = self.make_book(b'Another book with enough text content.')
        self.assertEqual(self.client.get(f'/api/book-analysis/books/{another.pk}/runs/{run.pk}/events').status_code, 404)
        self.client.force_authenticate(self.reader)
        self.assertEqual(self.client.get(path).status_code, 404)

    def test_execution_details_are_allowlisted_and_expired_lease_is_visible(self):
        from .execution import execution_data, record_event
        self.inspected()
        run = create_run(self.book, 'story')
        claimed, token = claim_run()
        record_event(run, 'test', '安全元数据', details={'api_key': 'secret', 'prompt': 'private prompt', 'reason': '安全原因', 'chars': 10}, token=token)
        self.assertEqual(run.events.last().details, {'reason': '安全原因', 'chars': 10})
        run.refresh_from_db()
        self.assertFalse(execution_data(run)['recovering'])
        WorkerLease.objects.filter(pk='book-analysis').update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertTrue(execution_data(run)['recovering'])
        with self.assertRaises(AnalysisError):
            record_event(claimed, 'test', '过期线程不能写事件', token=token)
    def test_task_authentication_error_identifies_actual_model_without_key(self):
        self.inspected()
        for role, expected in [('simple', '简易模型'), ('default', '主对话模型'), ('', '对话模型')]:
            with self.subTest(role=role):
                run = create_run(self.book, 'story')
                error = AIAuthenticationError('test-provider', '测试提供商', 'secret-test-key', model_name='test-chat', model_role=role)
                with patch('book_analysis.jobs.extract_segment', side_effect=error):
                    execute_claim(claim_run())
                run.refresh_from_db()
                self.assertEqual(run.state, 'failed')
                self.assertIn(expected + '「测试提供商 / test-chat」认证失败', run.error)
                self.assertIn('断点续跑', run.error)
                self.assertNotIn('secret-test-key', run.error)
                self.assertFalse(GraphEdge.objects.exists())
    def test_parser_upgrade_rebuilds_legacy_auto_chapters_once(self):
        from .inspection import save_chapters
        from .chapter_detection import PARSER_VERSION
        body = '人物在旧宅寻找线索。\n' * 15
        text = '第一章\n' + body + '第一部影片结束了，众人离开。\n' + body + '第二章\n' + body
        book = self.make_book(text.encode())
        cut = text.index('第一部影片')
        end = text.index('第二章')
        save_chapters(book, book.asset.file_hash, [ParsedChapter(title, text[start:stop], {'format': 'txt', 'offset': start}) for title, start, stop in [('第一章', 0, cut), ('第一部影片结束了，众人离开。', cut, end), ('第二章', end, len(text))]])
        analysis = BookAnalysis.objects.create(book=book, source_hash=book.asset.file_hash, mode='story', inspection={'supported': True}, settings_version=1)
        inspection = inspect_book(book)
        self.assertEqual(inspection.inspection['parser_version'], PARSER_VERSION)
        self.assertEqual(inspection.inspection['chapter_count'], 2)
        self.assertEqual(inspection.mode, 'story')
        self.assertEqual(inspection.settings_version, analysis.settings_version + 1)
        self.assertEqual(inspect_book(book).settings_version, inspection.settings_version)

    def test_parser_upgrade_preserves_manual_boundaries_and_legacy_rename(self):
        from .chapter_detection import PARSER_VERSION
        first = self.inspected()[0]
        first.title = '自定义标题'
        first.save()
        analysis = BookAnalysis.objects.get(book=self.book)
        analysis.inspection.pop('parser_version', None)
        analysis.save()
        version = analysis.settings_version
        inspected = inspect_book(self.book)
        first.refresh_from_db()
        self.assertEqual(first.title, '自定义标题')
        self.assertEqual(inspected.settings_version, version)
        self.assertTrue(inspected.inspection['custom_boundaries'])
        self.assertEqual(inspected.inspection['parser_version'], PARSER_VERSION)

    def test_parser_upgrade_keeps_custom_split_when_cache_is_missing(self):
        first = self.inspected()[0]
        with transaction.atomic():
            edit_boundary(self.book, first, 'split', offset=120, title='手动拆分')
        chapters = list(Chapter.objects.filter(book=self.book, is_valid=True))
        original_ids = [c.id for c in chapters]
        analysis = BookAnalysis.objects.get(book=self.book)
        analysis.inspection.pop('parser_version', None)
        analysis.inspection.pop('custom_boundaries', None)
        analysis.save()
        SourceCache.objects.filter(chapter__book=self.book).delete()
        inspected = inspect_book(self.book)
        self.assertTrue(inspected.inspection['custom_boundaries'])
        self.assertEqual(inspected.settings_version, analysis.settings_version)
        self.assertEqual([c.id for c in Chapter.objects.filter(book=self.book, is_valid=True)], original_ids)
        self.assertEqual(''.join(SourceCache.objects.get(chapter=c).text for c in chapters), self.text)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='odoc-book-media-')
        self.addCleanup(self.temp.cleanup)
        settings = override_settings(MEDIA_ROOT=Path(self.temp.name))
        settings.enable()
        self.addCleanup(settings.disable)
        self.owner = User.objects.create_user(username='book-owner')
        self.reader = User.objects.create_user(username='book-reader')
        self.coll = Anthology.objects.create(title='测试书架', user_id=f'user_{self.owner.pk}', type='book', permission='private')
        self.text = '第一章 匿名信\n' + '林雨收到匿名信，随后去了旧宅，在门边发现一枚手表。\n' * 12 + '第二章 证词\n' + '林雨与陈青核对证词，陈青说昨晚在旧宅见过那枚手表。\n' * 12
        self.book = self.make_book(self.text.encode())
        self.client.force_authenticate(self.owner)
        self.url = f'/api/book-analysis/books/{self.book.pk}'

    def make_book(self, data, fmt='txt'):
        identity = hashlib.md5(data).hexdigest()
        path = Path(self.temp.name) / (identity + '.' + fmt)
        path.write_bytes(data)
        asset, _ = Asset.objects.get_or_create(id=identity, defaults={'name': path.name, 'original_name': path.name, 'file_path': path.name, 'file_extension': fmt, 'file_hash': identity, 'file_size': len(data), 'file_type': 'document', 'mime_type': 'application/octet-stream'})
        return Book.objects.create(anthology=self.coll, asset=asset, title='匿名信推理小说', book_format=fmt)

    def inspected(self):
        inspect_book(self.book)
        return list(Chapter.objects.filter(book=self.book, is_valid=True))

    def raw_payload(self, text, event_name='收到匿名信'):
        quote = text.splitlines()[1] if len(text.splitlines()) > 1 else text
        return {'nodes': [{'id': 'e', 'kind': 'event', 'name': event_name, 'quote': quote, 'description': '事件发生', 'time_label': '某天夜里'}, {'id': 'p', 'kind': 'person', 'name': '林雨', 'identity': '林雨', 'quote': quote, 'description': '参与调查'}], 'edges': [{'source': 'p', 'target': 'e', 'kind': 'participates', 'quote': quote, 'label': '参与'}], 'summary': event_name, 'points': [{'text': event_name, 'node_ids': ['e']}], 'qa': [{'question': '谁参与？', 'answer': '林雨', 'node_ids': ['p']}], 'inspiration': []}

    def fake_extract(self, text, chapter, offset, mode, registry):
        return validate_payload(self.raw_payload(text, f'事件 {chapter.ordinal}'), text, chapter, offset, registry)

    def run_all(self, **kwargs):
        run = create_run(self.book, 'story', **kwargs)
        with patch('book_analysis.jobs.extract_segment', side_effect=self.fake_extract), patch('book_analysis.jobs.summarize_all', side_effect=lambda parts, *_: '\n'.join(parts)), patch('book_analysis.retrieval.index_revision'):
            execute_claim(claim_run())
        run.refresh_from_db()
        self.assertEqual(run.state, 'completed', run.error)
        return run

    def test_text_detection_chapters_and_sources(self):
        chapters = self.inspected()
        self.assertEqual(len(chapters), 2)
        self.assertEqual(''.join(SourceCache.objects.get(chapter=c).text for c in chapters), self.text)
        self.assertEqual(BookAnalysis.objects.get(book=self.book).mode, 'story')
        response = self.client.get(self.url + '/chapters')
        self.assertEqual(response.status_code, 200)
        self.assertIn('charCount', response.json()['data']['items'][0])

    def test_segments_preserve_tail(self):
        text = ('很长的正文\n' * 4000) + '最后的唯一线索'
        segments = list(iter_segments(text))
        self.assertEqual(''.join(s for _, s in segments), text)
        self.assertTrue(all(len(s) <= 4500 for _, s in segments))

    def test_evidence_and_reference_validation(self):
        chapter = self.inspected()[0]
        text = SourceCache.objects.get(chapter=chapter).text
        raw = self.raw_payload(text)
        result = validate_payload(raw, text, chapter, 0, [])
        self.assertEqual(result['nodes'][0]['time_order'], '')
        self.assertGreater(result['nodes'][0]['ordinal'], 1000000000)
        raw['edges'][0]['quote'] = '原文并不存在的线索'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [])
        raw = self.raw_payload(text)
        raw['edges'][0]['target'] = 'missing'
        with self.assertRaises(AnalysisError):
            validate_payload(raw, text, chapter, 0, [])
        with self.assertRaises(AnalysisError):
            verified_date('2025-01-01', '某天夜里')
        self.assertEqual(verified_date('2025-01-01', '2025年1月1日收到信'), '2025-01-01')

    def test_invalid_ai_output_retries_once_without_publishing(self):
        chapter = self.inspected()[0]
        with patch('book_analysis.extraction.AIService.chat_completion', return_value='not JSON') as ai:
            with self.assertRaises(AnalysisError):
                extract_segment(self.text, chapter, 0, 'story', [])
        self.assertEqual(ai.call_count, 2)
        self.assertFalse(GraphEdge.objects.exists())

    def test_explicit_recurring_event_and_ambiguous_event_stays_separate(self):
        one, two = self.inspected()
        quote = '林雨回顾发现手表的经过。'
        raw = self.raw_payload(quote)
        a = validate_payload(raw, quote, one, 0, [])
        b = validate_payload(raw, quote, two, 0, [])
        self.assertNotEqual(a['nodes'][0]['canonical_id'], b['nodes'][0]['canonical_id'])
        raw['nodes'][0]['existing_id'] = a['nodes'][0]['canonical_id']
        registry = [{'canonical_id': a['nodes'][0]['canonical_id'], 'kind': 'event'}]
        b = validate_payload(raw, quote, two, 0, registry)
        self.assertEqual(a['nodes'][0]['canonical_id'], b['nodes'][0]['canonical_id'])

    def test_pdf_scan_header_only_and_encryption_rejected(self):
        text_doc = fitz.open()
        for i in range(3):
            page = text_doc.new_page()
            page.insert_text((50, 60), 'Chapter ' + str(i + 1))
            page.insert_textbox(fitz.Rect(50, 100, 540, 700), ('A clue was discovered in the old house. Another witness confirmed the evidence.\n' * 10))
        text_doc.set_toc([[1, 'Chapter ' + str(i + 1), i + 1] for i in range(3)])
        normal = self.make_book(text_doc.tobytes(), 'pdf')
        self.assertTrue(inspect_book(normal).inspection['supported'])
        encrypted = self.make_book(text_doc.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw='owner', user_pw='secret'), 'pdf')
        self.assertFalse(inspect_book(encrypted).inspection['supported'])
        image = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 300, 400), False)
        image.clear_with(255)
        scan = fitz.open()
        for _ in range(3):
            page = scan.new_page()
            page.insert_image(page.rect, stream=image.tobytes('png'))
            page.insert_text((30, 30), 'Repeated book heading')
        scanned = self.make_book(scan.tobytes(), 'pdf')
        self.assertFalse(inspect_book(scanned).inspection['supported'])
        self.assertTrue(Book.objects.get(pk=scanned.pk).is_valid)
        text_doc.close()
        scan.close()

    def test_pdf_partial_scan_and_custom_merged_page_source(self):
        doc = fitz.open()
        for i in range(3):
            page = doc.new_page()
            page.insert_text((50, 50), f'Chapter {i + 1}')
            page.insert_textbox(fitz.Rect(50, 90, 550, 750), (f'On page {i + 1} the witness explained an important new clue about the mystery.\n' * 10))
        doc.set_toc([[1, f'Chapter {i + 1}', i + 1] for i in range(3)])
        book = self.make_book(doc.tobytes(), 'pdf')
        self.assertTrue(inspect_book(book).inspection['supported'])
        chapters = list(Chapter.objects.filter(book=book, is_valid=True))
        original = ''.join(SourceCache.objects.get(chapter=c).text for c in chapters)
        with transaction.atomic():
            edit_boundary(book, chapters[0], 'merge')
        SourceCache.objects.filter(chapter__book=book).delete()
        rebuild_source_cache(book)
        merged = Chapter.objects.filter(book=book, is_valid=True).first()
        merged_text = SourceCache.objects.get(chapter=merged).text
        from .extraction import evidence_for
        quote = 'On page 2 the witness explained an important new clue about the mystery.'
        self.assertEqual(evidence_for(quote, merged_text, merged, 0)['locator']['page'], 2)
        self.assertEqual(''.join(SourceCache.objects.get(chapter=c).text for c in Chapter.objects.filter(book=book, is_valid=True)), original)
        image = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 300, 400), False)
        image.clear_with(255)
        for _ in range(2):
            page = doc.new_page()
            page.insert_image(page.rect, stream=image.tobytes('png'))
        mixed = self.make_book(doc.tobytes(), 'pdf')
        self.assertFalse(inspect_book(mixed).inspection['supported'])
        doc.close()

    def test_epub_directory_and_custom_boundary_restore(self):
        path = Path(self.temp.name) / 'fixture.epub'
        with zipfile.ZipFile(path, 'w') as archive:
            archive.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
            archive.writestr('OPS/book.opf', '<package><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" properties="nav"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>')
            archive.writestr('OPS/nav.xhtml', '<nav><a href="one.xhtml">匿名信</a><a href="two.xhtml">证词</a></nav>')
            for filename, text in [('one', '林雨收到信然后去了旧宅。' * 20), ('two', '陈青核对证词并回顾线索。' * 20)]:
                archive.writestr('OPS/' + filename + '.xhtml', '<html><body><p>' + text + '</p><img src="clue.png"/></body></html>')
        epub = self.make_book(path.read_bytes(), 'epub')
        report = inspect_book(epub).inspection
        self.assertEqual(report['chapter_count'], 2)
        original = ''.join(c.text for c in SourceCache.objects.filter(chapter__book=epub).order_by('chapter__ordinal'))
        chapter = Chapter.objects.filter(book=epub, is_valid=True).first()
        with transaction.atomic():
            edit_boundary(epub, chapter, 'split', offset=60, title='续章')
        SourceCache.objects.filter(chapter__book=epub).delete()
        rebuild_source_cache(epub)
        current = Chapter.objects.filter(book=epub, is_valid=True)
        self.assertEqual(current.count(), 3)
        self.assertEqual(''.join(SourceCache.objects.get(chapter=c).text for c in current), original)
        with transaction.atomic():
            edit_boundary(epub, current.first(), 'merge')
        SourceCache.objects.filter(chapter__book=epub).delete()
        rebuild_source_cache(epub)
        self.assertEqual(''.join(SourceCache.objects.get(chapter=c).text for c in Chapter.objects.filter(book=epub, is_valid=True)), original)
        self.assertEqual(inspect_book(epub).inspection['chapter_count'], 2)

    def test_txt_split_merge_can_restore_without_changing_text(self):
        chapter = self.inspected()[0]
        with transaction.atomic():
            edit_boundary(self.book, chapter, 'split', offset=120)
        SourceCache.objects.filter(chapter__book=self.book).delete()
        rebuild_source_cache(self.book)
        chapters = Chapter.objects.filter(book=self.book, is_valid=True)
        self.assertEqual(''.join(SourceCache.objects.get(chapter=c).text for c in chapters), self.text)
        with transaction.atomic():
            edit_boundary(self.book, chapters.first(), 'merge')
        self.assertEqual(inspect_book(self.book).inspection['chapter_count'], 2)

    def test_remove_chapter_excludes_source_and_renumbers_remaining_chapters(self):
        chapters = self.inspected()
        removed_text = SourceCache.objects.get(chapter=chapters[0]).text
        retained_text = SourceCache.objects.get(chapter=chapters[1]).text
        analysis = BookAnalysis.objects.get(book=self.book)
        previous_settings_version = analysis.settings_version

        response = self.client.patch(
            self.url + f'/chapters/{chapters[0].pk}/boundary',
            {'action': 'remove'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        current = list(Chapter.objects.filter(book=self.book, is_valid=True))
        self.assertEqual([(chapter.ordinal, chapter.title) for chapter in current], [(1, chapters[1].title)])
        self.assertEqual(SourceCache.objects.get(chapter=current[0]).text, retained_text)
        self.assertNotEqual(removed_text, retained_text)
        analysis.refresh_from_db()
        self.assertEqual(analysis.inspection['chapter_count'], 1)
        self.assertEqual(analysis.inspection['char_count'], len(retained_text))
        self.assertTrue(analysis.inspection['custom_boundaries'])
        self.assertEqual(analysis.settings_version, previous_settings_version + 1)
        SourceCache.objects.filter(chapter=current[0]).delete()
        refreshed = inspect_book(self.book).inspection
        self.assertEqual(refreshed['chapter_count'], 1)
        self.assertEqual(refreshed['char_count'], len(retained_text))
        self.assertEqual(SourceCache.objects.get(chapter=current[0]).text, retained_text)

    def test_remove_rejects_the_only_remaining_chapter(self):
        chapters = self.inspected()
        with transaction.atomic():
            edit_boundary(self.book, chapters[0], 'remove')
        remaining = Chapter.objects.filter(book=self.book, is_valid=True).get()

        response = self.client.patch(
            self.url + f'/chapters/{remaining.pk}/boundary',
            {'action': 'remove'},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Chapter.objects.filter(book=self.book, is_valid=True).count(), 1)

    def test_path_escape_and_mobi_are_not_analyzed(self):
        self.book.asset.file_path = '../private-book.txt'
        with self.assertRaises(AnalysisError):
            source_path(self.book)
        mobi = self.make_book(b'not an supported ebook', 'mobi')
        self.assertIn('转换', inspect_book(mobi).inspection['reason'])

    def test_task_idempotency_lease_and_complete_coverage(self):
        self.inspected()
        run = create_run(self.book, 'story')
        self.assertEqual(create_run(self.book, 'story').pk, run.pk)
        claim = claim_run()
        self.assertIsNone(claim_run())
        with patch('book_analysis.jobs.extract_segment', side_effect=self.fake_extract), patch('book_analysis.jobs.summarize_all', side_effect=lambda parts, *_: '\n'.join(parts)), patch('book_analysis.retrieval.index_revision', side_effect=RuntimeError('offline')):
            execute_claim(claim)
        run.refresh_from_db()
        self.assertEqual(run.state, 'completed', run.error)
        self.assertEqual(run.index_state, 'failed')
        self.assertTrue(published(self.book).overview['complete'])
        graph = read_graph(published(self.book), view='flow')
        self.assertEqual(len(graph['nodes']), 2)
        self.assertTrue(any(e['origin'] == 'derived' and e['kind'] == 'next' for e in graph['edges']))

    def test_cancel_retry_does_not_repeat_completed_chapter(self):
        self.inspected()
        run = create_run(self.book, 'story')
        def stop_second(text, chapter, *args):
            if chapter.ordinal == 2:
                cancel_run(run)
            return self.fake_extract(text, chapter, *args)
        with patch('book_analysis.jobs.extract_segment', side_effect=stop_second), patch('book_analysis.jobs.summarize_all', return_value='概要'):
            execute_claim(claim_run())
        run.refresh_from_db()
        self.assertEqual(run.state, 'cancelled', run.error)
        self.assertEqual(len(run.completed_ids), 1)
        retry_run(run)
        with patch('book_analysis.jobs.extract_segment', side_effect=self.fake_extract) as ai, patch('book_analysis.jobs.summarize_all', return_value='概要'), patch('book_analysis.retrieval.index_revision'):
            execute_claim(claim_run())
        self.assertEqual(ai.call_count, 1)
        run.refresh_from_db()
        self.assertEqual(run.state, 'completed')

    def test_expired_claim_and_old_settings_cannot_publish(self):
        self.inspected()
        run = create_run(self.book, 'story')
        first = claim_run()
        WorkerLease.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        second = claim_run()
        self.assertEqual(second[0].pk, run.pk)
        self.assertNotEqual(first[1], second[1])
        with self.assertRaises(AnalysisError):
            check_run(first[0], first[1])
        BookAnalysis.objects.filter(book=self.book).update(settings_version=99)
        with self.assertRaises(AnalysisError):
            check_run(*second)
        self.assertEqual(BookAnalysis.objects.get(book=self.book).published_revision, '')

    def test_long_book_defaults_to_twenty_and_ranges_are_bounded(self):
        analysis = inspect_book(self.book)
        Chapter.objects.filter(book=self.book).delete()
        Chapter.objects.bulk_create([Chapter(id=f'long-{i}', book=self.book, source_hash=analysis.source_hash, ordinal=i, title=str(i), char_count=20, locator={'format': 'txt', 'offset': 0}) for i in range(1, 1002)])
        run = create_run(self.book, 'story')
        self.assertEqual(len(run.chapter_ids), 20)
        cancel_run(run)
        run = create_run(self.book, 'story', start=980, end=1001)
        self.assertEqual(len(run.chapter_ids), 22)

    def test_force_selected_range_preserves_other_chapters_and_corrections(self):
        self.inspected()
        first = self.run_all()
        person = GraphNode.objects.get(revision=first.revision, kind='person')
        correct_node(first.revision, person.canonical_id, {'name': '林雨（修正）', 'description': '人工补充'})
        second = self.run_all(start=1, end=1, force=True)
        self.assertEqual(ChapterResult.objects.filter(revision=second.revision).count(), 2)
        self.assertTrue(published(self.book).overview['complete'])
        node = node_detail(second.revision, person.canonical_id)['node']
        self.assertEqual(node['name'], '林雨（修正）')
        self.assertEqual(sum(f['status'] == 'user' for f in node['facts']), 1)
        self.assertEqual({f['evidence']['ordinal'] for f in node['facts'] if f['evidence']}, {1, 2})

    def test_atomic_merge_updates_relations_and_keeps_sources(self):
        self.inspected()
        run = self.run_all()
        person = GraphNode.objects.get(revision=run.revision, kind='person')
        duplicate = GraphNode.objects.create(id=stable_id('dup', run.revision.pk), revision=run.revision, canonical_id=stable_id('dup'), kind='person', name='林先生', facts=person.facts, ordinal=1)
        event = GraphNode.objects.filter(revision=run.revision, kind='event').first()
        key = correct_edge(run.revision, 'manual', {'source': duplicate.canonical_id, 'target': event.canonical_id, 'kind': 'participates', 'label': '补充参与'}, new=True)
        correct_node(run.revision, duplicate.canonical_id, {'merge_into': person.canonical_id})
        graph = read_graph(run.revision)
        self.assertNotIn(duplicate.canonical_id, [n['id'] for n in graph['nodes']])
        self.assertEqual(graph['total'], 3)
        self.assertTrue(any(e['id'] == key and e['source'] == person.canonical_id for e in graph['edges']))
        with self.assertRaises(AnalysisError):
            correct_node(run.revision, person.canonical_id, {'merge_into': event.canonical_id})

    def test_private_and_public_readers_cannot_modify_or_access_foreign_sources(self):
        self.inspected()
        run = self.run_all()
        self.client.force_authenticate(self.reader)
        for path in ('', '/graph', '/chapters'):
            self.assertEqual(self.client.get(self.url + path).status_code, 404)
        self.assertEqual(self.client.post(self.url + '/ask', {'question': '谁收到信？'}).status_code, 404)
        self.coll.permission = 'public'
        self.coll.save()
        self.assertEqual(self.client.get(self.url + '/graph').status_code, 200)
        self.assertEqual(self.client.post(self.url + '/inspect').status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url + '/runs', {'mode': 'story'}).status_code, 401)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url + '/graph', {'chapterId': 'foreign'}).status_code, 404)
        self.assertEqual(self.client.get(self.url + '/graph', {'limit': 201}).status_code, 400)
        self.assertEqual(self.client.get(self.url + '/nodes/foreign').status_code, 404)

    def test_synced_results_exclude_local_runtime_and_can_restore(self):
        self.inspected()
        run = self.run_all()
        person = GraphNode.objects.get(revision=run.revision, kind='person')
        correct_node(run.revision, person.canonical_id, {'name': '用户修正姓名'})
        snapshot = SyncManager().build_snapshot_data()
        labels = {row['model'] for row in snapshot}
        self.assertIn('book_analysis.correction', labels)
        self.assertIn('book_analysis.graphnode', labels)
        for label in ('sourcecache', 'segmentcache', 'analysisrun', 'workerlease', 'executionevent'):
            self.assertNotIn('book_analysis.' + label, labels)
        Correction.objects.all().delete()
        SourceCache.objects.all().delete()
        SyncManager().apply_snapshot_data(snapshot)
        self.assertEqual(node_detail(published(self.book), person.canonical_id)['node']['name'], '用户修正姓名')
        rebuild_source_cache(self.book)
        self.assertEqual(SourceCache.objects.filter(chapter__book=self.book).count(), 2)

    def test_hierarchical_summary_reads_every_tail(self):
        seen = []
        def reduce(prompt, **kwargs):
            seen.append(prompt)
            return '提炼后的概要'
        with patch('book_analysis.extraction.AIService.chat_completion', side_effect=reduce):
            result = summarize_all(['正文' * 7000 + '尾部独有事实', '第二章最后的重点'], '长书', 'knowledge')
        self.assertEqual(result, '提炼后的概要')
        self.assertTrue(any('尾部独有事实' in prompt for prompt in seen))
        self.assertTrue(any('第二章最后的重点' in prompt for prompt in seen))
        self.assertTrue(all(len(prompt) < 12000 for prompt in seen))

    def test_question_stream_sources_answer_and_no_evidence_fallback(self):
        revision = Revision(book=self.book, overview={'covered_chapters': [1]})
        def tokens(*args):
            yield {'type': 'answer', 'content': '林雨收到信 [S1]'}
        with patch('book_analysis.ask_views.retrieve', return_value=([{'id': 'S1', 'quote': '林雨收到信', 'chapter_id': 'chapter'}], 'keyword')), patch('book_analysis.ask_views.reading_context', return_value={'chapters': [], 'overview': ''}), patch('book_analysis.ask_views.AIService.stream_chat_completion', side_effect=tokens):
            output = ''.join(answer_stream(revision, '谁收到信？', '', ''))
        self.assertIn('event: sources', output)
        self.assertIn('林雨收到信 [S1]', output)
        self.assertIn('event: done', output)
        with patch('book_analysis.ask_views.retrieve', return_value=([], 'keyword')), patch('book_analysis.ask_views.AIService.stream_chat_completion') as ai:
            output = ''.join(answer_stream(revision, '谁？', '', ''))
        ai.assert_not_called()
        self.assertIn('没有找到可靠原文证据', output)

    def test_question_endpoint_accepts_empty_optional_scope_from_browser(self):
        self.inspected()
        analysis = BookAnalysis.objects.get(book=self.book)
        revision = Revision.objects.create(book=self.book, source_hash=analysis.source_hash, mode='story', settings_version=analysis.settings_version)
        analysis.mode = 'story'
        analysis.published_revision = revision.pk
        analysis.save(update_fields=['mode', 'published_revision', 'updated_at'])
        path = self.url + '/ask'
        with patch('book_analysis.ask_views.answer_stream', return_value=iter(['event: done\ndata: {}\n\n'])) as answer:
            response = self.client.post(path, {'question': '笹垣为什么追查线索？', 'chapterId': '', 'nodeId': '', 'revisionId': revision.pk}, format='json')
            self.assertEqual(response.status_code, 200, response.json() if not response.streaming else '')
            self.assertIn(b'event: done', b''.join(response.streaming_content))
            answer.assert_called_once()
            self.assertEqual((answer.call_args.kwargs['chapter_id'], answer.call_args.kwargs['node_id']), ('', ''))

        chapter = Chapter.objects.filter(book=self.book, is_valid=True).order_by('ordinal').first()
        with patch('book_analysis.ask_views.answer_stream', return_value=iter(['event: done\ndata: {}\n\n'])) as answer:
            response = self.client.post(path, {'question': '谁收到信？', 'chapterId': chapter.pk, 'nodeId': '', 'revisionId': revision.pk, 'throughChapter': 1}, format='json')
            self.assertEqual(response.status_code, 200, response.json() if not response.streaming else '')
            self.assertIn(b'event: done', b''.join(response.streaming_content))
            self.assertEqual((answer.call_args.kwargs['chapter_id'], answer.call_args.kwargs['node_id'], answer.call_args.kwargs['through_chapter']), (chapter.pk, '', 1))

    def test_knowledge_nodes_cross_chapter_and_inspiration_are_separate(self):
        one, two = self.inspected()
        revision = Revision.objects.create(book=self.book, source_hash=self.book.asset.file_hash, mode='knowledge', settings_version=BookAnalysis.objects.get(book=self.book).settings_version)
        text = '事务的原子性要求所有修改一起成功，转账就是典型案例。'
        raw = {'nodes': [{'id': 'concept', 'kind': 'concept', 'name': '原子性', 'quote': text, 'description': '修改一起成功'}, {'id': 'case', 'kind': 'example', 'name': '转账', 'quote': text, 'description': '典型案例'}], 'edges': [{'source': 'case', 'target': 'concept', 'kind': 'illustrates', 'quote': text}], 'summary': '原子性与转账', 'points': [{'text': '原子性', 'node_ids': ['concept']}], 'inspiration': [{'question': '失败会怎样？', 'application': '支付', 'exercise': '设计回滚练习'}]}
        for chapter in (one, two):
            payload = validate_payload(raw, text, chapter, 0, [])
            add_segment(revision, chapter, payload)
        self.assertEqual(GraphNode.objects.filter(revision=revision).count(), 2)
        node = GraphNode.objects.get(revision=revision, kind='concept')
        self.assertEqual(len(node.facts), 2)
        self.assertEqual(len(payload['inspiration']), 1)
        self.assertFalse(any(f['status'] == 'user' for f in node.facts))
        self.assertEqual(read_graph(revision, chapter_id=two.pk)['total'], 2)

    def test_history_can_be_read_but_foreign_or_unpublished_revision_cannot(self):
        self.inspected()
        first = self.run_all()
        second = self.run_all(force=True)
        response = self.client.get(self.url, {'revisionId': first.revision_id})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['data']['history'])
        self.assertFalse(response.json()['data']['canManage'])
        self.assertEqual(self.client.get(self.url + '/graph', {'revisionId': first.revision_id}).status_code, 200)
        building = Revision.objects.create(book=self.book, source_hash=self.book.asset.file_hash, mode='story', settings_version=2)
        self.assertEqual(self.client.get(self.url + '/graph', {'revisionId': building.pk}).status_code, 404)
        self.assertEqual(self.client.get(self.url + '/graph', {'revisionId': 'foreign'}).status_code, 404)
        self.assertNotEqual(first.revision_id, second.revision_id)

    def test_graph_facts_and_event_pages_are_bounded(self):
        self.inspected()
        run = self.run_all()
        event = GraphNode.objects.filter(revision=run.revision, kind='event').first()
        event.facts = [{'description': str(i), 'status': 'explicit', 'evidence': event.facts[0]['evidence']} for i in range(70)]
        event.thread = '调查线'
        event.save()
        graph = read_graph(run.revision, thread='调查线')
        self.assertEqual(graph['total'], 1)
        self.assertEqual(len(graph['nodes'][0]['facts']), 3)
        detail = node_detail(run.revision, event.canonical_id, page=2)
        self.assertEqual(len(detail['node']['facts']), 20)
        self.assertEqual(detail['node']['fact_total'], 70)
        self.assertEqual(read_graph(run.revision, view='flow')['limit'], 50)

    def test_story_thread_groups_filter_existing_free_text_without_changing_it(self):
        self.inspected()
        run = self.run_all()
        event = GraphNode.objects.filter(revision=run.revision, kind='event').first()
        event.thread = '桐原洋介命案调查'
        event.save(update_fields=['thread'])
        GraphNode.objects.create(id='event-case-2', revision=run.revision, canonical_id='event-case-2', kind='event', name='调查桐原洋介案', ordinal=event.ordinal + 1, thread='调查桐原洋介案')
        GraphNode.objects.create(id='event-people', revision=run.revision, canonical_id='event-people', kind='event', name='家庭往事', ordinal=event.ordinal + 2, thread='家庭往事')
        result = read_graph(run.revision, view='flow', thread_group='case')
        self.assertEqual(result['total'], 2)
        self.assertEqual({node['thread'] for node in result['nodes']}, {'桐原洋介命案调查', '调查桐原洋介案'})
        self.assertEqual(result['thread_groups'], [{'value': 'case', 'label': '案件调查'}, {'value': 'people', 'label': '人物关系'}])
        self.assertEqual(read_graph(run.revision, view='flow', thread='家庭往事')['total'], 1)
        response = self.client.get(self.url + '/graph', {'view': 'timeline', 'threadGroup': 'case'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['total'], 2)

    def test_correction_description_is_independent_of_fact_pagination(self):
        self.inspected()
        run = self.run_all()
        person = GraphNode.objects.get(revision=run.revision, kind='person')
        person.facts = [{**person.facts[0], 'description': f'明确记录 {i}'} for i in range(60)]
        person.save()
        correct_node(run.revision, person.canonical_id, {'description': '需要保留的人工说明'})
        endpoint = self.url + f'/nodes/{person.canonical_id}'
        for page in (1, 2):
            response = self.client.get(endpoint, {'page': page})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['data']['node']['correctionDescription'], '需要保留的人工说明')
        first = node_detail(run.revision, person.canonical_id)['node']
        self.assertFalse(any(f['status'] == 'user' for f in first['facts']))
        response = self.client.patch(endpoint + '/correction', {'name': '修正后的姓名'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(node_detail(run.revision, person.canonical_id)['node']['correction_description'], '需要保留的人工说明')
        response = self.client.patch(endpoint + '/correction', {'description': ''}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(node_detail(run.revision, person.canonical_id)['node']['correction_description'], '')

    def test_node_question_keeps_vector_and_keyword_hits_after_graph_anchors(self):
        import json
        from unittest.mock import MagicMock
        from .retrieval import retrieve
        chapters = self.inspected()
        run = self.run_all()
        person = GraphNode.objects.get(revision=run.revision, kind='person')
        person.facts = [{**person.facts[0], 'evidence': {**person.facts[0]['evidence'], 'quote': f'人物关联记录 {i}'}} for i in range(12)]
        person.save()
        collection = MagicMock()
        documents = [f'与当前问题相关的检索证据 {i}' for i in range(6)]
        metadata = {'chapter_id': chapters[1].pk, 'chapter_title': chapters[1].title, 'ordinal': 2, 'locator': json.dumps(chapters[1].locator)}
        collection.query.return_value = {'documents': [documents], 'metadatas': [[metadata] * 6]}
        with patch('book_analysis.retrieval.RagClient.get_embedding_model', return_value=object()), patch('book_analysis.retrieval.book_collection', return_value=collection), patch('book_analysis.retrieval.embed_texts', return_value=[[.1, .2]]):
            sources, method = retrieve(run.revision, '核对证词', node_id=person.canonical_id)
        self.assertEqual(method, 'vector')
        self.assertEqual(len(sources), 8)
        self.assertEqual([s['quote'] for s in sources[2:]], documents)
        self.assertEqual([s['source_id'] for s in sources], [f'S{i + 1}' for i in range(8)])
        with patch('book_analysis.retrieval.book_collection', side_effect=RuntimeError('offline')):
            sources, method = retrieve(run.revision, '核对证词', node_id=person.canonical_id)
        self.assertEqual(method, 'keyword')
        self.assertTrue(any('核对证词' in source['quote'] for source in sources))
        self.assertLessEqual(len(sources), 8)

    def test_source_budget_deduplicates_and_fills_unused_retrieval_slots(self):
        from .retrieval import combine_sources
        anchors = [{'chapter_id': 'chapter', 'quote': f'关联证据 {i}'} for i in range(12)]
        hit = {'chapter_id': 'chapter', 'quote': '问题相关证据'}
        sources = combine_sources([anchors[0], *anchors], [anchors[0], hit])
        self.assertEqual(len(sources), 8)
        self.assertEqual([s['quote'] for s in sources[:3]], [anchors[0]['quote'], anchors[1]['quote'], hit['quote']])
        self.assertEqual(len({s['quote'] for s in sources}), 8)

    def test_index_saves_each_segment_and_reuses_saved_vectors_after_failure(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        from .retrieval import index_revision
        self.inspected()
        run = self.run_all()
        model = SimpleNamespace(pk='embedding-model', name='embedding')
        stored = set()
        collection = MagicMock()
        collection.get.side_effect = lambda ids, **kwargs: {'ids': [identity for identity in ids if identity in stored]}
        collection.upsert.side_effect = lambda **kwargs: stored.update(kwargs['ids'])
        with patch('book_analysis.retrieval.RagClient.get_embedding_model', return_value=model), patch('book_analysis.retrieval.book_collection', return_value=collection):
            with patch('book_analysis.retrieval.embed_texts', side_effect=[[[.1, .2]], TimeoutError('offline')]) as embed:
                with self.assertRaises(TimeoutError):
                    index_revision(run.revision)
                self.assertEqual(len(stored), 1)
                self.assertTrue(all(len(call.args[0]) == 1 and len(call.args[0][0]) <= 1500 for call in embed.call_args_list))
            with patch('book_analysis.retrieval.embed_texts', return_value=[[.1, .2]]) as embed:
                index_revision(run.revision)
                self.assertEqual(embed.call_count, 1)
                self.assertIs(embed.call_args.kwargs['model'], model)
            with patch('book_analysis.retrieval.embed_texts') as embed:
                index_revision(run.revision)
                embed.assert_not_called()
        self.assertEqual(len(stored), 2)

    def test_vector_fallback_is_book_scoped_and_supports_synced_evidence(self):
        from .retrieval import book_collection, retrieve
        self.inspected()
        run = self.run_all()
        with patch('book_analysis.retrieval.book_collection', side_effect=RuntimeError('offline')):
            sources, method = retrieve(run.revision, '林雨')
            self.assertTrue(sources)
            self.assertEqual(method, 'keyword')
            SourceCache.objects.all().delete()
            sources, _ = retrieve(run.revision, '林雨')
            self.assertTrue(sources)
        from types import SimpleNamespace
        with patch('book_analysis.retrieval.RagClient.get_embedding_model', return_value=SimpleNamespace(pk='model', name='embedding')), patch('book_analysis.retrieval.RagClient.get_collection') as collection:
            book_collection(self.book.pk)
            first = collection.call_args.args[0]
            book_collection('another-book')
            self.assertNotEqual(first, collection.call_args.args[0])

    def test_model_stream_closes_on_consumer_cancellation(self):
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        from utils.ai_service import AIService
        class ProviderStream:
            closed = False
            def __iter__(self):
                yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='文本'))])
                yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content='更多'))])
            def close(self):
                self.closed = True
        provider_stream = ProviderStream()
        client = MagicMock()
        client.chat.completions.create.return_value = provider_stream
        with patch('utils.ai_service.AIService.get_default_client_config', return_value={'api_key': 'test', 'base_url': 'https://example.test/v1', 'model_name': 'test'}), patch('utils.ai_service.OpenAI', return_value=client):
            output = AIService.stream_chat_completion([{'role': 'user', 'content': '问题'}])
            self.assertEqual(next(output)['type'], 'answer')
            output.close()
        self.assertTrue(provider_stream.closed)
        client.close.assert_called_once()

    def test_manual_name_aliases_are_searchable_and_invalid_patch_is_rejected(self):
        self.inspected()
        run = self.run_all()
        person = GraphNode.objects.get(revision=run.revision, kind='person')
        correct_node(run.revision, person.canonical_id, {'name': '调查员', 'aliases': ['林警官']})
        for name in ('调查员', '林警官'):
            self.assertEqual(read_graph(run.revision, query=name)['total'], 1)
        response = self.client.patch(self.url + f'/nodes/{person.canonical_id}/correction', {'mergeInto': []}, format='json')
        self.assertEqual(response.status_code, 400)
        chapter = Chapter.objects.filter(book=self.book, is_valid=True).first()
        text = SourceCache.objects.get(chapter=chapter).text
        invalid = self.raw_payload(text)
        invalid['nodes'][0]['kind'] = {}
        with self.assertRaises(AnalysisError):
            validate_payload(invalid, text, chapter, 0, [])

class StoryProfileTests(APITestCase):
    make_book = BookAnalysisTests.make_book
    inspected = BookAnalysisTests.inspected

    def setUp(self):
        BookAnalysisTests.setUp(self)
        self.inspected()
        analysis = BookAnalysis.objects.get(book=self.book)
        self.revision = Revision.objects.create(book=self.book, source_hash=analysis.source_hash, mode='story', settings_version=analysis.settings_version)
        analysis.published_revision = self.revision.pk
        analysis.mode = 'story'
        analysis.save()
        self.chapter1 = Chapter.objects.filter(book=self.book).order_by('ordinal').first()
        self.chapter2 = Chapter.objects.filter(book=self.book).order_by('ordinal')[1]

    def payload(self, chapter, name, description, attribute=None):
        quote = SourceCache.objects.get(chapter=chapter).text[:20]
        node = {'canonical_id': 'person-1', 'kind': 'person', 'name': name, 'aliases': [], 'description': description, 'status': 'explicit', 'evidence': {'chapter_id': chapter.pk, 'chapter_title': chapter.title, 'ordinal': chapter.ordinal, 'quote': quote, 'locator': chapter.locator}, 'ordinal': chapter.ordinal * 1000000000, 'time_label': '', 'time_order': '', 'thread': ''}
        attrs = [] if not attribute else [{'canonical_id': 'person-1', 'attribute': attribute[0], 'value': attribute[1], 'attribution': 'narrator', 'speaker': '', 'time_label': attribute[2] if len(attribute) > 2 else '', 'status': 'explicit', 'evidence': node['evidence'], 'ordinal': node['ordinal']}]
        return {'nodes': [node], 'attributes': attrs, 'edges': [], 'summary': '', 'points': [], 'qa': [], 'inspiration': []}

    def test_structured_profile_is_complete_outside_fact_page_and_scoped(self):
        from .profiles import profile_for
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '桐原洋介', '当铺老板。', ('occupation', '当铺老板')))
        add_segment(self.revision, self.chapter2, self.payload(self.chapter2, '桐原洋介', '五十二岁。', ('age', '五十二岁', '案发时')))
        node = GraphNode.objects.get(revision=self.revision)
        from .models import ProfileChange
        ProfileChange.objects.create(id='p1', node=node, chapter=self.chapter1, patch={'introduction': [{'text': '经营当铺。', 'basis': [node.structured_facts.first().pk], 'status': 'explicit'}]})
        profile = profile_for(node)
        self.assertEqual({item['value'] for item in profile['attributes']}, {'当铺老板', '五十二岁'})
        self.assertEqual([item['value'] for item in profile_for(node, 1)['attributes']], ['当铺老板'])
        detail = node_detail(self.revision, node.canonical_id, through_chapter=1)
        self.assertEqual(detail['node']['profile']['attributes'][0]['value'], '当铺老板')
        self.assertNotIn('五十二岁', str(detail))

    def test_profile_projects_standard_occupation_roles_traits_and_hides_duplicate_relationship_text(self):
        from .models import ProfileChange
        from .profiles import profile_for
        for attribute, value in (
            ('occupation', '大阪府警察'),
            ('occupation', '大阪府警刑警'),
            ('occupation', '刑警'),
            ('occupation', '搜查一科组长'),
            ('role', '专案组负责人'),
            ('trait', '头发剃成五分平头，戴金边眼镜'),
        ):
            add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '中冢', value, (attribute, value)))
        node = GraphNode.objects.get(revision=self.revision)
        basis = [node.structured_facts.first().pk]
        ProfileChange.objects.create(id='clean-profile', node=node, chapter=self.chapter1, patch={
            'introduction': [{'text': '中冢是负责本案侦查的刑警。', 'basis': basis, 'status': 'explicit'}],
            'behavior': [{'text': f'普通询问记录{i}', 'basis': basis, 'status': 'explicit'} for i in range(6)],
            'relationships': [{'text': '与对象ID abbb39d10f3b680caad5d856df2410cd1cd6a2讨论案情。', 'basis': basis, 'status': 'explicit'}],
        })
        profile = profile_for(node)
        values = lambda attribute: [item['value'] for item in profile['attributes'] if item['attribute'] == attribute]
        self.assertEqual(values('occupation'), ['刑警'])
        self.assertEqual(set(values('role')), {'搜查一科组长', '专案组负责人'})
        self.assertEqual(set(values('trait')), {'头发剃成五分平头', '戴金边眼镜'})
        self.assertEqual(len(profile['sections']['behavior']), 4)
        self.assertNotIn('relationships', profile['sections'])
        self.assertNotIn('对象ID', str(profile))

    def test_explicit_short_name_reference_keeps_full_display_name(self):
        from .extraction import validate_payload
        from .graph import relevant_registry
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '笹垣润三', '大阪刑警。', ('occupation', '刑警')))
        registry = relevant_registry(self.revision, '笹垣走进当铺。', through_chapter=1)
        self.assertEqual([item['name'] for item in registry], ['笹垣润三'])
        # A force rebuild may also expose a distinct short-name node. Reuse
        # the full name only when the extractor explicitly identifies it.
        registry.append({'canonical_id': 'polluted-short', 'kind': 'person', 'name': '笹垣', 'aliases': []})
        text = '笹垣走进当铺。'
        payload = {'nodes': [{'id': 'p', 'kind': 'person', 'name': '笹垣', 'existing_id': 'person-1', 'quote': '笹垣走进当铺'}], 'edges': [], 'summary': ''}
        result = validate_payload(payload, text, self.chapter1, 0, registry)
        self.assertEqual(result['nodes'][0]['canonical_id'], 'person-1')
        add_segment(self.revision, self.chapter1, result)
        node = GraphNode.objects.get(revision=self.revision)
        self.assertEqual(node.name, '笹垣润三')
        self.assertIn('笹垣', node.aliases)

    def test_short_name_does_not_override_exact_person_or_guess_full_name(self):
        from .extraction import validate_payload
        text = '笹垣走进当铺。'
        payload = {'nodes': [{'id': 'p', 'kind': 'person', 'name': '笹垣', 'quote': '笹垣走进当铺'}], 'edges': [], 'summary': ''}
        full = {'canonical_id': 'full-person', 'kind': 'person', 'name': '笹垣润三', 'aliases': []}
        short = {'canonical_id': 'other-person', 'kind': 'person', 'name': '笹垣', 'aliases': []}
        exact = validate_payload(payload, text, self.chapter1, 0, [full, short])
        self.assertEqual(exact['nodes'][0]['canonical_id'], 'other-person')
        unresolved = validate_payload(payload, text, self.chapter1, 0, [full])
        self.assertNotEqual(unresolved['nodes'][0]['canonical_id'], 'full-person')

    def test_classmate_student_inference_requires_grounded_relation_and_respects_chapter(self):
        from .profiles import profile_for
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '菊池文彦', '与雄一是朋友。'))
        second = self.payload(self.chapter2, '秋吉雄一', '学生。', ('occupation', '学生'))
        second['nodes'][0]['canonical_id'] = 'person-2'
        second['attributes'][0]['canonical_id'] = 'person-2'
        add_segment(self.revision, self.chapter2, second)
        kikuchi = GraphNode.objects.get(revision=self.revision, canonical_id='person-1')
        akiyoshi = GraphNode.objects.get(revision=self.revision, canonical_id='person-2')
        bad_evidence = {'chapter_id': self.chapter2.pk, 'chapter_title': self.chapter2.title, 'ordinal': 2, 'quote': '菊池就来到他身边', 'locator': self.chapter2.locator}
        GraphEdge.objects.create(id='classmate-unproven', revision=self.revision, source=akiyoshi, target=kikuchi, kind='ally', label='同班', evidence=[bad_evidence], context={'ordinal': 2})
        GraphEdge.objects.create(id='classmate-wrong-people', revision=self.revision, source=akiyoshi, target=kikuchi, kind='ally', label='同班', evidence=[{**bad_evidence, 'quote': '秋吉雄一说桐原亮司与藤村同班'}], context={'ordinal': 2})
        self.assertFalse(any(item['value'] == '学生' for item in profile_for(kikuchi, 2)['attributes']))
        GraphEdge.objects.create(id='classmate-proven', revision=self.revision, source=akiyoshi, target=kikuchi, kind='ally', label='同班', evidence=[{**bad_evidence, 'quote': '菊池文彦与秋吉雄一同班'}], context={'ordinal': 2})
        self.assertFalse(any(item['value'] == '学生' for item in profile_for(kikuchi, 1)['attributes']))
        student = [item for item in profile_for(kikuchi, 2)['attributes'] if item['value'] == '学生']
        self.assertEqual(len(student), 1)
        self.assertEqual(student[0]['status'], 'inferred')
        self.assertEqual(student[0]['time_label'], '同班时期')
        self.assertEqual(student[0]['evidence']['quote'], '菊池文彦与秋吉雄一同班')

    def test_contextual_student_attribute_keeps_inferred_status(self):
        text = '菊池文彦回到教室，坐在座位上。'
        payload = {'nodes': [{'id': 'p', 'kind': 'person', 'name': '菊池文彦', 'quote': '菊池文彦回到教室'}], 'attributes': [{'node_id': 'p', 'attribute': 'occupation', 'value': '学生', 'status': 'inferred', 'time_label': '在校时期', 'quote': '菊池文彦回到教室'}], 'edges': [], 'summary': ''}
        normalized = validate_payload(payload, text, self.chapter2, 0, [])
        self.assertEqual(normalized['attributes'][0]['status'], 'inferred')
        self.assertEqual(normalized['attributes'][0]['time_label'], '在校时期')
        unrelated = {**payload, 'attributes': [{**payload['attributes'][0], 'quote': '坐在座位上'}]}
        with self.assertRaisesMessage(AnalysisError, '学生身份推断缺少就学情境证据'):
            validate_payload(unrelated, text, self.chapter2, 0, [])

    def test_later_explicit_student_evidence_replaces_inferred_display(self):
        from .profiles import profile_for
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '菊池文彦', '出现在教室。', ('occupation', '学生')))
        node = GraphNode.objects.get(revision=self.revision)
        early = node.structured_facts.get(attribute='occupation')
        early.status = 'inferred'
        early.save(update_fields=['status'])
        add_segment(self.revision, self.chapter2, self.payload(self.chapter2, '菊池文彦', '明确是学生。', ('occupation', '学生')))
        self.assertEqual(profile_for(node, 1)['attributes'][0]['status'], 'inferred')
        student = [item for item in profile_for(node, 2)['attributes'] if item['attribute'] == 'occupation']
        self.assertEqual(len(student), 1)
        self.assertEqual(student[0]['status'], 'explicit')

    def test_hypothesis_history_and_graph_inference_are_scoped(self):
        from .models import Hypothesis
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '人物甲', '出现。'))
        add_segment(self.revision, self.chapter1, {**self.payload(self.chapter1, '人物乙', '出现。'), 'nodes': [{**self.payload(self.chapter1, '人物乙', '出现。')['nodes'][0], 'canonical_id': 'person-2'}]})
        source, target = list(GraphNode.objects.filter(revision=self.revision).order_by('canonical_id'))
        Hypothesis.objects.create(id='h1', revision=self.revision, key='same-clue', chapter=self.chapter1, source=source, target=target, description='可能相关', state='pending', basis=[])
        Hypothesis.objects.create(id='h2', revision=self.revision, key='same-clue', chapter=self.chapter2, source=source, target=target, description='已被排除', state='refuted', basis=[])
        early = read_graph(self.revision, through_chapter=1, include_inferred=True)
        late = read_graph(self.revision, through_chapter=2, include_inferred=True)
        self.assertEqual([e['origin'] for e in early['edges']], ['inferred'])
        self.assertFalse(any(e['origin'] == 'inferred' for e in late['edges']))

    def test_cross_chapter_update_preserves_current_patch_and_only_saves_cited_evidence(self):
        import json
        from .models import EntityFact, ProfileChange, SourceEvidence
        from .profiles import update_profile
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '桐原洋介', '经营当铺。', ('occupation', '当铺老板')))
        add_segment(self.revision, self.chapter2, self.payload(self.chapter2, '桐原洋介', '案发当晚外出。', ('behavior', '案发当晚外出')))
        node = GraphNode.objects.get(revision=self.revision)
        fact = node.structured_facts.filter(evidence__chapter=self.chapter2, attribute='behavior').get()
        ProfileChange.objects.create(id='current-profile', node=node, chapter=self.chapter2, patch={'behavior': [{'text': '案发当晚外出。', 'basis': [fact.pk], 'status': 'explicit'}]}, basis=[fact.pk])
        cited = {'chapter_id': self.chapter1.pk, 'chapter_title': self.chapter1.title, 'ordinal': 1, 'quote': '被引用的旧证据', 'locator': {'format': 'txt', 'offset': 901}}
        ignored = {'chapter_id': self.chapter1.pk, 'chapter_title': self.chapter1.title, 'ordinal': 1, 'quote': '未被引用的候选证据', 'locator': {'format': 'txt', 'offset': 902}}
        response = {'sections': {'background': [{'text': '早年经营当铺。', 'basis': ['S1'], 'status': 'explicit'}]}, 'hypotheses': []}
        before_facts = EntityFact.objects.filter(node=node).count()
        with patch('book_analysis.profiles.AIService.chat_completion', return_value=json.dumps(response, ensure_ascii=False)) as ai:
            self.assertTrue(update_profile(node, self.chapter2, extra_sources=[cited, ignored]))
        self.assertTrue(ai.call_args.kwargs['use_simple_model'])
        change = ProfileChange.objects.get(node=node, chapter=self.chapter2)
        self.assertIn('behavior', change.patch)
        self.assertIn('background', change.patch)
        self.assertEqual(EntityFact.objects.filter(node=node).count(), before_facts)
        self.assertTrue(SourceEvidence.objects.filter(revision=self.revision, quote=cited['quote']).exists())
        self.assertFalse(SourceEvidence.objects.filter(revision=self.revision, quote=ignored['quote']).exists())
        self.assertNotIn('S1', str(change.patch))

    def test_profile_synthesis_exposes_relation_ids_for_hypothesis_target(self):
        import json
        from .models import Hypothesis
        from .profiles import update_profile
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '人物甲', '发现异常。', ('observation', '异常')))
        second = self.payload(self.chapter1, '人物乙', '也在现场。')
        second['nodes'][0]['canonical_id'] = 'person-2'
        add_segment(self.revision, self.chapter1, second)
        source = GraphNode.objects.get(revision=self.revision, canonical_id='person-1')
        target = GraphNode.objects.get(revision=self.revision, canonical_id='person-2')
        edge = GraphEdge.objects.create(id='hypothesis-relation', revision=self.revision, source=source, target=target, kind='related_to', label='同场出现', evidence=[], context={'ordinal': 1})
        response = {'sections': {}, 'hypotheses': [{'description': '两人可能认识', 'target': target.canonical_id, 'state': 'pending', 'basis': [edge.pk]}]}
        with patch('book_analysis.profiles.AIService.chat_completion', return_value=json.dumps(response, ensure_ascii=False)) as ai:
            self.assertTrue(update_profile(source, self.chapter1))
        prompt = ai.call_args.args[0]
        self.assertIn(f'"source_id": "{source.canonical_id}"', prompt)
        self.assertIn(f'"target_id": "{target.canonical_id}"', prompt)
        self.assertEqual(Hypothesis.objects.get(source=source).target_id, target.pk)

    def test_profile_synthesis_does_not_promote_inferred_student_fact_to_explicit(self):
        import json
        from .profiles import profile_for, update_profile
        add_segment(self.revision, self.chapter1, self.payload(self.chapter1, '菊池文彦', '在教室上课。', ('occupation', '学生')))
        node = GraphNode.objects.get(revision=self.revision)
        fact = node.structured_facts.get(attribute='occupation')
        fact.status = 'inferred'
        fact.save(update_fields=['status'])
        response = {'sections': {'introduction': [{'text': '菊池文彦当时是学生。', 'basis': [fact.pk], 'status': 'explicit'}]}, 'hypotheses': []}
        with patch('book_analysis.profiles.AIService.chat_completion', return_value=json.dumps(response, ensure_ascii=False)):
            self.assertTrue(update_profile(node, self.chapter1))
        self.assertEqual(profile_for(node)['sections']['introduction'][0]['status'], 'inferred')

    def test_merged_node_detail_combines_profiles_and_attributes(self):
        from .models import ProfileChange
        first = self.payload(self.chapter1, '人物甲', '经营当铺。', ('occupation', '当铺老板'))
        second = self.payload(self.chapter2, '甲先生', '五十二岁。', ('age', '五十二岁', '案发时'))
        second['nodes'][0]['canonical_id'] = 'person-2'
        second['attributes'][0]['canonical_id'] = 'person-2'
        add_segment(self.revision, self.chapter1, first)
        add_segment(self.revision, self.chapter2, second)
        target = GraphNode.objects.get(revision=self.revision, canonical_id='person-1')
        duplicate = GraphNode.objects.get(revision=self.revision, canonical_id='person-2')
        first_fact = target.structured_facts.filter(attribute='occupation').get()
        second_fact = duplicate.structured_facts.filter(attribute='age').get()
        ProfileChange.objects.create(id='merged-profile-1', node=target, chapter=self.chapter1, patch={'background': [{'text': '经营当铺。', 'basis': [first_fact.pk], 'status': 'explicit'}]})
        ProfileChange.objects.create(id='merged-profile-2', node=duplicate, chapter=self.chapter2, patch={'changes': [{'text': '案发时五十二岁。', 'basis': [second_fact.pk], 'status': 'explicit'}]})
        correct_node(self.revision, duplicate.canonical_id, {'merge_into': target.canonical_id})
        profile = node_detail(self.revision, target.canonical_id)['node']['profile']
        self.assertEqual({item['value'] for item in profile['attributes']}, {'当铺老板', '五十二岁'})
        self.assertEqual(set(profile['sections']), {'background', 'changes'})

    def test_relevant_registry_batches_profile_and_relation_queries(self):
        from .graph import relevant_registry
        for index in range(12):
            GraphNode.objects.create(id=f'registry-node-{index}', revision=self.revision, canonical_id=f'registry-{index}', kind='person', name=f'人物{index}', ordinal=1)
        text = '、'.join(f'人物{index}' for index in range(12))
        with CaptureQueriesContext(connection) as queries:
            registry = relevant_registry(self.revision, text, through_chapter=1)
        self.assertEqual(len(registry), 12)
        self.assertLessEqual(len(queries), 5)

    def test_start_analysis_automatically_reextracts_selected_legacy_chapter(self):
        from .models import ProfileChange
        add_segment(self.revision, self.chapter2, self.payload(self.chapter2, '笹垣', '刑警，负责调查案件。'))
        node = GraphNode.objects.get(revision=self.revision)
        ProfileChange.objects.create(id='legacy-profile', node=node, chapter=self.chapter2, patch={}, state='pending', legacy=True)
        ChapterResult.objects.create(id='legacy-result', revision=self.revision, chapter=self.chapter2, digest={'summary': '旧摘要'})
        run = create_run(self.book, 'story', start=2, end=2)
        copy_previous_revision(run)
        self.assertFalse(ChapterResult.objects.filter(revision=run.revision, chapter=self.chapter2).exists())
        self.assertFalse(GraphNode.objects.filter(revision=run.revision).exists())
        event = run.events.get(kind='legacy_upgrade')
        self.assertEqual(event.details['chapters'], 1)
