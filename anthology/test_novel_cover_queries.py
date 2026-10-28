from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from anthology.models import Anthology
from novel.models import Chapter, Project, Revision
from user.models import UserProfile


class NovelCoverQueryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='novel-cover-owner')
        self.other = User.objects.create_user(username='novel-cover-other')
        owner, other = f'user_{self.user.pk}', f'user_{self.other.pk}'
        UserProfile.objects.update_or_create(user=self.user, defaults={'userid': owner})
        UserProfile.objects.update_or_create(user=self.other, defaults={'userid': other})
        self.owned = [self.make_collection(f'novel-owned-{i}', owner, 'private' if i == 2 else 'public', i == 3)
                      for i in range(4)]
        self.public = [self.make_collection(f'novel-public-{i}', other, 'public', False) for i in range(2)]
        self.foreign_private = self.make_collection('novel-foreign-private', other, 'private', False)
        self.base = timezone.now() - timedelta(days=1)
        for collection in [*self.owned, *self.public, self.foreign_private]:
            project = Project.objects.get(pk=collection.pk)
            for index in range(6):
                chapter = Chapter.objects.create(id=f'{collection.pk}-{index}', project=project,
                    title=f'草稿标题{index}', position=index + 1, is_valid=index != 5,
                    outline='私密大纲' * 50, adopted_id=f'adopted-{index}' if index in (1, 2) else '')
                Chapter.objects.filter(pk=chapter.pk).update(created_at=self.base + timedelta(minutes=index))
                if index in (1, 2, 3):
                    revision = Revision.objects.create(id=f'rev-{collection.pk}-{index}', chapter=chapter,
                        title=f'已发布标题{index}', content='公开正文', content_hash='hash')
                    Chapter.objects.filter(pk=chapter.pk).update(published_id=revision.pk)
        self.empty_public = self.make_collection('novel-empty-public', owner, 'public', False)
        self.client = APIClient()

    @staticmethod
    def make_collection(pk, owner, permission, hidden):
        anthology = Anthology.objects.create(coll_id=pk, title=pk, user_id=owner, type='novel',
                                              permission=permission, hide_cover_content=hidden)
        Project.objects.create(anthology=anthology, direction='作者私密方向', setup={'public_synopsis': '公开简介'})
        return anthology

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_covers_keep_owner_and_published_views_with_bounded_queries(self, _pending):
        for authenticated in (False, True):
            self.client.force_authenticate(self.user if authenticated else None)
            with self.subTest(authenticated=authenticated), CaptureQueriesContext(connection) as queries:
                response = self.client.get('/api/anthology/list', {'type': 'novel'})
            self.assertEqual(response.data['code'], 200)
            rows = {item['coll_id']: item for item in response.data['data']}
            expected = {collection.pk for collection in [*self.owned, *self.public] if collection.permission == 'public'}
            if authenticated:
                expected.update(collection.pk for collection in self.owned)
                expected.add(self.empty_public.pk)
            self.assertEqual(set(rows), expected)
            for collection_id, row in rows.items():
                is_owner = authenticated and (collection_id in {collection.pk for collection in self.owned}
                                              or collection_id == self.empty_public.pk)
                self.assertEqual(row['description'], '作者私密方向' if is_owner else '公开简介')
                if collection_id == self.empty_public.pk:
                    self.assertEqual(row['articles'], [])
                    self.assertEqual(row['count'], 0)
                    continue
                self.assertEqual(row['count'], 5 if is_owner else 3)
                if collection_id == self.owned[3].pk:
                    self.assertEqual(row['articles'], [])
                    continue
                indexes = (0, 1, 2) if is_owner else (1, 2, 3)
                self.assertEqual([chapter['chapter_id'] for chapter in row['articles']],
                                 [f'{collection_id}-{index}' for index in indexes])
                for chapter, index in zip(row['articles'], indexes):
                    self.assertEqual(chapter['title'], f'草稿标题{index}' if is_owner else f'已发布标题{index}')
                    self.assertEqual(chapter['date'], (self.base + timedelta(minutes=index)).strftime('%m-%d'))
                    self.assertEqual(set(chapter), {'chapter_id', 'title', 'date'})
            chapter_queries = [query['sql'] for query in queries
                               if 'FROM "novel_chapter"' in query['sql'] and 'FROM "anthologies"' not in query['sql']]
            revision_queries = [query['sql'] for query in queries
                                if 'FROM "novel_revision"' in query['sql'] and 'FROM "novel_chapter"' not in query['sql']]
            self.assertEqual(len(chapter_queries), 5 if authenticated else 4, chapter_queries)
            self.assertEqual(len(revision_queries), 1, revision_queries)
            for query in chapter_queries:
                self.assertNotIn('"outline"', query)
            self.assertNotIn('"content"', revision_queries[0])

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_hidden_novel_covers_skip_chapter_previews(self, _pending):
        self.client.force_authenticate(self.user)
        Anthology.objects.filter(type='novel').update(hide_cover_content=True)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get('/api/anthology/list', {'type': 'novel'})
        self.assertTrue(all(not row['articles'] for row in response.data['data']))
        chapter_queries = [query['sql'] for query in queries
                           if 'FROM "novel_chapter"' in query['sql'] and 'FROM "anthologies"' not in query['sql']]
        self.assertEqual(len(chapter_queries), 3, chapter_queries)
        self.assertFalse(any('FROM "novel_revision"' in query['sql'] and 'FROM "novel_chapter"' not in query['sql']
                             for query in queries))

    def test_reader_batches_published_metadata_and_loads_only_selected_content(self):
        collection = self.public[0]
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(f'/api/novel/{collection.pk}/read/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['data']['chapters']), 3)
        self.assertEqual(response.data['data']['chapter']['content'], '公开正文')
        revision_queries = [query['sql'] for query in queries
                            if 'FROM "novel_revision"' in query['sql'] and 'FROM "novel_chapter"' not in query['sql']]
        self.assertEqual(len(revision_queries), 2, revision_queries)
        self.assertEqual(sum('"content"' in query for query in revision_queries), 1, revision_queries)

    @patch('system_settings.embedding_recovery.get_local_article_pending_counts', return_value=None)
    def test_broken_publication_pointers_never_expose_drafts_or_other_chapters(self, _pending):
        collection = self.public[0]
        missing = f'{collection.pk}-1'
        wrong_chapter = f'{collection.pk}-2'
        valid = f'{collection.pk}-3'
        Chapter.objects.filter(pk=missing).update(published_id='missing-revision')
        other_revision = Revision.objects.get(chapter_id=valid)
        Chapter.objects.filter(pk=wrong_chapter).update(published_id=other_revision.pk)
        Chapter.objects.create(id='only-broken-publication', project_id=self.empty_public.pk,
                               title='未发布的私密标题', published_id='missing-revision')

        response = self.client.get('/api/anthology/list', {'type': 'novel'})
        self.assertEqual(response.data['code'], 200)
        rows = {item['coll_id']: item for item in response.data['data']}
        self.assertNotIn(self.empty_public.pk, rows)
        self.assertEqual(rows[collection.pk]['count'], 1)
        self.assertEqual([item['chapter_id'] for item in rows[collection.pk]['articles']], [valid])
        self.assertEqual(rows[collection.pk]['articles'][0]['title'], '已发布标题3')

        detail = self.client.get(f'/api/anthology/detail/{collection.pk}')
        self.assertEqual(detail.data['data']['count'], 1)
        reader = self.client.get(f'/api/novel/{collection.pk}/read/')
        self.assertEqual(reader.status_code, 200)
        self.assertEqual([chapter['id'] for chapter in reader.data['data']['chapters']], [valid])
        self.assertEqual(reader.data['data']['chapter']['id'], valid)
        for chapter_id in (missing, wrong_chapter):
            self.assertEqual(self.client.get(f'/api/novel/{collection.pk}/read/{chapter_id}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/novel/{self.empty_public.pk}/read/').status_code, 404)

        self.client.force_authenticate(self.user)
        owner_list = self.client.get('/api/anthology/list', {'type': 'novel'}).data['data']
        own = next(row for row in owner_list if row['coll_id'] == self.empty_public.pk)
        self.assertEqual(own['articles'][0]['title'], '未发布的私密标题')
