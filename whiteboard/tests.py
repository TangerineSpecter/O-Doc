from django.test import TestCase

from system_settings.models import SyncEntityState
from utils.sync_manager import SyncManager
from .models import Whiteboard
from .serializers import WhiteboardSerializer


class WhiteboardApiTests(TestCase):
    def payload(self, **overrides):
        data = {
            'title': '研究计划',
            'description': '秋季整理',
            'nodes': [{'id': 'node-1', 'type': 'note', 'x': 1, 'y': 2}],
            'edges': [],
            'viewOffset': {'x': 80, 'y': 80},
            'scale': 1,
        }
        data.update(overrides)
        return data

    def test_crud_uses_current_business_user_and_tracks_sync_revision(self):
        created = self.client.post('/api/whiteboard/create', self.payload(), content_type='application/json')
        self.assertEqual(created.status_code, 200)
        document = created.json()['data']
        whiteboard = Whiteboard.objects.get(id=document['id'])
        self.assertEqual(whiteboard.user_id, 'admin')
        self.assertEqual(document['viewOffset'], {'x': 80, 'y': 80})
        self.assertTrue(SyncEntityState.objects.filter(model_label='whiteboard.whiteboard', object_pk=document['id']).exists())

        updated = self.client.put(
            f"/api/whiteboard/update/{document['id']}",
            self.payload(title='已更新', nodes=[{'id': 'node-2', 'type': 'text', 'x': 3, 'y': 4}]),
            content_type='application/json',
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()['data']['title'], '已更新')

        deleted = self.client.delete(f"/api/whiteboard/delete/{document['id']}")
        self.assertEqual(deleted.status_code, 200)
        self.assertFalse(Whiteboard.objects.get(id=document['id']).is_valid)

    def test_legacy_import_keeps_source_timestamps_and_is_idempotent(self):
        response = self.client.post('/api/whiteboard/import_legacy', {
            'documents': [self.payload(
                id='wb-legacy-1',
                createdAt=1710000000000,
                updatedAt=1710003600000,
            )],
        }, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['importedCount'], 1)
        imported = Whiteboard.objects.get(id='wb-legacy-1')
        self.assertEqual(imported.created_at.timestamp(), 1710000000)
        self.assertEqual(imported.updated_at.timestamp(), 1710003600)
        self.assertFalse(SyncEntityState.objects.filter(
            model_label='whiteboard.whiteboard', object_pk='wb-legacy-1',
        ).exists())

        repeated = self.client.post('/api/whiteboard/import_legacy', {
            'documents': [self.payload(id='wb-legacy-1', title='不应覆盖')],
        }, content_type='application/json')
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json()['data']['importedCount'], 0)
        self.assertEqual(Whiteboard.objects.get(id='wb-legacy-1').title, '研究计划')

    def test_partial_updates_only_write_fields_present_in_each_request(self):
        whiteboard = Whiteboard.objects.create(
            title='并发测试',
            nodes=[{'id': 'old-node'}],
            insights={'messages': []},
        )
        stale_canvas = Whiteboard.objects.get(pk=whiteboard.pk)
        stale_insights = Whiteboard.objects.get(pk=whiteboard.pk)

        canvas_serializer = WhiteboardSerializer(
            stale_canvas,
            data={'nodes': [{'id': 'new-node'}]},
            partial=True,
        )
        self.assertTrue(canvas_serializer.is_valid(), canvas_serializer.errors)
        canvas_serializer.save()

        insight_serializer = WhiteboardSerializer(
            stale_insights,
            data={'insights': {'messages': [{'role': 'assistant', 'content': '已保存'}]}},
            partial=True,
        )
        self.assertTrue(insight_serializer.is_valid(), insight_serializer.errors)
        insight_serializer.save()

        whiteboard.refresh_from_db()
        self.assertEqual(whiteboard.nodes, [{'id': 'new-node'}])
        self.assertEqual(whiteboard.insights['messages'][0]['content'], '已保存')

    def test_invalid_payload_returns_parameter_error_instead_of_server_error(self):
        response = self.client.post(
            '/api/whiteboard/create',
            self.payload(scale=10),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['code'], 400)
        self.assertEqual(Whiteboard.objects.count(), 0)

    def test_legacy_import_validates_every_document_before_writing(self):
        response = self.client.post('/api/whiteboard/import_legacy', {
            'documents': [
                self.payload(id='wb-valid-before-error'),
                self.payload(id=''),
            ],
        }, content_type='application/json')

        self.assertEqual(response.json()['code'], 400)
        self.assertFalse(Whiteboard.objects.filter(id='wb-valid-before-error').exists())

    def test_whiteboard_model_is_in_snapshot_export_scope(self):
        self.assertIn(Whiteboard, list(SyncManager()._iter_target_models()))
