import base64
import os
import re
import shutil
import tempfile
from io import BytesIO
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image as PILImage

from anthology.models import Anthology
from article.models import Article
from article.views import ArticlePolisher
from article.web_import_service import (
    ImageDownloadBudget,
    extract_content_with_ai,
    import_content_file_as_article,
    import_webpage_as_article,
    polish_markdown_content,
)
from assets.models import Asset
from utils.web_parser import (
    FetchedResource,
    ParsedWebContent,
    WebContentCandidate,
    WebParserError,
)


def make_png_bytes():
    output = BytesIO()
    PILImage.new('RGB', (2, 2), color=(230, 126, 34)).save(output, format='PNG')
    return output.getvalue()


PNG_BYTES = make_png_bytes()


def make_candidate(markdown, confidence='high', candidate_id='candidate_1'):
    return WebContentCandidate(
        candidate_id=candidate_id,
        source='selector:article',
        markdown=markdown,
        score=1000,
        confidence=confidence,
        text_length=len(markdown),
        meaningful_blocks=4,
        link_density=0.0,
        image_urls=(),
    )


def make_parsed(markdown, confidence='high'):
    return ParsedWebContent(
        title='Imported title',
        final_url='https://example.com/posts/1',
        candidates=(make_candidate(markdown, confidence),),
    )


class AIWebExtractionTests(TestCase):
    @patch('article.web_import_service.AIService.chat_completion_messages')
    def test_ai_selects_candidate_and_preserves_image_placeholder(self, mock_chat):
        markdown = (
            '## Heading\n\nThis is the original article paragraph with enough content for validation.\n\n'
            '![diagram](https://cdn.example.com/original.png)'
        )
        mock_chat.return_value = (
            'OD_SELECTED:candidate_1\nOD_CONTENT_BEGIN\n'
            '## Heading\n\nThis is the original article paragraph with enough content for validation.\n\n'
            '[[OD_IMAGE_CANDIDATE_1_0001]]\nOD_CONTENT_END'
        )

        result, selected = extract_content_with_ai(make_parsed(markdown))

        self.assertEqual(result, markdown)
        self.assertEqual(selected.candidate_id, 'candidate_1')
        sent_prompt = mock_chat.call_args.args[0][1]['content']
        self.assertIn('[[OD_IMAGE_CANDIDATE_1_0001]]', sent_prompt)
        self.assertNotIn('https://cdn.example.com/original.png', sent_prompt)

    @patch('article.web_import_service.AIService.chat_completion')
    def test_long_polishing_processes_all_chunks_without_losing_literals(self, mock_chat):
        paragraphs = [f'Paragraph {index} ' + ('content ' * 180) for index in range(12)]
        markdown = '\n\n'.join(paragraphs[:6])
        markdown += '\n\n![diagram](https://cdn.example.com/original.png)\n\n'
        markdown += '```python\nprint("kept")\n```\n\n'
        markdown += '\n\n'.join(paragraphs[6:])

        def echo_chunk(prompt):
            return prompt.rsplit('待润色内容：', 1)[1].strip()

        mock_chat.side_effect = echo_chunk
        polished = polish_markdown_content(markdown)

        self.assertGreater(mock_chat.call_count, 1)
        self.assertIn(paragraphs[-1].strip(), polished)
        self.assertIn('![diagram](https://cdn.example.com/original.png)', polished)
        self.assertIn('```python\nprint("kept")\n```', polished)

    def test_image_download_budget_rejects_bytes_above_total_limit(self):
        budget = ImageDownloadBudget(10)
        budget.claim(7)

        with self.assertRaisesRegex(WebParserError, '100 MB'):
            budget.claim(4)

        budget.release(7)
        budget.claim(10)

    @patch('article.web_import_service.AIService.chat_completion')
    def test_long_paragraph_does_not_split_an_image_placeholder(self, mock_chat):
        markdown = 'a' * 7995 + '![diagram](https://cdn.example.com/original.png)' + 'b' * 100
        mock_chat.side_effect = lambda prompt: prompt.rsplit('待润色内容：', 1)[1].strip()

        polished = polish_markdown_content(markdown)

        self.assertIn('![diagram](https://cdn.example.com/original.png)', polished)


class WebImportPersistenceTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix='odoc-web-import-test-')
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()
        self.anthology = Anthology.objects.create(
            coll_id='coll_web_service',
            title='Import service',
            type='article',
            user_id='web-importer',
        )

    def tearDown(self):
        self.settings_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    @patch('article.web_import_service.fetch_remote_image')
    @patch('article.web_import_service.extract_web_content')
    def test_original_image_bytes_are_localized_and_article_count_updates(
        self, mock_extract, mock_fetch_image,
    ):
        image_url = 'https://cdn.example.com/assets/source.png'
        mock_extract.return_value = make_parsed(
            f'## Heading\n\nArticle body text.\n\n![source]({image_url})'
        )
        mock_fetch_image.return_value = FetchedResource(
            final_url=image_url,
            content=PNG_BYTES,
            content_type='image/png',
        )

        result = import_webpage_as_article(
            url='https://example.com/posts/1',
            coll_id=self.anthology.coll_id,
            author='web-importer',
        )

        asset = Asset.objects.get(linked_article=result.article)
        with open(os.path.join(self.media_root, asset.file_path), 'rb') as image_file:
            self.assertEqual(image_file.read(), PNG_BYTES)
        self.assertIn(f'/api/resource/view/{asset.id}', result.article.content)
        self.assertNotIn(image_url, result.article.content)
        self.assertEqual(asset.source_type, 'content')
        self.assertEqual(result.report.localized_image_count, 1)
        self.assertEqual(result.report.external_image_count, 0)
        self.anthology.refresh_from_db()
        self.assertEqual(self.anthology.count, 1)

    @patch('article.web_import_service.fetch_remote_image')
    @patch('article.web_import_service.extract_web_content')
    def test_duplicate_image_bytes_create_one_asset(self, mock_extract, mock_fetch_image):
        first_url = 'https://cdn.example.com/assets/first.png'
        second_url = 'https://cdn.example.com/assets/second.png'
        mock_extract.return_value = make_parsed(
            f'![first]({first_url})\n\n![second]({second_url})'
        )
        mock_fetch_image.side_effect = lambda url, **_kwargs: FetchedResource(
            final_url=url,
            content=PNG_BYTES,
            content_type='image/png',
        )

        result = import_webpage_as_article(
            url='https://example.com/posts/1',
            coll_id=self.anthology.coll_id,
            author='web-importer',
        )

        self.assertEqual(Asset.objects.filter(linked_article=result.article).count(), 1)
        self.assertEqual(result.report.localized_image_count, 2)
        localized_urls = re.findall(r'!\[[^\]]*\]\((/api/resource/view/[^)]+)\)', result.article.content)
        self.assertEqual(len(localized_urls), 2)
        self.assertEqual(localized_urls[0], localized_urls[1])

    @patch('article.web_import_service.extract_content_with_ai')
    @patch('article.web_import_service.extract_web_content')
    def test_standard_import_does_not_call_ai(self, mock_extract, mock_ai):
        mock_extract.return_value = make_parsed('## Heading\n\nStandard article content.')

        result = import_webpage_as_article(
            url='https://example.com/posts/1',
            coll_id=self.anthology.coll_id,
            author='web-importer',
        )

        mock_ai.assert_not_called()
        self.assertEqual(result.report.extraction_mode, 'standard')

    def test_saved_zhihu_html_removes_noise_and_uses_embedded_original_image(self):
        encoded_image = base64.b64encode(PNG_BYTES).decode('ascii')
        html = f'''<!doctype html><html><head>
          <meta property="og:url" content="https://zhuanlan.zhihu.com/p/123">
          <title>(99+ messages) noisy browser title - 知乎</title></head><body>
          <main><article><h1 class="Post-Title">Offline Zhihu article</h1>
            <div class="Post-Author">author card noise</div>
            <div class="Post-RichTextContainer">
              <h2>四、推理大模型</h2>
              <p>按照预期计算，<b>这是需要完整保留的正文强调内容，不能被页面噪声干扰。</b>因为这是正文的后续内容。</p>
              <p>第二个有效段落用于验证离线 HTML 正文候选能够被稳定识别并保存。</p>
              <img src="data:image/png;base64,{encoded_image}"
                   data-original="https://pic.example.com/original.png">
            </div>
          </article><div class="recommend-list">recommended article noise</div></main>
        </body></html>'''.encode()
        uploaded = SimpleUploadedFile('saved-page.html', html, content_type='text/html')

        result = import_content_file_as_article(
            uploaded_file=uploaded,
            coll_id=self.anthology.coll_id,
            author='web-importer',
        )

        self.assertEqual(result.article.title, 'Offline Zhihu article')
        self.assertEqual(result.article.source_url, 'https://zhuanlan.zhihu.com/p/123')
        self.assertIn('## 四、推理大模型', result.article.content)
        self.assertIn('**这是需要完整保留的正文强调内容', result.article.content)
        self.assertNotIn('recommended article noise', result.article.content)
        asset = Asset.objects.get(linked_article=result.article)
        with open(os.path.join(self.media_root, asset.file_path), 'rb') as image_file:
            self.assertEqual(image_file.read(), PNG_BYTES)
        self.assertEqual(result.report.localized_image_count, 1)

    def test_unsupported_embedded_body_image_returns_warning(self):
        html = b'''<html><body><article>
          <p>This is a sufficiently long article paragraph for extraction.</p>
          <p>This second paragraph ensures the body is considered meaningful.</p>
          <img alt="vector" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">
        </article></body></html>'''

        result = import_content_file_as_article(
            uploaded_file=SimpleUploadedFile('article.html', html, content_type='text/html'),
            coll_id=self.anthology.coll_id,
            author='web-importer',
        )

        self.assertTrue(any('内嵌图片格式' in item for item in result.report.warnings))
        self.assertNotIn('embedded-unsupported.odoc.invalid', result.article.content)

    @patch('article.web_import_service.extract_content_with_ai')
    def test_markdown_file_import_preserves_content_without_ai(self, mock_ai):
        markdown = '# Markdown title\n\nOriginal paragraph.\n\n```python\nprint("kept")\n```'
        uploaded = SimpleUploadedFile(
            'notes.markdown', markdown.encode('utf-8'), content_type='text/markdown'
        )

        result = import_content_file_as_article(
            uploaded_file=uploaded,
            coll_id=self.anthology.coll_id,
            author='web-importer',
        )

        mock_ai.assert_not_called()
        self.assertEqual(result.article.title, 'Markdown title')
        self.assertEqual(result.article.content, markdown)

    @patch(
        'article.web_import_service.extract_content_with_ai',
        side_effect=RuntimeError('model unavailable'),
    )
    @patch('article.web_import_service.extract_web_content')
    def test_ai_failure_falls_back_to_standard_content(self, mock_extract, _mock_ai):
        markdown = '## Standard heading\n\nStandard extracted article body remains available.'
        mock_extract.return_value = make_parsed(markdown, confidence='medium')

        result = import_webpage_as_article(
            url='https://example.com/posts/1',
            coll_id=self.anthology.coll_id,
            author='web-importer',
            use_ai_extraction=True,
        )

        self.assertEqual(result.article.content, markdown)
        self.assertEqual(result.report.extraction_mode, 'standardFallback')
        self.assertTrue(any('普通提取结果' in warning for warning in result.report.warnings))

    @patch('article.views.NotificationService.send')
    @patch('article.web_import_service.AIService.chat_completion')
    def test_failed_polish_chunk_keeps_original_article(self, mock_chat, _mock_notify):
        original = '\n\n'.join('段落 ' + str(index) + ' 内容' * 1200 for index in range(3))
        article = Article.objects.create(
            title='Long article',
            content=original,
            coll_id=self.anthology.coll_id,
            author='web-importer',
            is_polishing=True,
        )
        mock_chat.side_effect = ['first chunk', RuntimeError('second chunk failed')]

        ArticlePolisher(article.article_id).run()

        article.refresh_from_db()
        self.assertEqual(article.content, original)
        self.assertFalse(article.is_polishing)
