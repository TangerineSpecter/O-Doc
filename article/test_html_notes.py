"""HTML archive regressions. All files and database writes are test-isolated."""
import base64
import json
import tempfile
import zipfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core import serializers
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework.test import APITestCase

from anthology.models import Anthology
from article.html_note_service import HtmlPreparer, import_original, load_package, media_path
from article.html_note_resources import delete_html_note, deletion_summary, retry_html_cleanup
from article.models import Article, ArticleAsset
from article.serializers import ArticleSerializer
from assets.models import Asset
from utils.rag_client import RagClient, RagSyncError
from utils.sync_manager import SyncManager, SyncError
from utils.web_parser import WebParserError


def image_bytes():
    output = BytesIO()
    Image.new('RGB', (2, 2), 'orange').save(output, 'PNG')
    return output.getvalue()


def archive(files):
    output = BytesIO()
    with zipfile.ZipFile(output, 'w') as package:
        for name, data in files.items():
            package.writestr(name, data)
    return SimpleUploadedFile('笔记.zip', output.getvalue())


class HtmlNoteTests(APITestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='odoc-html-test-')
        self.settings_override = override_settings(MEDIA_ROOT=self.directory.name)
        self.settings_override.enable()
        self.addCleanup(self.directory.cleanup)
        self.addCleanup(self.settings_override.disable)
        self.user = User.objects.create_user(username='html-importer')
        self.owner = f'user_{self.user.id}'
        self.collection = Anthology.objects.create(coll_id='html_test_collection', title='HTML', type='article', user_id=self.owner, permission='public')
        self.client.force_authenticate(user=self.user)
        data = base64.b64encode(image_bytes()).decode()
        self.html = f'''<!doctype html><html><head><title>中文笔记</title><style>.hero{{color:red}} /* STYLE_SECRET */</style></head>
        <body><header class="hero"><h1>安装记录</h1><p>页头摘要保留</p></header><p>唯一正文文本</p>
        <ul><li>步骤一</li></ul><table><tr><th>版本</th></tr><tr><td>0.10.2</td></tr></table>
        <pre><code class="language-bash">pip install vllm==0.10.2\nprint(1)</code></pre>
        <img alt="结果图" src="data:image/png;base64,{data}"><script>window.BAD=1; SCRIPT_SECRET</script>
        <form><input onfocus="alert(1)"></form><img src="https://example.com/remote.jpg" onerror="alert(1)"></body></html>'''.encode()

    def imported(self):
        articles, warnings = import_original(SimpleUploadedFile('中文笔记.html', self.html), self.collection.coll_id, self.owner)
        self.assertTrue(warnings)
        return articles[0]

    def test_static_import_extracts_clean_markdown_and_sanitizes_preview(self):
        article = self.imported()
        self.assertEqual(article.content_format, 'html')
        for text in ['页头摘要保留', '步骤一', '0.10.2', '```bash', 'pip install', '结果图']:
            self.assertIn(text, article.content)
        for text in ['STYLE_SECRET', 'SCRIPT_SECRET', 'base64', '<style', 'odoc-material:']:
            self.assertNotIn(text, article.content)
        self.assertEqual(article.asset_references.count(), 3)
        response = self.client.get(f'/api/article/html-preview/{article.pk}')
        self.assertEqual(response.status_code, 200)
        preview = response.content.decode()
        self.assertIn('.hero', preview)
        self.assertIn('data:image/png;base64,', preview)
        for forbidden in ['<script', '<form', 'onerror=', 'https://example.com/remote']:
            self.assertNotIn(forbidden, preview)
        self.assertIn("script-src 'none'", response['Content-Security-Policy'])
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_original_endpoint_and_read_only_capabilities(self):
        response = self.client.post('/api/article/import-file/', {'file': SimpleUploadedFile('page.htm', self.html), 'collId': self.collection.coll_id, 'importMode': 'original'})
        self.assertEqual(response.status_code, 200)
        payload = response.json()['data']['articles'][0]
        self.assertEqual(payload['contentFormat'], 'html')
        self.assertFalse(payload['canEditContent'])
        self.assertFalse(payload['canAnnotate'])
        self.assertTrue(payload['downloadUrl'])
        article = Article.objects.get(pk=payload['articleId'])
        serializer = ArticleSerializer(article, data={'content': 'changed'}, partial=True)
        self.assertFalse(serializer.is_valid())
        response = self.client.post('/api/article/annotations', {'articleId': article.pk, 'selectedText': '唯一正文文本', 'comment': '测试'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_private_preview_source_and_material_require_permission(self):
        article = self.imported()
        article.permission = 'private'
        article.save()
        ids = list(article.asset_references.values_list('asset_id', flat=True))
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(f'/api/article/html-preview/{article.pk}').status_code, 404)
        for asset_id in ids:
            response = self.client.get(f'/api/resource/view/{asset_id}')
            self.assertNotEqual(response.json().get('code'), 200)
        tree = self.client.get('/api/article/tree-list', {'coll_id': self.collection.coll_id}).json()['data']
        self.assertEqual(tree, [])
        other = User.objects.create_user(username='other-reader')
        self.client.force_authenticate(user=other)
        self.assertEqual(self.client.get(f'/api/article/html-preview/{article.pk}').status_code, 404)

    def test_conversion_shares_images_and_delete_preserves_copy(self):
        article = self.imported()
        response = self.client.post(f'/api/article/html-convert/{article.pk}', {}, format='json')
        self.assertEqual(response.status_code, 200)
        copy = Article.objects.get(pk=response.json()['data']['articleId'])
        self.assertEqual(copy.content_format, 'markdown')
        self.assertEqual(copy.content, article.content)
        self.assertTrue(response.json()['data']['canAnnotate'])
        material = copy.asset_references.get(role='material').asset
        summary = deletion_summary(article)
        self.assertEqual(summary, {'exclusive_count': 2, 'shared_count': 1})
        with self.captureOnCommitCallbacks(execute=True):
            delete_html_note(article, self.owner)
        self.assertTrue(media_path(material.file_path).is_file())
        self.assertEqual(Asset.objects.count(), 1)
        with self.captureOnCommitCallbacks(execute=True):
            delete_html_note(article, self.owner)
        self.assertEqual(Asset.objects.count(), 1)
        response = self.client.post('/api/article/annotations', {'articleId': copy.pk, 'selectedText': '唯一正文文本', 'comment': '副本评论'}, format='json')
        self.assertEqual(response.json()['code'], 200)

    def test_legacy_content_reference_preserves_material(self):
        article = self.imported()
        asset = article.asset_references.get(role='material').asset
        Article.objects.create(title='旧正文引用', content=f'![image](/api/resource/view/{asset.pk})', coll_id=self.collection.coll_id, author=self.owner)
        with self.captureOnCommitCallbacks(execute=True):
            delete_html_note(article, self.owner)
        self.assertTrue(Asset.objects.filter(pk=asset.pk, is_valid=True).exists())

    def test_private_conversion_copy_remains_private_and_syncs_privacy_flag(self):
        article = self.imported()
        article.permission = 'private'
        article.save()
        response = self.client.post(f'/api/article/html-convert/{article.pk}', {}, format='json')
        copy = Article.objects.get(pk=response.json()['data']['articleId'])
        self.assertTrue(copy.enforce_note_privacy)
        snapshot = SyncManager().build_snapshot_data()
        row = next(row for row in snapshot if row['model'] == 'article.article' and row['pk'] == copy.pk)
        self.assertTrue(row['fields']['enforce_note_privacy'])
        material = copy.asset_references.get(role='material').asset
        legacy = Article.objects.create(title='Legacy private', content='legacy', permission='private', coll_id=self.collection.coll_id, author=self.owner)
        # Upgrade protection also covers copies created before the new flag existed.
        from importlib import import_module
        from django.apps import apps
        from django.db import connection
        Article.objects.filter(pk=copy.pk).update(enforce_note_privacy=False)
        migration = import_module('article.migrations.0015_article_enforce_note_privacy')
        migration.protect_existing_copies(apps, connection.schema_editor())
        copy.refresh_from_db()
        legacy.refresh_from_db()
        self.assertTrue(copy.enforce_note_privacy)
        self.assertFalse(legacy.enforce_note_privacy)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(f'/api/article/detail/{copy.pk}').status_code, 404)
        self.assertNotEqual(self.client.get(f'/api/resource/view/{material.pk}').json()['code'], 200)
        self.assertEqual(self.client.get(f'/api/article/detail/{legacy.pk}').status_code, 200)
        other = User.objects.create_user(username='copy-reader')
        self.client.force_authenticate(user=other)
        self.assertEqual(self.client.get(f'/api/article/detail/{copy.pk}').status_code, 404)
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(f'/api/article/detail/{copy.pk}').status_code, 200)

    def test_removed_copy_image_is_no_longer_shared(self):
        article = self.imported()
        response = self.client.post(f'/api/article/html-convert/{article.pk}', {}, format='json')
        copy = Article.objects.get(pk=response.json()['data']['articleId'])
        material = copy.asset_references.get(role='material').asset
        serializer = ArticleSerializer(copy, data={'content': 'No images'}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self.assertFalse(copy.asset_references.exists())
        self.assertEqual(deletion_summary(article), {'exclusive_count': 3, 'shared_count': 0})
        serializer = ArticleSerializer(copy, data={'content': article.content}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        self.assertEqual(copy.asset_references.get(role='material').asset_id, material.pk)
        self.assertEqual(deletion_summary(article), {'exclusive_count': 2, 'shared_count': 1})
        serializer = ArticleSerializer(copy, data={'content': 'Removed again'}, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        with self.captureOnCommitCallbacks(execute=True):
            delete_html_note(article, self.owner)
        self.assertFalse(Asset.objects.filter(pk=material.pk).exists())
        self.assertFalse(media_path(material.file_path).exists())

    def test_legacy_media_aliases_cannot_bypass_private_resource_check(self):
        article = self.imported()
        article.permission = 'private'
        article.save()
        asset = article.asset_references.get(role='material').asset
        target = Path(self.directory.name) / 'uploads' / 'private.png'
        target.parent.mkdir()
        target.write_bytes(media_path(asset.file_path).read_bytes())
        asset.file_path = 'uploads/private.png'
        asset.save()
        (target.parent / 'alias.png').symlink_to(target)
        self.client.force_authenticate(user=None)
        for path in ['uploads/private.png', 'uploads/sub/../private.png', 'uploads/sub/%2e%2e/private.png', 'uploads/alias.png']:
            self.assertEqual(self.client.get('/media/' + path).status_code, 404, path)
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get('/media/uploads/private.png').status_code, 200)
        response = self.client.post(f'/api/article/html-convert/{article.pk}', {}, format='json')
        self.assertEqual(response.json()['code'], 200)
        with self.captureOnCommitCallbacks(execute=True):
            delete_html_note(article, self.owner)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get('/media/uploads/private.png').status_code, 404)
        self.assertEqual(self.client.get('/media/uploads/alias.png').status_code, 404)

    def test_stylesheet_media_and_import_scopes_are_preserved(self):
        files = {
            'page.html': b'<link rel="stylesheet" media="print" href="print.css"><style>@import url(print.css) layer(notes) supports((display: grid) and (not (color: red))) print;</style><p>Visible</p>',
            'print.css': b'body{display:none}',
        }
        _, content, preview, _ = HtmlPreparer(files).prepare('page.html')
        self.assertIn('media="print"', preview)
        self.assertIn('@layer notes', preview)
        self.assertIn('@supports (display: grid) and (not (color: red))', preview)
        self.assertIn('@media print', preview)
        self.assertEqual(content, 'Visible')
        from article.html_note_css import wrap_import_conditions
        self.assertIn('@supports (display: grid)', wrap_import_conditions('p{}', 'supports(display: grid) screen'))
        self.assertIn('@layer  {', wrap_import_conditions('p{}', 'layer print'))

    def test_cleanup_failure_is_retryable_and_paths_are_bounded(self):
        article = self.imported()
        with self.assertLogs('article.html_note_resources', level='ERROR'), patch('pathlib.Path.unlink', side_effect=OSError('disk failure')):
            with self.captureOnCommitCallbacks(execute=True):
                delete_html_note(article, self.owner)
        self.assertEqual(Asset.objects.filter(metadata__html_cleanup_pending=True).count(), 3)
        retry_html_cleanup()
        self.assertEqual(Asset.objects.count(), 0)
        with self.assertRaises(ValueError):
            media_path('../outside')

    def test_zip_multiple_notes_local_css_chinese_filename_and_dedup(self):
        data = b'<html><head><link rel="stylesheet" href="css/main.css"></head><body><h1>Note</h1><img src="assets/%E5%9B%BE.png"></body></html>'
        files = {'笔记/a.html': data, '笔记/b.htm': data, '笔记/assets/图.png': image_bytes(), '笔记/css/main.css': b'@import url(nested.css); h1{color:red}', '笔记/css/nested.css': 'body{background:white;background-image:url("../assets/图.png")}'.encode()}
        articles, _ = import_original(archive(files), self.collection.coll_id, self.owner)
        self.assertEqual(len(articles), 2)
        self.assertNotEqual(articles[0].title, articles[1].title)
        self.assertEqual(articles[0].asset_references.get(role='material', asset__file_type='image').asset_id, articles[1].asset_references.get(role='material', asset__file_type='image').asset_id)
        self.assertEqual(articles[0].asset_references.get(role='package').asset_id, articles[1].asset_references.get(role='package').asset_id)
        preview = media_path(articles[0].asset_references.get(role='preview').asset.file_path).read_text()
        self.assertIn('background:white', preview)
        self.assertNotIn('@import', preview)
        self.assertIn('background-image:url("/api/resource/view/', preview)

    def test_missing_zip_materials_reject_entire_package(self):
        files = {'good.html': b'<h1>Good</h1>', 'bad.html': b'<img src="missing.png"><style>@import url(missing.css);</style>'}
        with self.assertRaisesRegex(WebParserError, 'missing.css.*missing.png'):
            import_original(archive(files), self.collection.coll_id, self.owner)
        self.assertEqual(Article.objects.count(), 0)
        self.assertEqual(Asset.objects.count(), 0)
        self.assertEqual(list(Path(self.directory.name).rglob('*')), [])

    def test_zip_path_traversal_and_limits_rejected(self):
        for path in ['../bad.html', '/bad.html', 'C:/bad.html', '..\\bad.html']:
            with self.assertRaises(WebParserError):
                load_package(archive({path: b'bad'}))
        with patch('article.html_note_service.MAX_FILES', 1):
            with self.assertRaises(WebParserError):
                load_package(archive({'a.html': b'a', 'b.html': b'b'}))
        with patch('article.html_note_service.MAX_BYTES', 1):
            with self.assertRaises(WebParserError):
                load_package(archive({'a.html': b'large'}))

    def test_transaction_failure_cleans_new_files_not_dedup_files(self):
        existing = self.imported()
        before = {p for p in Path(self.directory.name).rglob('*') if p.is_file()}
        count = Asset.objects.count()
        with patch('article.html_note_service.ArticleAsset.objects.get_or_create', side_effect=RuntimeError('forced rollback')):
            with self.assertRaises(RuntimeError):
                import_original(SimpleUploadedFile('other.html', self.html + b'new'), self.collection.coll_id, self.owner)
        self.assertEqual(Asset.objects.count(), count)
        self.assertEqual(Article.objects.count(), 1)
        self.assertEqual({p for p in Path(self.directory.name).rglob('*') if p.is_file()}, before)

    @patch('rag.views.RagClient.add_article', return_value=1)
    def test_manual_rag_receives_only_extracted_markdown(self, add):
        article = self.imported()
        response = self.client.post('/api/rag/sync', {'articleId': article.pk}, format='json')
        self.assertEqual(response.json()['code'], 200)
        self.assertEqual(add.call_args.kwargs['content'], article.content)
        self.assertNotIn('STYLE_SECRET', add.call_args.kwargs['content'])
        article.refresh_from_db()
        self.assertTrue(article.is_rag_synced)

    def test_image_only_note_not_synced_successfully(self):
        data = base64.b64encode(image_bytes()).decode()
        _, markdown, _, _ = HtmlPreparer({'a.html': f'<img src="data:image/png;base64,{data}">'.encode()}).prepare('a.html')
        self.assertEqual(markdown, '')
        with self.assertRaises(RagSyncError):
            RagClient.add_article('empty', 'Empty', markdown, self.collection.coll_id)

    def test_sync_includes_html_refs_media_and_legacy_default(self):
        article = self.imported()
        manager = SyncManager()
        labels = {m._meta.label_lower for m in manager._iter_target_models()}
        self.assertIn('article.articleasset', labels)
        manifest = manager._build_v2_media_manifest()
        self.assertTrue(set(Asset.objects.values_list('file_path', flat=True)).issubset(manifest))
        data = json.loads(serializers.serialize('json', [article, *article.asset_references.all(), *Asset.objects.all()]))
        self.assertEqual(data[0]['fields']['content_format'], 'html')
        del data[0]['fields']['content_format']
        old = next(serializers.deserialize('json', json.dumps([data[0]]))).object
        self.assertEqual(old.content_format, 'markdown')
        with self.captureOnCommitCallbacks(execute=True):
            delete_html_note(article, self.owner)
        article.refresh_from_db()
        self.assertFalse(article.is_valid)
        self.assertFalse(ArticleAsset.objects.exists())

    def test_snapshot_roundtrip_and_remote_delete_reclaims_local_files(self):
        article = self.imported()
        manager = SyncManager()
        snapshot = manager.build_snapshot_data()
        paths = list(Asset.objects.values_list('file_path', flat=True))
        # Simulate a second device receiving the same serialized data and media.
        ArticleAsset.objects.all().delete()
        with self.captureOnCommitCallbacks(execute=True):
            manager.apply_snapshot_data(snapshot)
        self.assertEqual(ArticleAsset.objects.filter(article=article).count(), 3)
        self.assertEqual(self.client.get(f'/api/article/html-preview/{article.pk}').status_code, 200)
        # Receive a deletion snapshot: invalid note retained, refs/resources tombstoned.
        deleted = [row for row in snapshot if row['model'] not in {'assets.asset', 'article.articleasset'}]
        for row in deleted:
            if row['model'] == 'article.article' and row['pk'] == article.pk:
                row['fields']['is_valid'] = False
        with self.captureOnCommitCallbacks(execute=True):
            manager.apply_snapshot_data(deleted)
        self.assertFalse(Asset.objects.exists())
        self.assertTrue(all(not media_path(path).exists() for path in paths))

    def test_older_client_rejects_html_capable_snapshot(self):
        manager = SyncManager()
        with patch.object(SyncManager, 'get_current_app_version', return_value='0.9.7'):
            with self.assertRaises(SyncError):
                manager.validate_remote_snapshot_version({'app_version': '0.9.8'})

    def test_raw_media_does_not_expose_original_html_files(self):
        article = self.imported()
        source = article.asset_references.get(role='source').asset
        self.assertEqual(self.client.get('/media/' + source.file_path).status_code, 404)

    def test_private_resource_cannot_be_exposed_by_forged_markdown_reference(self):
        article = self.imported()
        article.permission = 'private'
        article.save()
        asset = article.asset_references.get(role='material').asset
        other = User.objects.create_user(username='resource-forger')
        collection = Anthology.objects.create(coll_id='forged_collection', title='Other', type='article', user_id=f'user_{other.id}')
        self.client.force_authenticate(user=other)
        response = self.client.post('/api/article/create', {'title': 'forged', 'collId': collection.coll_id, 'content': f'![x](/api/resource/view/{asset.pk})'}, format='json')
        self.assertNotEqual(response.json()['code'], 200, response.json())
        self.assertFalse(Article.objects.filter(title='forged').exists())

    def test_css_cannot_inject_script_into_extracted_text(self):
        files = {'a.html': b'<link rel="stylesheet" href="main.css"><h1>Safe</h1>', 'main.css': b'body{color:red}</style><script>EVIL_SCRIPT_TEXT</script>'}
        _, content, preview, _ = HtmlPreparer(files).prepare('a.html')
        self.assertNotIn('EVIL_SCRIPT_TEXT', content)
        self.assertNotIn('<script', preview)

    def test_anonymous_cannot_modify_or_delete_admin_html(self):
        article = self.imported()
        article.author = 'admin'
        article.save()
        self.collection.user_id = 'admin'
        self.collection.save()
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.put(f'/api/article/update/{article.pk}', {'title': 'forged'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/article/delete/{article.pk}').status_code, 403)
        article.refresh_from_db()
        self.assertTrue(article.is_valid)

    def test_gallery_agent_and_book_references_preserve_owned_images(self):
        from article.models import Image as GalleryImage
        from anthology.models import Book
        from system_settings.models import Agent
        article = self.imported()
        asset = article.asset_references.get(role='material').asset
        image = GalleryImage.objects.create(title='图库', image_url=f'/api/resource/view/{asset.pk}', coll_id=self.collection.coll_id)
        agent = Agent.objects.create(name='头像', avatar=f'/api/resource/view/{asset.pk}')
        book = Book.objects.create(title='封面', anthology=self.collection, asset=asset, cover_asset=asset, book_format='txt')
        self.assertEqual(deletion_summary(article)['shared_count'], 1)
        with self.captureOnCommitCallbacks(execute=True):
            delete_html_note(article, self.owner)
        self.assertTrue(Asset.objects.filter(pk=asset.pk, is_valid=True).exists())
        self.assertTrue(media_path(asset.file_path).exists())

    def test_retry_rechecks_restored_reference_and_retains_resource(self):
        article = self.imported()
        asset = article.asset_references.get(role='material').asset
        with self.assertLogs('article.html_note_resources', level='ERROR'), patch('pathlib.Path.unlink', side_effect=OSError('disk failure')):
            with self.captureOnCommitCallbacks(execute=True):
                delete_html_note(article, self.owner)
        copy = Article.objects.create(title='同步恢复正文', content=f'![x](/api/resource/view/{asset.pk})', coll_id=self.collection.coll_id, author=self.owner)
        ArticleAsset.objects.create(article=copy, asset=asset, role='material')
        retry_html_cleanup()
        asset.refresh_from_db()
        self.assertTrue(asset.is_valid)
        self.assertNotIn('html_cleanup_pending', asset.metadata)
        self.assertTrue(media_path(asset.file_path).exists())
