from urllib.parse import quote
from django.test import SimpleTestCase
from utils.source_urls import canonical_url, normalize_source_url

# Same percent-encoded Chinese Facebook path as the reported failure; no network I/O.
LONG_URL = ('https://www.facebook.com/daydaycooker/posts/' + quote(
    '原來咁就可以做出可愛卡通便當成日見到人地整造型飯盒都覺得好勁又要諗用咩材料又要搓又要剪今次-joanna-jomasgarden-就將做可愛卡通便當嘅過程拍出嚟', safe='-') + '/2152403461476383')


class SourceURLTests(SimpleTestCase):
    def test_reported_lengths_and_extraction(self):
        source = f'[Daydaycook 的 Reels]({LONG_URL})'
        self.assertEqual(len(LONG_URL), 621)
        self.assertEqual(len(source), 643)
        self.assertEqual(normalize_source_url(source), LONG_URL)

    def test_limit_is_for_canonical_url_not_markdown_label(self):
        url = 'https://example.com/' + 'x' * (2048 - len('https://example.com/'))
        self.assertEqual(len(url), 2048)
        self.assertEqual(normalize_source_url(f'[来源]({url})'), url)
        with self.assertRaisesRegex(ValueError, 'source_url.*2048.*2049'):
            normalize_source_url(url + 'x')

    def test_invalid_or_unsafe_sources_are_not_salvaged(self):
        for source in ['[x](javascript:alert(1))', '[x](http://127.0.0.1/a)',
                       'http://[::1]/', 'http://localhost./', 'http://host.internal/',
                       'https://user:password@example.com/', 'https://example.com:99999/',
                       '前文 [x](https://example.com/)', '[x](https://example.com/))',
                       'https://exa\nmple.com/', None, 123, '[x](https://example.com) 后文']:
            with self.subTest(source=source):
                self.assertEqual(canonical_url(source), '')
                with self.assertRaises(ValueError):
                    normalize_source_url(source)

    def test_balanced_parentheses_and_tracking(self):
        self.assertEqual(normalize_source_url('[x](https://example.com/a(b)?utm_source=x&b=2#f)'),
                         'https://example.com/a%28b%29?utm_source=x&b=2#f')

    def test_optional_empty_source(self):
        self.assertEqual(normalize_source_url('', required=False), '')
        with self.assertRaises(ValueError):
            normalize_source_url('')
