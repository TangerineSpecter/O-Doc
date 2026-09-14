from unittest import TestCase
from unittest.mock import patch

import requests
from django.test import override_settings

from utils.web_parser import (
    WebParserError,
    _fetch_html,
    _validate_fetch_url,
    _validate_connected_peer,
    extract_html_content,
    extract_web_content,
    looks_like_login_or_block_page,
    parse_web_content,
)


class FakeResponse:
    def __init__(self, body=b'', status_code=200, headers=None, url='https://example.com/article'):
        self.body = body if isinstance(body, bytes) else body.encode('utf-8')
        self.status_code = status_code
        self.headers = headers or {'Content-Type': 'text/html; charset=utf-8'}
        self.url = url
        self.closed = False

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(response=self)

    def iter_content(self, chunk_size=65536):
        yield self.body

    def close(self):
        self.closed = True


class WebParserTests(TestCase):
    ARTICLE_HTML = '''
    <!doctype html>
    <html lang="zh-CN">
      <head><meta charset="utf-8"><title>中文网页标题</title></head>
      <body>
        <nav>首页　登录　注册</nav>
        <main>
          <h1>正文标题</h1>
          <p>这是需要保存的中文正文，用于验证网页抓取不会被导航栏里的登录按钮误判。</p>
          <p>网页导入后应当保留文章标题、段落和代码块，同时把相对链接转换成可访问的绝对地址。</p>
          <pre><code class="language-python">print("你好")</code></pre>
          <p><a href="/docs/start">阅读文档</a></p>
        </main>
      </body>
    </html>
    '''

    @patch('utils.web_parser._resolve_host')
    @patch('utils.web_parser.requests.get')
    def test_import_keeps_article_when_navigation_contains_login(self, mock_get, _mock_resolve):
        mock_get.return_value = FakeResponse(self.ARTICLE_HTML)

        title, content = parse_web_content('https://example.com/article')

        self.assertEqual(title, '中文网页标题')
        self.assertIn('这是需要保存的中文正文', content)
        self.assertIn('```python', content)
        self.assertIn('print("你好")', content)
        self.assertIn('https://example.com/docs/start', content)
        self.assertNotIn('首页　登录　注册', content)
        mock_get.assert_called_once()
        self.assertTrue(mock_get.return_value.closed)

    def test_login_page_detection_is_narrow_enough_for_normal_navigation(self):
        self.assertFalse(looks_like_login_or_block_page('<nav>登录</nav><main><p>正常文章正文</p></main>'))
        self.assertTrue(looks_like_login_or_block_page('<title>账号登录</title><p>请登录后查看本文</p>'))

    @patch('utils.web_parser._resolve_host')
    @patch('utils.web_parser.requests.get')
    def test_redirect_to_private_address_is_rejected_before_second_request(self, mock_get, _mock_resolve):
        mock_get.return_value = FakeResponse(
            status_code=302,
            headers={'Location': 'http://127.0.0.1:8000/admin'},
            url='https://example.com/redirect',
        )

        with self.assertRaisesRegex(WebParserError, '不支持访问本机'):
            _fetch_html('https://example.com/redirect')

        mock_get.assert_called_once()
        self.assertTrue(mock_get.return_value.closed)

    @patch('utils.web_parser._resolve_host')
    @patch('utils.web_parser.requests.get')
    def test_non_html_response_is_rejected(self, mock_get, _mock_resolve):
        mock_get.return_value = FakeResponse(
            body=b'%PDF-1.7',
            headers={'Content-Type': 'application/pdf'},
        )

        with self.assertRaisesRegex(WebParserError, '不是 HTML 网页'):
            _fetch_html('https://example.com/file.pdf')

    @patch('utils.web_parser._resolve_host')
    @patch('utils.web_parser.requests.get')
    def test_response_size_is_bounded(self, mock_get, _mock_resolve):
        mock_get.return_value = FakeResponse(body=b'12345')

        with patch('utils.web_parser.MAX_RESPONSE_BYTES', 4):
            with self.assertRaisesRegex(WebParserError, '超过 8 MB'):
                _fetch_html('https://example.com/large')

    @override_settings(WEB_IMPORT_ALLOW_PROXY_FAKE_IPS=True)
    @patch('utils.web_parser.socket.getaddrinfo')
    def test_proxy_fake_ip_is_allowed_only_for_domain_resolution(self, mock_dns):
        mock_dns.return_value = [(2, 1, 6, '', ('198.18.12.34', 443))]

        self.assertEqual(
            _validate_fetch_url('https://blog.csdn.net/example/article/details/1'),
            'https://blog.csdn.net/example/article/details/1',
        )
        with self.assertRaisesRegex(WebParserError, '直接 IP'):
            _validate_fetch_url('https://198.18.12.34/article')

    @override_settings(WEB_IMPORT_ALLOW_PROXY_FAKE_IPS=False)
    @patch('utils.web_parser.socket.getaddrinfo')
    def test_proxy_fake_ip_can_be_disabled(self, mock_dns):
        mock_dns.return_value = [(2, 1, 6, '', ('198.18.12.34', 443))]

        with self.assertRaisesRegex(WebParserError, '内网地址'):
            _validate_fetch_url('https://blog.csdn.net/example/article/details/1')

    def test_connected_private_peer_is_rejected_before_body_read(self):
        class FakeSocket:
            def getpeername(self):
                return ('127.0.0.1', 8000)

        class FakeConnection:
            sock = FakeSocket()

        response = FakeResponse()
        response.raw = type('Raw', (), {'_connection': FakeConnection()})()

        with self.assertRaisesRegex(WebParserError, '实际连接'):
            _validate_connected_peer(response)

    @patch('utils.web_parser._fetch_html')
    def test_csdn_adapter_removes_noise_and_normalizes_lazy_images(self, mock_fetch):
        mock_fetch.return_value = (
            'https://javastack.blog.csdn.net/article/details/1552122',
            b'''<!doctype html><html><head><title>site title</title></head><body>
            <h1 class="title-article">CSDN fixture title</h1>
            <aside>sidebar recommendation</aside>
            <div id="content_views">
              <p>This is a sufficiently long first paragraph containing useful technical article content.</p>
              <p>This second paragraph keeps the body complete and makes candidate scoring deterministic.</p>
              <pre><code class="language-java">System.out.println("ok");</code></pre>
              <table><tr><th>name</th></tr><tr><td>value</td></tr></table>
              <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP" data-original="/images/original.png">
              <div class="recommend-box">recommended article</div>
              <div class="comment-list">comments</div>
            </div></body></html>''',
        )

        parsed = extract_web_content('https://javastack.blog.csdn.net/article/details/1552122')

        self.assertEqual(parsed.title, 'CSDN fixture title')
        self.assertTrue(parsed.best_candidate.source.startswith('site:csdn:'))
        self.assertIn('```java', parsed.best_candidate.markdown)
        self.assertIn('https://javastack.blog.csdn.net/images/original.png', parsed.best_candidate.markdown)
        self.assertNotIn('recommended article', parsed.best_candidate.markdown)
        self.assertNotIn('comments', parsed.best_candidate.markdown)

    def test_candidate_deduplication_keeps_longer_candidate_with_same_prefix(self):
        lead = f'<p>{"A" * 4500}</p>'
        tail = f'<h2>Final section</h2><p>{"B" * 500}</p>'
        parsed = extract_html_content(
            f'<html><body><article><div class="post-content">{lead}</div>{tail}</article></body></html>'
        )

        self.assertTrue(any('Final section' in candidate.markdown for candidate in parsed.candidates))
