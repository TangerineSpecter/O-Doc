from django.test import SimpleTestCase
from utils.source_urls import normalize_source_url
from .publish_references import rebuild_references, SOURCE_HEADING


class PublicationReviewTests(SimpleTestCase):
    def test_iri_and_idna_match_markdown_targets(self):
        for url in ['https://example.com/中文', 'https://例子.中国/中文']:
            canonical = normalize_source_url(url)
            self.assertEqual(canonical, normalize_source_url(f'[来源]({url})'))
            body = f'正文 [来源]({url})'
            rendered = rebuild_references(body, [canonical])
            self.assertTrue(rendered.startswith(body))
            self.assertEqual(rebuild_references(rendered, [canonical]), rendered)

    def test_escaped_literal_is_not_a_link(self):
        body = r'这是文字 \[说明\]\(不是引用\)，来源见下。'
        self.assertTrue(rebuild_references(body, ['https://example.com/a']).startswith(body))

    def test_reference_heading_in_fenced_example_is_preserved(self):
        for fence in ['```markdown', '~~~markdown']:
            body = f'示例：\n\n{fence}\n\n参考来源：\n- [1](https://unknown.example.com/)\n{fence[:3]}'
            result = rebuild_references(body, ['https://example.com/a'])
            self.assertTrue(result.startswith(body))
            self.assertEqual(rebuild_references(result, ['https://example.com/a']), result)

    def test_url_storage_preserves_query_semantics(self):
        for suffix in ['?download=', '?download', '?item=z&item=a', '?q=a+b&q=a%20b', '?utm_source=x&flag=', '/#part', '?']:
            url = 'https://example.com/a' + suffix
            self.assertEqual(normalize_source_url(url), url)

    def test_unknown_query_variants_are_rejected(self):
        for adopted, other in [('?download=', ''), ('?item=z&item=a', '?item=a&item=z')]:
            with self.assertRaises(ValueError):
                rebuild_references(f'[来源](https://example.com/a{other})',
                                   [normalize_source_url('https://example.com/a' + adopted)])


    def test_unclosed_legacy_code_is_rejected_without_rewriting(self):
        body = '```markdown' + SOURCE_HEADING + '- [1](https://example.com/a)'
        with self.assertRaisesRegex(ValueError, '围栏未闭合'):
            rebuild_references(body, ['https://example.com/a', 'https://example.com/b'])

    def test_code_heading_does_not_hide_unknown_real_reference(self):
        body = '```markdown' + SOURCE_HEADING + '- [1](https://example.com/a)\n```'
        with self.assertRaises(ValueError):
            rebuild_references(body + '\n[未知](https://unknown.example.com/)', ['https://example.com/a'])

    def test_idna_encoded_and_punycode_are_equivalent_but_encoded_slash_is_not(self):
        self.assertEqual(normalize_source_url('https://例子.中国/中文'),
                         normalize_source_url('https://xn--fsqu00a.xn--fiqs8s/%e4%b8%ad%e6%96%87'))
        with self.assertRaises(ValueError):
            rebuild_references('[未知](https://example.com/a%2Fb)', ['https://example.com/a/b'])

    def test_strict_source_matching_does_not_drop_tracking_or_fragment(self):
        for url in ['https://example.com/a?utm_source=x', 'https://example.com/a#other']:
            with self.assertRaises(ValueError):
                rebuild_references(f'[不同来源]({url})', ['https://example.com/a'])


    def test_nested_code_fences_keep_their_markdown_context(self):
        for body in ['```\na\u2028b\n```', '```\na\u2029b\n```', '> ```markdown\n> [例子](https://unknown.example.com/)\n> ```',
                     '- 示例\n\n    ```markdown\n    [例子](https://unknown.example.com/)\n    ```']:
            self.assertTrue(rebuild_references(body, ['https://example.com/a']).startswith(body))
