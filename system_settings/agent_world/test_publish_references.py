import copy
from django.test import SimpleTestCase

from utils.source_urls import normalize_source_url, canonical_url
from utils.test_source_urls import LONG_URL
from .publish_references import rebuild_references, SOURCE_HEADING
from .publish_workflow import validate_draft

PDF = 'http://www.iaees.org/publications/journals/np/articles/2017-2(2)/e-suppl/1-Zhang-Supplementary-Material-2.pdf'
ESCAPED_PDF = PDF.replace('(', r'\(').replace(')', r'\)')
BROKEN = r'- [3]([www.iaees.org/publications/journals/np/articles/2017-2\(2\)/e-suppl/1-Zhang-Supplementary-Material-2.pdf\)\\n-](http://www.iaees.org/publications/journals/np/articles/2017-2\(2\)/e-suppl/1-Zhang-Supplementary-Material-2.pdf\)%5Cn-) [4]([lcgdbzz.org/cn/article/doi/10.12449/JCH240801](https://lcgdbzz.org/cn/article/doi/10.12449/JCH240801))'


class PublicationReferenceTests(SimpleTestCase):
    def test_balanced_nested_parentheses_escapes_and_encoded_equivalence(self):
        for url in [PDF, 'https://example.com/a(b(c)d).pdf']:
            escaped = url.replace('(', r'\(').replace(')', r'\)')
            encoded = url.replace('(', '%28').replace(')', '%29')
            expected = normalize_source_url(url)
            for target in [url, escaped, encoded]:
                with self.subTest(target=target):
                    markdown = f'[引用]({target})'
                    self.assertEqual(normalize_source_url(markdown), expected)
                    body = '保留正文 ' + markdown + ' 保留结尾。'
                    result = rebuild_references(body, [expected])
                    self.assertTrue(result.startswith(body))
                    self.assertEqual(rebuild_references(result, [expected]), result)

    def test_only_markdown_escapes_are_decoded(self):
        self.assertEqual(canonical_url(ESCAPED_PDF), '')
        self.assertEqual(normalize_source_url(f'[PDF]({ESCAPED_PDF})'), normalize_source_url(PDF))
        self.assertEqual(normalize_source_url('https://example.com/%e4%b8%ad'), 'https://example.com/%E4%B8%AD')

    def test_commonmark_reference_and_autolinks_are_checked(self):
        for body in [f'[资料][pdf]\n\n[pdf]: {PDF}', f'<{PDF}>']:
            self.assertTrue(rebuild_references(body, [normalize_source_url(PDF)]).startswith(body))
            with self.assertRaisesRegex(ValueError, '正文引用不属于采用的素材'):
                rebuild_references(body, [LONG_URL])

    def test_safe_legacy_nested_references_are_rebuilt(self):
        body = '正文必须原样保留。'
        tail = f'- [1]([Daydaycook]({LONG_URL}))\n- [2]([PDF]({ESCAPED_PDF}))'
        urls = [LONG_URL, normalize_source_url(PDF)]
        result = rebuild_references(body + SOURCE_HEADING + tail, urls)
        self.assertEqual(result, body + SOURCE_HEADING + f'- [1]({LONG_URL})\n- [2]({urls[1]})')
        self.assertEqual(rebuild_references(result, urls), result)

    def test_heading_alone_never_authorizes_discarding_prose(self):
        body = '保留前言' + SOURCE_HEADING + f'保留段落和 [PDF]({PDF})\n保留结尾。'
        result = rebuild_references(body, [normalize_source_url(PDF)])
        self.assertTrue(result.startswith(body))
        self.assertEqual(rebuild_references(result, [normalize_source_url(PDF)]), result)

    def test_unknown_links_after_heading_are_never_discarded(self):
        for tail in ['[未知](https://unknown.example.com/)', '- [1](https://unknown.example.com/)',
                     f'- [1]({PDF})\n不能删除 [未知](https://unknown.example.com/)',
                     f'- [1]([伪造](https://unknown.example.com/))']:
            with self.subTest(tail=tail), self.assertRaises(ValueError):
                rebuild_references('正文' + SOURCE_HEADING + tail, [normalize_source_url(PDF)])

    def test_corrupted_literal_newline_suffix_is_not_guessed(self):
        for target in [PDF + '%5Cn-', PDF + r'\n-', PDF + '\n-', PDF + '/unknown']:
            with self.subTest(target=target), self.assertRaises(ValueError):
                rebuild_references('正文' + SOURCE_HEADING + f'- [1]({target})', [normalize_source_url(PDF)])
        with self.assertRaisesRegex(ValueError, '引用'):
            rebuild_references('正文' + SOURCE_HEADING + BROKEN, [normalize_source_url(PDF),
                               'https://lcgdbzz.org/cn/article/doi/10.12449/JCH240801'])

    def test_nested_or_malformed_body_link_does_not_silently_disappear(self):
        for body in [f'正文 [1]([PDF]({PDF}))', '[坏](https://example.com/a',
                     '[坏][missing]', '<a href="https://unknown.example.com/">未知</a>']:
            with self.subTest(body=body), self.assertRaises(ValueError):
                rebuild_references(body, [normalize_source_url(PDF)])

    def test_code_examples_are_preserved_not_treated_as_citations(self):
        body = '`[代码](https://unknown.example.com/)`\n\n```\n[代码](https://unknown.example.com/)\n```'
        self.assertTrue(rebuild_references(body, [LONG_URL]).startswith(body))

    def test_old_draft_normalization_and_failure_preserve_input(self):
        wrapper = f'[PDF]({ESCAPED_PDF})'
        state = dict(materials=[dict(url=wrapper)], assessment=dict(primary_source=True),
                     selection=dict(mode='topic'), template_version=1)
        draft = dict(title='合成标题', summary='合成摘要', reason='合成原因', evidence_sufficient=True,
                     source_urls=[wrapper], main_source_url=wrapper, content=f'保留正文 [PDF]({PDF})')
        result = validate_draft(draft, state)
        self.assertEqual(result['source_urls'], [normalize_source_url(PDF)])
        self.assertEqual(state['materials'][0]['url'], normalize_source_url(PDF))
        self.assertEqual(validate_draft(result, state), result)
        draft['content'] += SOURCE_HEADING + BROKEN
        before_draft, before_state = copy.deepcopy(draft), copy.deepcopy(state)
        with self.assertRaises(ValueError):
            validate_draft(draft, state)
        self.assertEqual(draft, before_draft)
        self.assertEqual(state, before_state)
