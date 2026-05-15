from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from article.models import Article, Image
from .models import Anthology


class AnthologyVisibilityTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='admin', password='password')
        self.admin_token = Token.objects.create(user=self.admin)
        self.other_user = User.objects.create_user(username='reader', password='password')
        self.other_token = Token.objects.create(user=self.other_user)

        self.public_coll = Anthology.objects.create(
            coll_id='coll_public',
            title='公开文集',
            user_id='admin',
            permission='public',
            type='article',
        )
        self.private_coll = Anthology.objects.create(
            coll_id='coll_private',
            title='私密文集',
            user_id='admin',
            permission='private',
            type='article',
        )
        self.other_private_coll = Anthology.objects.create(
            coll_id='coll_other_private',
            title='他人私密文集',
            user_id=str(self.other_user.id),
            permission='private',
            type='article',
        )
        self.private_image_coll = Anthology.objects.create(
            coll_id='coll_private_image',
            title='私密图片文集',
            user_id='admin',
            permission='private',
            type='image',
        )
        self.private_article = Article.objects.create(
            article_id='art_private',
            title='私密文章',
            content='secret',
            coll_id=self.private_coll.coll_id,
        )
        self.private_image = Image.objects.create(
            image_id='img_private',
            title='私密图片',
            image_url='/media/private.png',
            coll_id=self.private_image_coll.coll_id,
        )

    def authenticate_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.admin_token.key}')

    def authenticate_other_user(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.other_token.key}')

    def response_coll_ids(self, response):
        return {item.get('collId') or item.get('coll_id') for item in response.data['data']}

    def test_anonymous_list_only_returns_public_anthologies(self):
        response = self.client.get('/api/anthology/list')

        self.assertEqual(response.status_code, 200)
        coll_ids = self.response_coll_ids(response)
        self.assertIn(self.public_coll.coll_id, coll_ids)
        self.assertNotIn(self.private_coll.coll_id, coll_ids)
        self.assertNotIn(self.other_private_coll.coll_id, coll_ids)

    def test_authenticated_admin_list_includes_own_private_anthologies(self):
        self.authenticate_admin()

        response = self.client.get('/api/anthology/list')

        self.assertEqual(response.status_code, 200)
        coll_ids = self.response_coll_ids(response)
        self.assertIn(self.public_coll.coll_id, coll_ids)
        self.assertIn(self.private_coll.coll_id, coll_ids)
        self.assertNotIn(self.other_private_coll.coll_id, coll_ids)

    def test_other_user_list_excludes_admin_private_anthologies(self):
        self.authenticate_other_user()

        response = self.client.get('/api/anthology/list')

        self.assertEqual(response.status_code, 200)
        coll_ids = self.response_coll_ids(response)
        self.assertIn(self.public_coll.coll_id, coll_ids)
        self.assertNotIn(self.private_coll.coll_id, coll_ids)
        self.assertIn(self.other_private_coll.coll_id, coll_ids)

    def test_anonymous_cannot_get_private_anthology_detail(self):
        response = self.client.get(f'/api/anthology/detail/{self.private_coll.coll_id}')

        self.assertEqual(response.status_code, 404)

    def test_anonymous_cannot_get_private_article_or_image_content(self):
        article_response = self.client.get(f'/api/article/detail/{self.private_article.article_id}')
        image_response = self.client.get(f'/api/article/image/list/{self.private_image_coll.coll_id}')

        self.assertEqual(article_response.status_code, 200)
        self.assertEqual(article_response.data['code'], 404)
        self.assertEqual(image_response.status_code, 200)
        self.assertEqual(image_response.data['code'], 404)
