from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from assets.models import Asset
from .models import PromptResultImage, PromptTemplate
from .rendering import render_template, validate_schema


class PromptRenderingTests(TestCase):
    def test_renders_required_select_and_preserves_normal_braces(self):
        schema = validate_schema([
            {'key': 'title', 'label': '标题', 'type': 'text', 'required': True},
            {'key': 'ratio', 'label': '比例', 'type': 'select', 'defaultValue': '3:4', 'options': [{'label': '竖版', 'value': '3:4'}]},
        ])
        rendered, values = render_template(' {{field:title}} {{field:ratio}} {{normal}} ', schema, {'title': '橘子海报'})
        self.assertEqual(rendered, '橘子海报 3:4 {{normal}}')
        self.assertEqual(values, {'title': '橘子海报', 'ratio': '3:4'})


class PromptApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('prompt-user', password='secret')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def create_template(self):
        response = self.client.post('/api/prompt/templates', {
            'title': '封面模板', 'promptType': 'image', 'positiveTemplate': '标题：{{field:title}}',
            'negativeTemplate': '无文字', 'fieldSchema': [{'key': 'title', 'label': '标题', 'type': 'text', 'required': True}],
            'themeIds': [], 'tagIds': [], 'isFavorite': False,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['data']

    def test_usage_stores_rendered_snapshot_and_protects_asset(self):
        template = self.create_template()
        user_id = self.user.profile.userid
        asset = Asset.objects.create(
            id='promptasset', name='example.png', original_name='example.png', file_type='image', file_size=1,
            file_path='image/example.png', file_extension='.png', mime_type='image/png', uploader=user_id, file_hash='a' * 32,
        )
        response = self.client.post(f"/api/prompt/templates/{template['id']}/usages", {'inputValues': {'title': '春日'}, 'assetIds': [asset.id]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        # Django's test client exposes serializer data before the camel-case
        # response renderer runs; browser clients receive `renderedPositive`.
        self.assertEqual(response.data['data']['rendered_positive'], '标题：春日')
        self.assertTrue(PromptResultImage.objects.filter(asset=asset).exists())
        self.assertEqual(Asset.objects.get(id=asset.id).source_type, 'prompt')
        self.client.delete(f'/api/prompt/templates/{template["id"]}')
        self.assertFalse(PromptTemplate.objects.get(id=template['id']).is_valid)
