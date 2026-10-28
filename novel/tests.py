import json
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.core import serializers
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from anthology.models import Anthology
from anthology.serializers import AnthologySerializer
from .models import Chapter, Entity, Fact, Job, Outline, Project, Revision, Review, Rule, Run, Thread, Relation
from .chapters import adopt, publish, save_revision, StaleDraft
from .memory import fingerprint, state_at
from .services import queue, use_candidate, delete_entity
from .validation import review_result
from .sync import metadata, validate, reset_execution
from .generation import prepare
from .worker import execute, recover, completion
from utils.sync_manager import SyncError, SyncManager


class NovelTests(TestCase):
    def setUp(self):
        # Worker calls run synchronously in these tests, inside TestCase's atomic
        # transaction. Keep connection cleanup from closing that test connection.
        self.enterContext(patch('novel.worker.close_old_connections'))
        self.user = get_user_model().objects.create_superuser(username='admin', password='test', email='admin@test.local')
        self.other = get_user_model().objects.create_user(username='reader', password='test')
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.guest = APIClient()
        self.anthology = Anthology.objects.create(type='novel', title='测试小说', user_id='admin', permission='private', description='作者秘密方向')
        self.project = Project.objects.create(anthology=self.anthology, setup={'public_synopsis': '公开简介'})
        self.entity = Entity.objects.create(project=self.project, name='江宁', biography='秘密身份', initial_state={'life': 'alive', 'location': '长安'})
        self.chapter = Chapter.objects.create(project=self.project, title='第一章', position=1, entity_ids=[self.entity.pk])

    def url(self, suffix=''):
        return f'/api/novel/{self.project.pk}/{suffix}'

    def save(self, content='江宁走进长安。'):
        revision = save_revision(self.chapter, content, self.chapter.draft_id)
        self.chapter.refresh_from_db()
        return revision

    def review(self, revision, changes=None, issues=None):
        return Review.objects.create(revision=revision, summary='本章摘要', context_hash=fingerprint(self.project, self.chapter.position), changes=changes or [], issues=issues or [])

    def adopted(self, content='江宁走进长安。'):
        revision = self.save(content)
        review = self.review(revision)
        self.chapter = adopt(self.chapter, review.pk, [], {})
        return revision

    def snapshot(self):
        models = [Anthology, Project, Entity, Outline, Chapter, Revision, Review, Fact, Thread, Rule, Run, Relation]
        return json.loads(serializers.serialize('json', [o for model in models for o in model.objects.all()]))

    def chapter_metadata_edits(self):
        return [('title', '修改后的章节名'), ('volume', '第二卷'), ('position', 4),
                ('outline', '兄长留在洛阳，江宁独自寻找旧信。'), ('entity_ids', []),
                ('story_time', '三年后'), ('time_order', 3), ('pov', '兄长')]

    def test_metadata_edit_rejects_old_candidate_without_changing_draft(self):
        revision = self.save()
        for field, value in self.chapter_metadata_edits():
            with self.subTest(field=field):
                run = Run.objects.create(project=self.project, chapter=self.chapter,
                    kind='generate', request_key=f'metadata-{field}', status='completed',
                    base_revision_id=revision.pk, context_hash=fingerprint(self.project, self.chapter.position),
                    result={'text': '根据旧设定生成的候选正文。'})
                response = self.client.post(self.url(f'chapters/{self.chapter.pk}/'), {field: value}, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                response = self.client.post(self.url(f'chapters/{self.chapter.pk}/candidate/'), {'run_id': run.pk}, format='json')
                self.assertEqual(response.status_code, 409, response.data)
                self.chapter.refresh_from_db()
                self.assertEqual(self.chapter.draft_id, revision.pk)
                self.assertEqual(self.chapter.revisions.count(), 1)

    def test_metadata_edit_requires_new_review_and_preserves_published_version(self):
        revision = self.adopted()
        self.chapter = publish(self.chapter, revision.pk)
        for field, value in self.chapter_metadata_edits():
            with self.subTest(field=field):
                review = self.review(revision)
                response = self.client.post(self.url(f'chapters/{self.chapter.pk}/'), {field: value}, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                self.chapter.refresh_from_db()
                needs_review = self.chapter.needs_review
                response = self.client.post(self.url(f'chapters/{self.chapter.pk}/adopt/'), {'review_id': review.pk}, format='json')
                self.assertEqual(response.status_code, 409, response.data)
                self.chapter.refresh_from_db()
                self.assertEqual(self.chapter.needs_review, needs_review)
                self.assertEqual(self.chapter.draft_id, revision.pk)
                self.assertEqual(self.chapter.adopted_id, revision.pk)
                self.assertEqual(self.chapter.published_id, revision.pk)
                fresh = self.review(revision)
                response = self.client.post(self.url(f'chapters/{self.chapter.pk}/adopt/'), {'review_id': fresh.pk}, format='json')
                self.assertEqual(response.status_code, 200, response.data)
                self.chapter.refresh_from_db()
                self.assertFalse(self.chapter.needs_review)
        reset_execution()
        self.chapter.refresh_from_db()
        self.assertFalse(self.chapter.needs_review)

    def test_unnamed_titles_and_limits(self):
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory, force_authenticate
        request = APIRequestFactory().post('/');force_authenticate(request, self.user);request = Request(request)
        for i in range(2):
            s = AnthologySerializer(data={'type': 'novel', 'title': '', 'description': '方向', 'icon_id': 'book'}, context={'request': request})
            self.assertTrue(s.is_valid(), s.errors); anth = s.save();self.assertEqual(anth.permission, 'private'); self.assertTrue(Project.objects.filter(pk=anth.pk).exists())
        self.assertEqual(Anthology.objects.filter(type='novel', title__startswith='未命名小说').count(), 2)
        s = AnthologySerializer(data={'type': 'article', 'title': 'a' * 21}, context={'request': request});self.assertFalse(s.is_valid())
        s = AnthologySerializer(data={'type': 'novel', 'title': 'a' * 100}, context={'request': request});self.assertTrue(s.is_valid(), s.errors)
        s = AnthologySerializer(self.anthology, data={'type': 'article'}, partial=True, context={'request': request});self.assertFalse(s.is_valid())

    def test_workbench_direction_is_shared_by_anthology_reads_and_edits(self):
        direction = '完整创作方向' * 100
        response = self.client.patch(self.url(), {'direction': direction}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.get(f'/api/anthology/detail/{self.project.pk}')
        self.assertEqual(response.data['data']['description'], direction)
        response = self.client.get('/api/anthology/list', {'type': 'novel'})
        self.assertEqual(response.data['data'][0]['description'], direction)

        new_direction = '首页修改后的完整方向' * 100
        response = self.client.put(f'/api/anthology/update/{self.project.pk}',
                                   {'description': new_direction}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['description'], new_direction)
        self.project.refresh_from_db()
        self.assertEqual(self.project.direction, new_direction)
        self.assertEqual(self.client.get(self.url()).data['data']['direction'], new_direction)
        run = Run(project=self.project, kind='blueprint', input={})
        messages, _ = prepare(run)
        self.assertIn(new_direction, messages[-1]['content'])
        # Partial metadata updates must not restore the old legacy description.
        response = self.client.put(f'/api/anthology/update/{self.project.pk}', {'icon_id': 'book'}, format='json')
        self.assertEqual(response.data['data']['description'], new_direction)

    def test_create_long_direction_keeps_short_legacy_column_and_syncs_full_text(self):
        direction = '长篇创作方向' * 100
        response = self.client.post('/api/anthology/create',
                                   {'type': 'novel', 'title': '完整方向', 'description': direction}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['description'], direction)
        project = Project.objects.get(pk=response.data['data']['coll_id'])
        self.assertEqual(project.direction, direction)
        self.assertLessEqual(len(project.anthology.description), 100)
        snapshot = self.snapshot()
        validate(snapshot, metadata(snapshot))
        exported = next(row for row in snapshot if row['model'] == 'novel.project' and row['pk'] == project.pk)
        self.assertEqual(exported['fields']['direction'], direction)

    def test_direction_limits_and_failed_edit_leave_project_unchanged(self):
        for endpoint, method, payload in [
            (self.url(), self.client.patch, {'direction': 'x' * 30001}),
            (f'/api/anthology/update/{self.project.pk}', self.client.put, {'description': 'x' * 30001}),
            (f'/api/anthology/update/{self.project.pk}', self.client.put, {'description': '有效方向', 'title': 'x' * 101}),
        ]:
            with self.subTest(endpoint=endpoint, payload=list(payload)):
                response = method(endpoint, payload, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.project.refresh_from_db()
                self.assertEqual(self.project.direction, '')
        response = self.client.post('/api/anthology/create',
                                   {'type': 'article', 'title': '普通文集', 'description': 'x' * 101}, format='json')
        self.assertEqual(response.data['code'], 400, response.data)
        self.assertFalse(Anthology.objects.filter(title='普通文集').exists())

    def test_shared_direction_stays_private_in_public_anthology_responses(self):
        self.project.direction = '不能公开的完整创作方向'
        self.project.save()
        revision = self.adopted()
        publish(self.chapter, revision.pk)
        self.anthology.permission = 'public'
        self.anthology.save()
        for client in (self.guest, self.client):
            if client is self.client:
                client.force_authenticate(self.other)
            response = client.get(f'/api/anthology/detail/{self.project.pk}')
            self.assertEqual(response.data['data']['description'], '公开简介')
            response = client.get('/api/anthology/list', {'type': 'novel'})
            self.assertEqual(response.data['data'][0]['description'], '公开简介')
            self.assertNotIn(self.project.direction, json.dumps(response.data, ensure_ascii=False))
        response = self.client.put(f'/api/anthology/update/{self.project.pk}', {'description': '越权方向'}, format='json')
        self.assertEqual(response.status_code, 404)
        self.project.refresh_from_db()
        self.assertEqual(self.project.direction, '不能公开的完整创作方向')

    def test_private_author_routes_and_empty_public_list(self):
        self.assertIn(self.guest.get(self.url()).status_code, (401, 403))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url()).status_code, 404)
        self.assertEqual(self.client.get(self.url('chapters/' + self.chapter.pk + '/')).status_code, 404)
        self.anthology.permission = 'public'; self.anthology.save()
        response = self.guest.get('/api/anthology/list', {'type': 'novel'})
        self.assertNotIn(self.project.pk, json.dumps(response.data))
        self.assertEqual(self.guest.get(self.url('read/')).status_code, 404)

    def test_public_creation_keeps_drafts_private_and_permission_editable(self):
        response = self.client.post('/api/anthology/create', {'type': 'novel', 'title': '可公开的小说', 'description': '作者私密创作方向', 'icon_id': 'book', 'permission': 'public'}, format='json')
        self.assertEqual(response.status_code, 200)
        cid = response.data['data']['coll_id']
        anthology = Anthology.objects.get(pk=cid)
        self.assertEqual(anthology.permission, 'public')
        project = Project.objects.get(pk=cid)
        chapter = Chapter.objects.create(project=project, title='私密草稿章节')
        save_revision(chapter, '未经发布的私密正文。', '')
        self.assertEqual(self.guest.get(f'/api/novel/{cid}/read/').status_code, 404)
        self.assertNotIn(cid, json.dumps(self.guest.get('/api/anthology/list', {'type': 'novel'}).data))
        self.assertIn(self.guest.get(f'/api/novel/{cid}/').status_code, (401, 403))
        for permission in ('private', 'public'):
            response = self.client.put(f'/api/anthology/update/{cid}', {'permission': permission}, format='json')
            self.assertEqual(response.status_code, 200);anthology.refresh_from_db()
            self.assertEqual(anthology.permission, permission)

    def test_publication_frozen_and_unpublish_immediate(self):
        revision = self.adopted(); self.chapter = publish(self.chapter, revision.pk)
        self.chapter.title = '新标题'; self.chapter.save(); self.save('草稿机密，江宁身份曝光。')
        response = self.guest.get(self.url('read/'));data = response.data['data']
        self.assertEqual(data['chapter']['content'], revision.content);self.assertEqual(data['chapter']['title'], '第一章')
        self.assertNotIn('秘密身份', json.dumps(data, ensure_ascii=False));self.assertNotIn('草稿机密', json.dumps(data, ensure_ascii=False))
        self.assertNotIn('作者秘密方向', json.dumps(self.guest.get('/api/anthology/list', {'type': 'novel'}).data, ensure_ascii=False))
        r = self.client.post(self.url(f'chapters/{self.chapter.pk}/unpublish/'), {}, format='json');self.assertEqual(r.status_code, 200)
        self.assertEqual(self.guest.get(self.url('read/' + self.chapter.pk + '/')).status_code, 404)

    def test_save_not_canon_and_critical_confirmation(self):
        revision = self.save('江宁在长安死去。')
        changes = review_result({'changes': [{'kind': 'state', 'entity_id': self.entity.pk, 'field': 'life', 'value': 'dead', 'description': '江宁死亡', 'quote': '江宁在长安死去。'}]}, revision)['changes']
        review = self.review(revision, changes)
        self.assertEqual(state_at(self.project)['states'][self.entity.pk]['life'], 'alive')
        with self.assertRaises(ValidationError):adopt(self.chapter, review.pk, [], {})
        self.chapter = adopt(self.chapter, review.pk, ['change-0'], {})
        self.assertEqual(state_at(self.project)['states'][self.entity.pk]['life'], 'dead')
        self.assertEqual(Fact.objects.count(), 1)

    def test_old_chapter_rewrite_invalidation_and_no_old_facts(self):
        old = self.save('江宁死去。');review = self.review(old, [{'id': 'death', 'kind': 'state', 'entity_id': self.entity.pk, 'field': 'life', 'value': 'dead', 'quote': '江宁死去。', 'critical': True}])
        self.chapter = adopt(self.chapter, review.pk, ['death'], {})
        later = Chapter.objects.create(project=self.project, title='后章', position=2)
        rev2 = save_revision(later, '回忆中的江宁。', '')
        later = adopt(later, Review.objects.create(revision=rev2, context_hash=fingerprint(self.project, 2)).pk, [], {})
        new = self.save('江宁离开长安。');self.chapter = adopt(self.chapter, self.review(new).pk, [], {})
        later.refresh_from_db();self.assertTrue(later.needs_review)
        self.assertEqual(state_at(self.project)['states'][self.entity.pk]['life'], 'alive')
        third = Chapter.objects.create(project=self.project, position=3)
        run = Run.objects.create(project=self.project, chapter=third, kind='generate', request_key='blocked-generation')
        with self.assertRaises(ValidationError):prepare(run)

    def test_story_time_and_knowledge_visibility(self):
        revision = self.save('江宁死去。');self.chapter.time_order = 10;self.chapter.save()
        self.chapter = adopt(self.chapter, self.review(revision, [{'id': 'death', 'kind': 'state', 'entity_id': self.entity.pk, 'field': 'life', 'value': 'dead', 'quote': '江宁死去。', 'critical': True}]).pk, ['death'], {})
        self.assertEqual(state_at(self.project, before=2, time_order=5)['states'][self.entity.pk]['life'], 'alive')
        self.assertEqual(state_at(self.project, before=2, time_order=12)['states'][self.entity.pk]['life'], 'dead')
        self.assertEqual(state_at(self.project, before=1)['states'][self.entity.pk]['life'], 'alive')

    def test_delete_reference_protection_and_rename(self):
        self.save(); self.entity.name = '江远'; self.entity.aliases = ['江宁']; self.entity.save()
        with self.assertRaises(ValidationError):delete_entity(self.entity)
        candidate = Entity.objects.create(project=self.project, name='候选')
        outline = Outline.objects.create(project=self.project, title='粗纲', entity_ids=[candidate.pk])
        with self.assertRaises(ValidationError):delete_entity(candidate)
        outline.delete();delete_entity(candidate);self.assertFalse(Entity.objects.filter(pk=candidate.pk).exists())

    def test_thread_delete_preserves_unadopted_review_snapshot(self):
        thread = Thread.objects.create(project=self.project, title='旧信线索')
        revision = self.save('江宁找到旧信。')
        self.review(revision, changes=[{'kind': 'thread', 'thread_id': thread.pk, 'value': 'planted',
            'description': '旧信出现', 'quote': '江宁找到旧信。'}])
        endpoint = self.url(f'threads/{thread.pk}/')
        before = self.snapshot()
        for _ in range(2):
            response = self.client.delete(endpoint)
            self.assertEqual(response.status_code, 400)
            self.assertIn('历史审查', response.data['msg'])
            self.assertTrue(Thread.objects.filter(pk=thread.pk).exists())
            self.assertEqual(self.snapshot(), before)
            data = self.snapshot();validate(data, metadata(data))
        # Unreferenced cards still delete normally, without changing history.
        unused = Thread.objects.create(project=self.project, title='备用线索')
        unused_url = self.url(f'threads/{unused.pk}/')
        self.assertEqual(self.client.delete(unused_url).status_code, 200)
        self.assertEqual(self.client.delete(unused_url).status_code, 404)
        data = self.snapshot();validate(data, metadata(data))

    def test_thread_delete_preserves_fact_and_rejects_cross_project_access(self):
        thread = Thread.objects.create(project=self.project, title='正文线索')
        revision = self.save('江宁找到旧信。')
        Fact.objects.create(project=self.project, chapter=self.chapter, revision=revision,
            data={'kind': 'thread', 'thread_id': thread.pk, 'value': 'planted', 'quote': '江宁找到旧信。'})
        response = self.client.delete(self.url(f'threads/{thread.pk}/'))
        self.assertEqual(response.status_code, 400)
        self.assertIn('正文证据', response.data['msg'])
        anthology = Anthology.objects.create(type='novel', title='另一本书', user_id='admin')
        other = Project.objects.create(anthology=anthology)
        self.assertEqual(self.client.delete(f'/api/novel/{other.pk}/threads/{thread.pk}/').status_code, 404)
        self.assertTrue(Thread.objects.filter(pk=thread.pk).exists())
        data = self.snapshot();validate(data, metadata(data))

    def test_uncertain_death_and_reader_information_not_character_knowledge(self):
        revision = self.save('众人传言江宁已死。读者看到他仍在城外。')
        changes = review_result({'changes': [
            {'kind': 'state', 'entity_id': self.entity.pk, 'field': 'life', 'value': 'dead', 'certainty': 'rumor', 'description': '死亡传言', 'quote': '众人传言江宁已死。'},
            {'kind': 'knowledge', 'scope': 'reader', 'description': '江宁仍在城外', 'quote': '读者看到他仍在城外。'}]}, revision)['changes']
        self.chapter = adopt(self.chapter, self.review(revision, changes).pk, ['change-0'], {})
        memory = state_at(self.project)
        self.assertEqual(memory['states'][self.entity.pk]['life'], 'alive')
        self.assertIn('死亡传言', memory['states'][self.entity.pk]['uncertain'])
        self.assertEqual(memory['reader_knowledge'], [{'description': '江宁仍在城外', 'certainty': 'certain'}])
        self.assertNotIn('knowledge', memory['states'][self.entity.pk])

    def test_flashback_without_known_time_does_not_rewrite_present_life(self):
        revision = self.save('回忆中，江宁死去。')
        changes = review_result({'changes': [{'kind': 'state', 'entity_id': self.entity.pk, 'field': 'life', 'value': 'dead', 'scene_mode': 'flashback', 'time_order': None, 'description': '回忆里的死亡', 'quote': '回忆中，江宁死去。'}]}, revision)['changes']
        self.chapter = adopt(self.chapter, self.review(revision, changes).pk, ['change-0'], {})
        memory = state_at(self.project)
        self.assertEqual(memory['states'][self.entity.pk]['life'], 'alive')
        self.assertEqual(memory['timeline'][0]['scene_mode'], 'flashback')

    def test_partial_timeline_does_not_resurrect_character_in_known_flashback(self):
        revision = self.save('江宁死去。回忆五年前，江宁仍然活着。')
        known = Chapter.objects.create(project=self.project, title='已知时间的旧事', position=2, time_order=1)
        changes = review_result({'changes': [
            {'kind': 'state', 'entity_id': self.entity.pk, 'field': 'life', 'value': 'dead', 'quote': '江宁死去。'},
            {'kind': 'state', 'entity_id': self.entity.pk, 'field': 'life', 'value': 'alive', 'scene_mode': 'flashback', 'time_order': known.time_order, 'quote': '回忆五年前，江宁仍然活着。'}]}, revision)['changes']
        self.chapter = adopt(self.chapter, self.review(revision, changes).pk, ['change-0', 'change-1'], {})
        memory = state_at(self.project)
        self.assertEqual(memory['states'][self.entity.pk]['life'], 'dead')
        self.assertEqual(memory['timeline'][1]['time_order'], 1)

    def test_rename_keeps_original_name_as_alias(self):
        response = self.client.post(self.url(f'entities/{self.entity.pk}/'), {'name': '江远'}, format='json')
        self.assertEqual(response.status_code, 200);self.entity.refresh_from_db();self.assertIn('江宁', self.entity.aliases)

    def test_planned_relationship_and_cross_project_references(self):
        target = Entity.objects.create(project=self.project, name='兄长')
        relation = Relation.objects.create(project=self.project, source_id=self.entity.pk, target_id=target.pk, description='兄弟', secret=True)
        with self.assertRaises(ValidationError):delete_entity(target)
        data = self.snapshot();validate(data, metadata(data))
        relation.target_id = 'other-book-entity';relation.save()
        with self.assertRaises(SyncError):validate(self.snapshot())

    def test_checks_protect_versions_and_whole_project_can_be_purged(self):
        revision = self.adopted('江宁离开长安。')
        Fact.objects.create(project=self.project, chapter=self.chapter, revision=revision, data={'kind': 'event', 'description': '启程', 'quote': '江宁离开长安。'})
        for i in range(8):self.save(f'新稿{i}')
        self.assertTrue(Review.objects.filter(revision=revision).exists())
        self.anthology.delete();self.assertFalse(Chapter.objects.filter(pk=self.chapter.pk).exists())

    def test_history_retention_and_restore_is_draft(self):
        adopted = self.adopted();self.chapter = publish(self.chapter, adopted.pk)
        for i in range(10):self.save(f'江宁写下第{i}段。')
        self.assertEqual(self.chapter.revisions.count(), 7)  # current + 5 history + protected adopted/published
        self.assertTrue(self.chapter.revisions.filter(pk=adopted.pk).exists())
        result = self.client.post(self.url(f'chapters/{self.chapter.pk}/restore/'), {'revision_id': adopted.pk, 'base_revision_id': self.chapter.draft_id}, format='json')
        self.assertEqual(result.status_code, 200);self.chapter.refresh_from_db()
        self.assertNotEqual(self.chapter.draft_id, adopted.pk);self.assertEqual(self.chapter.adopted_id, adopted.pk);self.assertEqual(self.chapter.published_id, adopted.pk)

    def test_same_version_recheck_replaces_facts_and_invalidates_dependents(self):
        revision = self.save('江宁离开长安。')
        initial = {'id': 'location', 'kind': 'state', 'entity_id': self.entity.pk, 'field': 'location', 'value': '城外', 'quote': '江宁离开长安。'}
        self.chapter = adopt(self.chapter, self.review(revision, [initial]).pk, [], {})
        later = Chapter.objects.create(project=self.project, title='次章', position=2)
        next_revision = save_revision(later, '江宁等在城外。', '')
        first_hash = fingerprint(self.project, 2)
        later = adopt(later, Review.objects.create(revision=next_revision, context_hash=first_hash).pk, [], {})
        refined = dict(initial, value='长安城门', description='纠正状态提取')
        self.chapter = adopt(self.chapter, self.review(revision, [refined]).pk, [], {})
        self.assertEqual(Fact.objects.filter(revision=revision).count(), 1)
        self.assertEqual(state_at(self.project)['states'][self.entity.pk]['location'], '长安城门')
        later.refresh_from_db();self.assertTrue(later.needs_review)
        self.assertNotEqual(fingerprint(self.project, 2), first_hash)
        self.assertEqual(Review.objects.filter(revision=revision).count(), 2)

    def test_item_transfer_updates_both_holders(self):
        recipient = Entity.objects.create(project=self.project, name='兄长', initial_state={'items': []})
        item = Entity.objects.create(project=self.project, kind='item', name='旧信', initial_state={'holder': self.entity.pk})
        self.entity.initial_state['items'] = [item.pk];self.entity.save()
        revision = self.save('江宁把旧信交给兄长。')
        changes = review_result({'changes': [{'kind': 'state', 'entity_id': item.pk, 'field': 'holder', 'value': recipient.pk, 'quote': '江宁把旧信交给兄长。'}]}, revision)['changes']
        self.chapter = adopt(self.chapter, self.review(revision, changes).pk, [], {})
        states = state_at(self.project)['states']
        self.assertNotIn(item.pk, states[self.entity.pk]['items'])
        self.assertIn(item.pk, states[recipient.pk]['items'])
        self.assertEqual(states[item.pk]['holder'], recipient.pk)

    def test_restore_identical_content_still_creates_new_draft(self):
        revision = self.adopted()
        response = self.client.post(self.url(f'chapters/{self.chapter.pk}/restore/'), {'revision_id': revision.pk, 'base_revision_id': revision.pk}, format='json')
        self.assertEqual(response.status_code, 200);self.chapter.refresh_from_db()
        self.assertNotEqual(self.chapter.draft_id, revision.pk)
        self.assertEqual(self.chapter.adopted_id, revision.pk)

    def test_exports_use_selected_version_and_plain_text(self):
        revision = self.adopted('江宁收下**旧信**，看向[城外](https://example.test)。')
        self.chapter = publish(self.chapter, revision.pk)
        self.save('秘密草稿')
        response = self.client.get(self.url('export/?version=published&fileType=txt'))
        self.assertEqual(response.status_code, 200)
        content = response.data['data']['content']
        self.assertIn('江宁收下旧信，看向城外。', content)
        self.assertNotIn('秘密草稿', content);self.assertNotIn('https://', content)
        self.assertEqual(self.guest.get(self.url('export/')).status_code, 401)

    def test_ordinary_article_paths_cannot_manage_novel(self):
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory, force_authenticate
        from article.access import can_manage_anthology, can_access_anthology
        request = APIRequestFactory().post('/');force_authenticate(request, self.user);request = Request(request)
        self.assertFalse(can_manage_anthology(request, self.project.pk))
        self.assertFalse(can_access_anthology(request, self.project.pk))

    def test_concurrent_chapter_positions_preserve_drafts_and_block_generation(self):
        response = self.client.post(self.url('chapters/'), {'title': '重复顺序', 'position': 1}, format='json')
        self.assertEqual(response.status_code, 400)
        concurrent = Chapter.objects.create(project=self.project, title='另一设备新增', position=1)
        original = self.save();other = save_revision(concurrent, '另一份草稿。', '')
        reset_execution();self.chapter.refresh_from_db();concurrent.refresh_from_db()
        self.assertTrue(self.chapter.needs_review);self.assertTrue(concurrent.needs_review)
        self.assertEqual(Revision.objects.filter(pk__in=[original.pk, other.pk]).count(), 2)
        run = Run.objects.create(project=self.project, chapter=concurrent, kind='generate', request_key='collision-order')
        with self.assertRaises(ValidationError):prepare(run)

    def test_candidate_only_replaces_selection_and_rejects_stale(self):
        revision = self.save('前文😀选中后文。')
        run = Run.objects.create(project=self.project, chapter=self.chapter, kind='rewrite', request_key='rewrite-selection', base_revision_id=revision.pk, context_hash=fingerprint(self.project, 1), status='completed', input={'start': 3, 'end': 5}, result={'text': '替换'})
        result = use_candidate(self.chapter, run);self.assertEqual(result.content, '前文😀替换后文。')
        with self.assertRaises(StaleDraft):use_candidate(self.chapter, run)

    def test_review_stale_and_evidence_validation(self):
        revision = self.save();review = self.review(revision)
        self.project.blueprint = '改变方向';self.project.save()
        with self.assertRaises(StaleDraft):adopt(self.chapter, review.pk, [], {})
        with self.assertRaises(ValidationError):review_result({'changes': [{'kind': 'event', 'quote': '编造原文'}]}, revision)

    def test_exact_rules_and_reasoned_dismissal(self):
        revision = self.save('江宁不禁倒吸一口凉气。');review = self.review(revision, issues=[{'id': 'conflict', 'description': '与前文冲突', 'blocking': True}])
        rule = Rule.objects.create(project=self.project, kind='literal', instruction='禁用套话', example='倒吸一口凉气', strength='forbid')
        review.context_hash = fingerprint(self.project, 1);review.save()
        with self.assertRaises(ValidationError):adopt(self.chapter, review.pk, [], {'conflict': '这是回忆'})
        rule.exception = '本次作为讽刺台词允许';rule.save();review.context_hash = fingerprint(self.project, 1);review.save()
        with self.assertRaises(ValidationError):adopt(self.chapter, review.pk, [], {})
        self.chapter = adopt(self.chapter, review.pk, [], {'conflict': '这是回忆'});review.refresh_from_db();self.assertEqual(review.dismissed['conflict'], '这是回忆')

    def test_request_idempotence_completion_and_unknown_usage(self):
        revision = self.save()
        data = {'kind': 'generate', 'chapter_id': self.chapter.pk, 'request_key': 'idempotent-key', 'base_revision_id': revision.pk}
        run = queue(self.project, data);self.assertEqual(queue(self.project, data).pk, run.pk)
        with self.assertRaises(StaleDraft):queue(self.project, {**data, 'instruction': '改变'})
        with patch('novel.worker.completion', return_value=('生成正文。', None)) as provider:
            execute(run.pk);execute(run.pk);self.assertEqual(provider.call_count, 1)
        run.refresh_from_db();self.assertEqual(run.status, 'completed');self.assertFalse(run.result['usage_known']);self.assertFalse(Fact.objects.exists())

    def test_cancel_and_interrupted_jobs_require_explicit_retry(self):
        run = queue(self.project, {'kind': 'chat', 'request_key': 'cancelled-key', 'instruction': '方向'})
        response = self.client.post(self.url(f'runs/{run.pk}/cancel/'), {}, format='json');self.assertEqual(response.status_code, 200)
        with patch('novel.worker.completion') as provider:execute(run.pk);provider.assert_not_called()
        run.refresh_from_db();self.assertEqual(run.status, 'cancelled')
        run.status = 'running';run.save();Job.objects.filter(run=run).update(lease_until=timezone.now() - timedelta(minutes=1));recover(run);self.assertEqual(run.status, 'interrupted')

    def test_failed_review_does_not_change_adoption(self):
        previous = self.adopted();self.save('下一稿。')
        run = queue(self.project, {'kind': 'review', 'chapter_id': self.chapter.pk, 'request_key': 'failed-review-key', 'base_revision_id': self.chapter.draft_id})
        with patch('novel.worker.completion', return_value=('bad-json', None)):execute(run.pk)
        run.refresh_from_db();self.chapter.refresh_from_db();self.assertEqual(run.status, 'failed');self.assertEqual(self.chapter.adopted_id, previous.pk)

    def test_truncated_stream_is_not_a_completed_chapter(self):
        from types import SimpleNamespace as NS
        run = Run.objects.create(project=self.project, kind='chat', request_key='stream-truncated')
        Job.objects.create(run=run)
        class Stream:
            def __iter__(self):
                yield NS(usage=None, choices=[NS(delta=NS(content='一段尚未完成的正文'), finish_reason=None)])
                yield NS(usage=None, choices=[NS(delta=NS(content=''), finish_reason='length')])
            def close(self):pass
        config = {'api_key': 'fake', 'base_url': 'http://fake.invalid/v1', 'model_name': 'fake', 'model_type': 'chat'}
        with patch('novel.worker.AIService.get_default_client_config', return_value=config), patch('novel.worker.create_completion', return_value=Stream()):
            with self.assertRaises(ValueError):completion(run, [{'role': 'user', 'content': 'test'}])
        self.assertFalse(Fact.objects.exists())

    def test_scoped_rules_do_not_block_unrelated_chapters(self):
        from .chapters import literal_issues
        other = Chapter.objects.create(project=self.project, title='其他章节', position=2)
        Rule.objects.create(project=self.project, kind='literal', strength='forbid', instruction='此章禁止', example='套话', scope_chapter_ids=[self.chapter.pk])
        self.assertEqual(literal_issues(self.project, '套话', other), [])
        self.assertEqual(len(literal_issues(self.project, '套话', self.chapter)), 1)

    def test_duplicate_rule_reactivates_without_merging_different_scopes(self):
        rule = Rule.objects.create(project=self.project, kind='literal', instruction='避免此句', example='套话', enabled=False)
        response = self.client.post(self.url('rules/'), {'kind': 'literal', 'instruction': '避免此句', 'example': '套话', 'strength': 'forbid'}, format='json')
        self.assertEqual(response.status_code, 200);rule.refresh_from_db();self.assertTrue(rule.enabled)
        self.assertEqual(Rule.objects.count(), 1)
        response = self.client.post(self.url('rules/'), {'kind': 'literal', 'instruction': '避免此句', 'example': '套话', 'scope_chapter_ids': [self.chapter.pk]}, format='json')
        self.assertEqual(response.status_code, 200);self.assertEqual(Rule.objects.count(), 2)

    def test_blueprint_adoption_is_atomic_and_keeps_existing_identity(self):
        run = Run.objects.create(project=self.project, kind='blueprint', status='completed', request_key='blueprint-key', context_hash=fingerprint(self.project), result={'proposal': {'setup': {'genre': '悬疑'}, 'blueprint': '完整主线', 'style': '克制', 'entities': [{'name': '江宁', 'kind': 'person', 'biography': '不应覆盖'}, {'name': '兄长', 'kind': 'person'}], 'outlines': [], 'threads': [], 'relations': [{'source_name': '江宁', 'target_name': '兄长', 'description': '兄弟'}]}})
        response = self.client.post(self.url(f'runs/{run.pk}/blueprint/'), {}, format='json')
        self.assertEqual(response.status_code, 200);self.entity.refresh_from_db();self.assertEqual(self.entity.biography, '秘密身份')
        self.assertEqual(Relation.objects.count(), 1)
        self.project.refresh_from_db()
        run2 = Run.objects.create(project=self.project, kind='blueprint', status='completed', request_key='bad-blueprint', context_hash=fingerprint(self.project), result={'proposal': {'setup': {}, 'blueprint': '不应保留', 'style': '', 'entities': [{'kind': 'invalid', 'name': '错误候选'}]}})
        response = self.client.post(self.url(f'runs/{run2.pk}/blueprint/'), {}, format='json')
        self.assertEqual(response.status_code, 400);self.project.refresh_from_db();self.assertEqual(self.project.blueprint, '完整主线')

    def test_snapshot_integrity_local_jobs_and_durable_ids(self):
        revision = self.adopted();self.chapter = publish(self.chapter, revision.pk)
        data = self.snapshot();meta = metadata(data);validate(data, meta)
        broken = [row for row in data if row['model'] != 'novel.revision']
        with self.assertRaises(SyncError):validate(broken, meta)
        with self.assertRaises(SyncError):validate(broken, metadata(broken))
        local = data + [{'model': 'novel.job', 'pk': 'local', 'fields': {}}]
        with self.assertRaises(SyncError):validate(local, metadata(local))
        self.assertIn('novel', SyncManager.TARGET_APPS)
        from system_settings.sync_state import should_track, LOCAL_ONLY_MODEL_LABELS
        self.assertTrue(should_track(Revision));self.assertIn('novel.job', LOCAL_ONLY_MODEL_LABELS)

    def test_snapshot_restore_does_not_call_ai(self):
        self.adopted();run = queue(self.project, {'kind': 'chat', 'request_key': 'sync-stop-run'})
        with patch('novel.worker.dispatch') as provider:reset_execution();provider.assert_not_called()
        run.refresh_from_db();self.assertEqual(run.status, 'interrupted');self.assertFalse(Job.objects.exists())

    def test_full_snapshot_apply_order(self):
        revision = self.adopted();self.chapter = publish(self.chapter, revision.pk)
        data = self.snapshot();meta = metadata(data)
        SyncManager().apply_snapshot_data(data, remote_meta=meta, full_overwrite=False)
        self.chapter.refresh_from_db();self.assertEqual(self.chapter.published_id, revision.pk)
        self.assertEqual(self.guest.get(self.url('read/')).status_code, 200)

    def test_vector_hits_are_filtered_by_adopted_version_and_keyword_fallback(self):
        from unittest.mock import Mock
        from .retrieval import retrieve, index_revision
        old = self.adopted('江宁的旧剧情。')
        new = self.adopted('江宁的新剧情。')
        later = Chapter.objects.create(project=self.project, title='次章', outline='江宁出发', position=2)
        col = Mock()
        col.query.return_value = {'documents': [['旧版本不得出现', '新版本有效']], 'metadatas': [[{'revision_id': old.pk}, {'revision_id': new.pk}]]}
        with patch('novel.retrieval.collection', return_value=col), patch('novel.retrieval.embeddings', return_value=[[.1, .2]]):
            hits, mode = retrieve(self.project, later, '江宁')
        self.assertEqual(hits, [{'revision_id': new.pk, 'quote': '新版本有效'}]);self.assertIn('向量', mode)
        col.query.side_effect = RuntimeError('index unavailable')
        with patch('novel.retrieval.collection', return_value=col), patch('novel.retrieval.embeddings', return_value=[[.1, .2]]):
            hits, mode = retrieve(self.project, later, '江宁')
        self.assertEqual(hits[0]['revision_id'], new.pk);self.assertIn('关键词', mode)
        col.get.return_value = {'ids': []}
        with patch('novel.retrieval.collection', return_value=col), patch('novel.retrieval.embeddings', side_effect=RuntimeError('index failed')):
            with self.assertRaises(RuntimeError):index_revision(new)
        self.chapter.refresh_from_db();self.assertEqual(self.chapter.adopted_id, new.pk)

    def test_three_way_merge_retains_both_device_versions(self):
        from copy import deepcopy
        from system_settings.sync_state import canonical_hash
        revision = self.adopted()
        base_data = self.snapshot()
        def manifest(data, device, instant):
            return {f"{r['model']}:{r['pk']}": {'model': r['model'], 'pk': str(r['pk']), 'hash': canonical_hash(r['fields']), 'deleted': False, 'changed_at': instant, 'origin_device': device} for r in data}
        base_revs = manifest(base_data, 'base', '2026-10-01T00:00:00Z')
        local, remote = deepcopy(base_data), deepcopy(base_data)
        base_revision = next(r for r in base_data if r['model'] == 'novel.revision')
        for data, rid, body in [(local, 'device-local-version', '江宁在本机的草稿。'), (remote, 'device-remote-version', '江宁在远端的草稿。')]:
            row = deepcopy(base_revision);row['pk'] = rid;row['fields']['content'] = body
            import hashlib
            row['fields']['content_hash'] = hashlib.sha256(body.encode()).hexdigest();data.append(row)
            next(r for r in data if r['model'] == 'novel.chapter')['fields']['draft_id'] = rid
        local_revs = {**base_revs, **{k: v for k, v in manifest(local, 'local', '2026-10-02T00:00:00Z').items() if k not in base_revs or v['hash'] != base_revs[k]['hash']}}
        remote_revs = {**base_revs, **{k: v for k, v in manifest(remote, 'remote', '2026-10-03T00:00:00Z').items() if k not in base_revs or v['hash'] != base_revs[k]['hash']}}
        merged, _, summary = SyncManager().merge_v2_data({'data': base_data, 'revisions': base_revs}, local, local_revs, {'data': remote, 'revisions': remote_revs, 'meta': metadata(remote)})
        validate(merged, metadata(merged))
        self.assertIn('device-local-version', {r['pk'] for r in merged});self.assertIn('device-remote-version', {r['pk'] for r in merged})
        chapter = next(r for r in merged if r['model'] == 'novel.chapter')['fields']
        self.assertEqual(chapter['draft_id'], 'device-remote-version');self.assertEqual(chapter['adopted_id'], revision.pk)
        self.assertGreater(summary['conflicts'], 0)
