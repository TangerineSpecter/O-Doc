from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from anthology.models import Anthology
from article.models import Article, Image
from prompts.agent_post_illustration import advance_agent_post_illustration, process_due_illustrations
from prompts.models import AgentPostIllustration
from system_settings.agent_task_scheduler import AgentTaskScheduler
from system_settings.grsai_images import GrsaiImageError, GrsaiImageResult
from system_settings.image_generation_options import resolve_agent_post_illustration_request
from system_settings.models import AIModel, AIProvider, Agent, MCPServer, SystemSetting
from system_settings.sync_state import LOCAL_ONLY_MODEL_LABELS
from utils.ai_service import AIService
from utils.mcp_client import call_mcp_tool, fetch_mcp_tools


class AgentIllustrationOptionTests(TestCase):
    def test_agent_illustration_is_locked_to_1k_and_falls_back_ratio(self):
        provider = AIProvider.objects.create(name='Grsai', type='Grsai', base_url='https://grsai.example/v1', api_key='key')
        model = AIModel.objects.create(provider=provider, name='nano-banana', type='image_generation')
        options, ratio, note = resolve_agent_post_illustration_request(model, '1:8')
        self.assertEqual(options, {'aspectRatio': '16:9', 'imageSize': '1K'})
        self.assertEqual(ratio, '16:9')
        self.assertIn('1:8', note)

        four_k = AIModel.objects.create(provider=provider, name='nano-banana-2-4k-cl', type='image_generation')
        with self.assertRaisesMessage(ValueError, '不支持 1K'):
            resolve_agent_post_illustration_request(four_k, '16:9')

    def test_illustration_job_stays_on_this_device(self):
        self.assertIn('prompts.agentpostillustration', LOCAL_ONLY_MODEL_LABELS)


class AgentPostIllustrationMCPTests(TestCase):
    def setUp(self):
        self.provider = AIProvider.objects.create(
            name='Grsai', type='Grsai', base_url='https://grsai.example/v1', api_key='key',
        )
        self.model = AIModel.objects.create(provider=self.provider, name='nano-banana', type='image_generation')
        SystemSetting.objects.create(
            key='system_ai_config',
            value={'defaultImageGenerationModelId': self.model.id},
        )
        self.image_server = MCPServer.objects.create(
            name='生图 MCP', source='system', enabled=True, transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/image-generation/',
        )
        self.post_server = MCPServer.objects.create(
            name='Agent 帖子 MCP', source='system', enabled=True, transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/agent-posts/',
        )
        self.agent = Agent.objects.create(name='配图作者', mcp_servers=[self.image_server.id])
        self.anthology = Anthology.objects.create(
            coll_id='coll_illust', title='Agent 文集', type='agent', user_id='admin',
        )

    def _create(self, content, **extra):
        payload = {
            'title': extra.pop('title', '今日新闻'),
            'content': content,
            'coll_id': self.anthology.coll_id,
            'category': '新闻',
            **extra,
        }
        return call_mcp_tool(self.post_server, 'create_agent_post', payload, agent=self.agent)

    def test_post_returns_before_image_generation_and_defaults_to_one(self):
        with patch('prompts.agent_post_illustration.GrsaiImageClient') as client:
            result, error_msg = self._create('第一段说明。\n\n第二段说明。')
        self.assertIsNone(error_msg)
        client.assert_not_called()
        self.assertEqual(len(result['illustrations']), 1)
        self.assertEqual(result['illustrations'][0]['status'], 'queued')
        self.assertIn('请不要声称图片已经可见', result['illustration_message'])
        post = Article.objects.get(article_id=result['post']['article_id'])
        self.assertLess(post.content.index('第一段说明'), post.content.index('odoc-illustration:'))
        self.assertLess(post.content.index('odoc-illustration:'), post.content.index('第二段说明'))
        self.assertNotIn('odoc-illustration', post.post_summary)
        self.assertEqual(AgentPostIllustration.objects.get().status, 'queued')

    def test_two_markers_are_kept_and_the_third_is_dropped(self):
        content = '\n\n'.join(
            f'段落{index}\n\n{{{{illustration ratio="1:1"}}}}\n画面{index}\n{{{{/illustration}}}}'
            for index in (1, 2, 3)
        )
        result, error_msg = self._create(content, title='两张配图')
        self.assertIsNone(error_msg)
        self.assertEqual(len(result['illustrations']), 2)
        self.assertEqual([item['aspect_ratio'] for item in result['illustrations']], ['1:1', '1:1'])
        self.assertIn('仅保留前两张', result['illustration_message'])
        post = Article.objects.get(article_id=result['post']['article_id'])
        self.assertEqual(post.content.count('odoc-illustration:'), 2)
        self.assertIn('画面3', post.content)

    def test_skip_illustration_and_unbound_agent_do_not_queue(self):
        skipped, error_msg = self._create('只有文字', skip_illustration=True)
        self.assertIsNone(error_msg)
        self.assertNotIn('illustrations', skipped)
        self.assertFalse(AgentPostIllustration.objects.exists())

        self.agent.mcp_servers = []
        self.agent.save(update_fields=['mcp_servers', 'updated_at'])
        result, error_msg = self._create(
            '开头\n\n{{illustration}}\n海边小路\n{{/illustration}}',
            title='未绑定',
        )
        self.assertIsNone(error_msg)
        self.assertIn('未绑定生图 MCP', result['illustration_message'])
        self.assertIn('海边小路', result['post']['content'])
        self.assertNotIn('odoc-illustration:', result['post']['content'])

    def test_download_failure_keeps_url_and_does_not_generate_again(self):
        result, error_msg = self._create('第一段\n\n第二段', title='待下载')
        self.assertIsNone(error_msg)
        job = AgentPostIllustration.objects.get()
        job.status = 'generating'
        job.provider_task_id = 'task-1'
        job.generating_started_at = timezone.now()
        job.save()
        image_url = 'https://cdn.example.com/generated.png'
        with patch('prompts.agent_post_illustration.GrsaiImageClient') as client, \
                patch('prompts.agent_post_illustration.save_first_grsai_illustration',
                      side_effect=GrsaiImageError('生成成功，但图片下载失败', retryable=True)):
            client.return_value.get_result.return_value = GrsaiImageResult(
                task_id='task-1', status='succeeded', image_urls=(image_url,),
            )
            advance_agent_post_illustration(job)
            job.refresh_from_db()
            self.assertEqual(job.status, 'download_pending')
            self.assertEqual(job.image_url, image_url)
            client.return_value.generate.assert_not_called()

            job.next_attempt_at = None
            job.save(update_fields=['next_attempt_at'])
            process_due_illustrations()
            client.return_value.generate.assert_not_called()
            client.return_value.get_result.assert_called_once()

        with patch('prompts.agent_post_illustration.save_first_grsai_illustration',
                   return_value={'id': 'asset123', 'image_url': '/api/assets/view/asset123'}), \
                patch('prompts.agent_post_illustration.GrsaiImageClient') as client:
            job.next_attempt_at = None
            job.save(update_fields=['next_attempt_at'])
            process_due_illustrations(now=timezone.now() + timedelta(hours=1))
            client.assert_not_called()
        job.refresh_from_db()
        post = Article.objects.get(article_id=job.article_id)
        self.assertEqual(job.status, 'succeeded')
        self.assertIn('/api/assets/view/asset123', post.content)
        self.assertNotIn('odoc-illustration:', post.content)

    def test_scheduler_advances_illustration_jobs(self):
        with patch('prompts.agent_post_illustration.process_due_illustrations') as process:
            AgentTaskScheduler()._advance_post_illustrations()
        process.assert_called_once()

    def test_overlapping_workers_cannot_advance_the_same_job(self):
        self._create('等待配图', title='互斥')
        job = AgentPostIllustration.objects.get()
        stale_job = AgentPostIllustration.objects.get(pk=job.pk)
        now = timezone.now()
        with patch('prompts.agent_post_illustration._advance_claimed_illustration') as advance:
            advance.side_effect = lambda *_: advance_agent_post_illustration(stale_job, now=now)
            advance_agent_post_illustration(job, now=now)
        advance.assert_called_once()

    def test_expired_worker_claim_can_be_recovered(self):
        self._create('等待配图', title='恢复认领')
        job = AgentPostIllustration.objects.get()
        now = timezone.now()
        job.next_attempt_at = now + timedelta(minutes=10)
        job.save(update_fields=['next_attempt_at'])
        with patch('prompts.agent_post_illustration._advance_claimed_illustration') as advance:
            advance_agent_post_illustration(job, now=now)
            advance.assert_not_called()
            advance_agent_post_illustration(job, now=now + timedelta(minutes=11))
            advance.assert_called_once()

    def test_unexpected_failure_releases_claim_with_backoff(self):
        self._create('等待配图', title='异常认领')
        job = AgentPostIllustration.objects.get()
        now = timezone.now()
        with patch('prompts.agent_post_illustration._advance_claimed_illustration',
                   side_effect=RuntimeError('temporary failure')):
            self.assertEqual(process_due_illustrations(now=now), 1)
        job.refresh_from_db()
        self.assertEqual(job.next_attempt_at, now + timedelta(seconds=30))


class VisionMCPTests(TestCase):
    def test_describe_image_uses_system_image_model(self):
        server = MCPServer.objects.create(
            name='识图 MCP', source='system', enabled=True, transport='streamableHttp',
            url='http://unreachable.example.invalid/api/system-mcp/vision/',
        )
        tools, error_msg = fetch_mcp_tools(server)
        self.assertIsNone(error_msg)
        self.assertEqual([tool['name'] for tool in tools], ['describe_image'])

        image = Image.objects.create(title='桥', image_url='/api/assets/view/bridge', coll_id='coll_images')
        SystemSetting.objects.create(key='system_ai_config', value={})
        with patch('article.image_service.build_image_data_url', return_value='data:image/jpeg;base64,aa'):
            result, error_msg = call_mcp_tool(server, 'describe_image', {'image_id': image.image_id})
        self.assertIsNone(result)
        self.assertIn('默认图像识别模型', error_msg)

        config = {
            'api_key': 'key', 'base_url': 'https://vision.example/v1', 'model_name': 'vision-model',
            'provider_type': 'OpenAi', 'provider_id': 'provider', 'provider_name': 'Vision',
        }
        message = SimpleNamespace(content='一座石桥')
        response = SimpleNamespace(choices=[SimpleNamespace(message=message)])
        with patch.object(AIService, 'get_default_image_client_config', return_value=config) as getter, \
                patch('utils.ai_service.OpenAI') as openai:
            openai.return_value.chat.completions.create.return_value = response
            description = AIService.describe_image_for_agent('data:image/jpeg;base64,aa')
        getter.assert_called_once()
        self.assertEqual(description, '一座石桥')
        self.assertEqual(
            openai.return_value.chat.completions.create.call_args.kwargs['model'],
            'vision-model',
        )
