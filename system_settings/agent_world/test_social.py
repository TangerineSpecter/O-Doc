"""社交闭环回归：隔离数据库、模拟模型与图片服务，不产生外部费用。"""
from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from anthology.models import Anthology
from article.models import Article, ArticlePostComment
from system_settings.models import Agent, WorldAction, WorldActionRuntime
from .life_models import LifeConfig, LifeProfile
from .life_config import DEFAULTS as LIFE_DEFAULTS
from .life_time import local_time
from .social_models import SocialRelation, SocialEvent, SocialInbox, SocialOpportunity, Moment
from .social_config import DEFAULTS, validate
from .social_content import publish, comment, like, delete_moment
from .social_relations import apply_event, emotion_now
from .social_discussion import user_actor, auto_reply_count
from .social_runner import run, next_opportunity
from .social_sync import checkpoint_all, reconcile_social
from .life_schedule import stable_id


class SocialTests(TestCase):
    def setUp(self):
        self.owner = 'admin'
        self.user = User.objects.create_superuser(username='admin', password='test')
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.agent = Agent.objects.create(name='猫猫', prompt='有自己的判断')
        self.other = Agent.objects.create(name='菲伦')
        LifeProfile.objects.create(id=self.agent.pk, owner_id=self.owner)
        LifeProfile.objects.create(id=self.other.pk, owner_id=self.owner)
        LifeConfig.objects.create(id=self.owner, migrated=True, settings={**LIFE_DEFAULTS, 'agent_ids': [self.agent.pk, self.other.pk]})
        from .social_models import SocialConfig
        self.config = SocialConfig.objects.create(id=self.owner, settings={**DEFAULTS, 'enabled': True, 'agent_ids': [self.agent.pk, self.other.pk], 'image_enabled': False})
        WorldActionRuntime.objects.create(id='world', enabled=True)
        self.moment = publish(self.owner, f'agent-id:{self.agent.pk}', {'name': self.agent.name}, '今天遇到一个问题。')

    def op(self, kind='idle'):
        return SocialOpportunity.objects.create(id=stable_id('op', str(SocialOpportunity.objects.count())), owner_id=self.owner,
            actor_id=self.agent.pk, business_date=local_time().date(), kind=kind, snapshot=self.config.settings)

    def test_generate_without_prompt_preserves_text_and_records_failure(self):
        self.config.settings.update(image_enabled=True, daily_moments=2)
        self.config.save()
        decision = {'action': 'publish', 'reason': '想分享', 'content': '窗边的茶。', 'image_choice': 'generate'}
        with patch('system_settings.agent_world.life_planner.ask', return_value=decision), patch('system_mcp.image_generation.image_generation_options') as options:
            run(self.op('daily'), self.agent)
        row = Moment.objects.get(content='窗边的茶。')
        self.assertEqual(row.image_state['status'], 'failed')
        self.assertEqual(row.image_state['error'], '配图提示词无效')
        options.assert_not_called()

    def test_scene_image_uses_chibi_style_without_character_references(self):
        from .social_image_prompt import encode_subject
        from .social_media import prepare_image
        value = {'action': 'publish', 'image_choice': 'generate', 'image_prompt': '窗边的一杯茶', 'image_include_actor': False}
        encode_subject(value)
        self.assertNotIn('image_include_actor', value)
        options = {'configured': True, 'model_id': 'image-model', 'supports_reference_images': False, 'agent_reference_images': {'avatar': 'avatar'}}
        with patch('system_mcp.image_generation.image_generation_options', return_value=options), patch('system_mcp.image_generation.resolve_image_model'), patch('system_settings.image_generation_options.resolve_image_generation_request'):
            prepare_image(self.moment, self.agent, {**DEFAULTS, 'image_enabled': True}, value['image_prompt'])
        self.moment.refresh_from_db()
        request = self.moment.image_state['request']
        self.assertEqual(request['reference_image_ids'], [])
        self.assertIn('Q版手绘风格', request['prompt'])
        self.assertIn('不出现居民或人物形象', request['prompt'])

    def test_character_choice_preserves_reference_roles(self):
        from .social_image_prompt import encode_subject, image_prompt
        value = {'action': 'publish', 'image_choice': 'generate', 'image_prompt': '在窗边喝茶', 'image_include_actor': True}
        encode_subject(value)
        prompt, refs = image_prompt(value['image_prompt'], {'avatar': 'face', 'full_body': 'clothes'})
        self.assertEqual(refs, ['face', 'clothes'])
        self.assertIn('参考图1用于头像身份', prompt)
        self.assertIn('参考图2用于服装', prompt)
        prompt, refs = image_prompt(value['image_prompt'], {})
        self.assertEqual(refs, [])
        self.assertIn('使用背影或剪影', prompt)

    def test_three_dimensions_and_idempotency(self):
        peer = f'agent-id:{self.other.pk}'
        for i in range(12): apply_event(self.owner, self.agent.pk, peer, f'disagree:{i}', {'category': 'disagreement', 'reason': '观点不同'})
        relation = SocialRelation.objects.get(actor_id=self.agent.pk)
        self.assertEqual(relation.affinity, 0); self.assertEqual(relation.familiarity, 24)
        self.assertEqual(emotion_now(relation.emotion)['kind'], '不满')
        apply_event(self.owner, self.agent.pk, peer, 'insult', {'category': 'insult', 'reason': '受到轻视'})
        apply_event(self.owner, self.agent.pk, peer, 'insult', {'category': 'insult', 'reason': '受到轻视'})
        relation.refresh_from_db(); self.assertEqual(relation.affinity, -8)
        self.assertEqual(SocialEvent.objects.count(), 13)
        apply_event(self.owner, self.agent.pk, peer, 'apology', {'category': 'apology', 'reason': '对方道歉并解释'})
        relation.refresh_from_db(); self.assertEqual(relation.affinity, -3)
        self.assertFalse(SocialRelation.objects.filter(actor_id=self.other.pk).exists())
        old = {**relation.emotion, 'at': (local_time()-timedelta(days=8)).isoformat()}
        self.assertEqual(emotion_now(old)['intensity'], 0)

    def test_user_comment_agent_reply_then_user_reply(self):
        first = comment(self.owner, self.moment.pk, user_actor(self.owner), {'name': '我'}, '我觉得还有另一种可能。')
        incoming = SocialInbox.objects.get(source_id=first.pk)
        self.assertEqual(incoming.target_id, f'agent-id:{self.agent.pk}')
        with patch('system_settings.agent_world.life_planner.ask', return_value={'action': 'reply', 'reason': '值得讨论', 'content': '你能具体说说吗？',
                'received_appraisal': {'category': 'disagreement', 'reason': '观点不同但值得了解'},
                'sent_appraisal': {'category': 'neutral', 'reason': '想继续了解'}}): run(self.op(), self.agent)
        incoming.refresh_from_db(); self.assertEqual(incoming.status, 'replied')
        reply = self.moment.comments.exclude(pk=first.pk).get()
        self.assertEqual(reply.parent_id, first.pk); self.assertEqual(reply.root_id, first.pk)
        self.assertTrue(SocialInbox.objects.filter(target_id=user_actor(self.owner), source_id=reply.pk).exists())
        comment(self.owner, self.moment.pk, user_actor(self.owner), {'name': '我'}, '我的理由是这个。', reply.pk)
        self.assertEqual(SocialInbox.objects.filter(target_id=f'agent-id:{self.agent.pk}', status='pending').count(), 1)
        self.assertEqual(WorldAction.objects.filter(actor_id=self.agent.pk, status='success').count(), 1)

    def test_optional_ignore_and_defer_are_not_reoffered(self):
        row = comment(self.owner, self.moment.pk, user_actor(self.owner), {'name': '我'}, '你怎么看？')
        with patch('system_settings.agent_world.life_planner.ask', return_value={'action': 'defer', 'reason': '现在想休息'}): run(self.op(), self.agent)
        incoming = SocialInbox.objects.get(source_id=row.pk)
        self.assertEqual(incoming.status, 'deferred'); self.assertGreater(incoming.available_at, timezone.now())
        incoming.status = 'pending'; incoming.available_at = timezone.now(); incoming.save()
        with patch('system_settings.agent_world.life_planner.ask', return_value={'action': 'ignore', 'reason': '不想继续'}): run(self.op(), self.agent)
        incoming.refresh_from_db(); self.assertEqual(incoming.status, 'ignored')

    def feed_activity(self, activity):
        from .daily_feed import day_events
        from rest_framework.test import APIRequestFactory
        request = APIRequestFactory().get('/')
        request.user = self.user
        events, _, _, _, _ = day_events(request, self.owner, local_time().date())
        return next(event for event in events if event['id'] == f'activity:{activity.pk}')

    def run_reply(self, content, model_id='wrong-model-id'):
        from system_settings.models import AgentActivity
        op = self.op()
        with patch('system_settings.agent_world.life_planner.ask', return_value={
                'action': 'reply', 'reason': '继续讨论', 'content': content, 'moment_id': model_id}), \
                patch('system_settings.agent_world.social_runner.local_time', return_value=local_time().replace(hour=12)):
            run(op, self.agent)
        op.refresh_from_db()
        self.assertEqual(op.status, 'completed', op.result)
        return AgentActivity.objects.get(event_key=f'social:{op.pk}')

    def test_reply_target_ignores_model_id_and_deleted_moment(self):
        first = comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '请解释')
        activity = self.run_reply('这是我的解释')
        reply = self.moment.comments.exclude(pk=first.pk).get()
        self.assertEqual(activity.artifact_kind, 'momentComment')
        self.assertEqual(activity.artifact_id, reply.pk)
        target = self.feed_activity(activity)['target']
        self.assertEqual(target['artifactId'], self.moment.pk)
        self.assertEqual(target['artifactKind'], 'moment')
        self.assertEqual(self.client.get(f"/api/settings/agent-world/moments/{target['artifactId']}/").status_code, 200)
        # 历史活动缺少评论 ID、并保存了错误动态 ID，仍按实际回复恢复。
        activity.artifact_kind = 'moment'; activity.artifact_id = 'wrong-model-id'; activity.save()
        self.assertEqual(self.feed_activity(activity)['target']['artifactId'], self.moment.pk)
        activity.refresh_from_db()
        self.assertEqual(activity.artifact_id, 'wrong-model-id')
        delete_moment(self.owner, self.moment.pk, self.moment.actor_id)
        self.assertEqual(self.feed_activity(activity)['target']['artifactId'], '')

    def test_post_reply_opens_article_instead_of_moment(self):
        coll = Anthology.objects.create(title='世界', type='agent', user_id=self.owner)
        post = Article.objects.create(title='观点', coll_id=coll.pk, agent_post_author_id=self.agent.pk, is_valid=True)
        from .comments import create_comment
        first = create_comment(post, '请解释', {'creator_id': self.owner, 'creator_name': '我'})
        activity = self.run_reply('文章回复')
        reply = ArticlePostComment.objects.get(parent_comment_id=first.pk)
        self.assertEqual(activity.artifact_kind, 'articleComment')
        target = self.feed_activity(activity)['target']
        self.assertEqual(target['artifactKind'], 'articleComment')
        self.assertEqual(target['artifactId'], reply.pk)
        self.assertEqual(target['articleId'], post.pk)
        self.assertEqual(target['collId'], coll.pk)
        activity.artifact_kind = 'moment'; activity.artifact_id = 'wrong-model-id'; activity.save()
        self.assertEqual(self.feed_activity(activity)['target'], target)

    def test_ambiguous_historical_reply_does_not_guess_target(self):
        comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '请解释')
        activity = self.run_reply('相同回复')
        from .social_models import MomentComment
        reply = self.moment.comments.get(content='相同回复')
        MomentComment.objects.create(moment=self.moment, actor_id=reply.actor_id, content=reply.content,
                                     parent_id=reply.parent_id, created_at=reply.created_at)
        # 新记录的稳定评论 ID 不受重复正文影响。
        self.assertEqual(self.feed_activity(activity)['target']['artifactId'], self.moment.pk)
        activity.artifact_kind = 'moment'; activity.artifact_id = 'wrong-model-id'; activity.save()
        self.assertEqual(self.feed_activity(activity)['target']['artifactId'], '')

    def test_invalid_and_foreign_moment_targets_are_not_exposed(self):
        from system_settings.models import AgentActivity
        self.moment.owner_id = 'another-owner'; self.moment.save()
        op = self.op('daily')
        op.result = {'action': 'read', 'likes': [self.moment.pk]}
        op.save()
        activity = AgentActivity.objects.create(event_key='social:foreign', agent=self.agent,
            activity_type='interaction', action='social_read', title='读了动态', summary='看看',
            artifact_kind='moment', artifact_id=self.moment.pk,
            metadata={'owner_id': self.owner, 'social_opportunity_id': op.pk})
        self.assertEqual(self.feed_activity(activity)['target']['artifactId'], '')

    def test_read_without_comment_drops_untrusted_model_target(self):
        from system_settings.models import AgentActivity
        other_moment = publish(self.owner, f'agent-id:{self.other.pk}', {}, '另一个动态')
        op = self.op('daily')
        with patch('system_settings.agent_world.life_planner.ask', return_value={
                'action': 'read', 'reason': '只看看', 'moment_id': self.moment.pk, 'likes': []}), \
                patch('system_settings.agent_world.social_runner.local_time', return_value=local_time().replace(hour=12)):
            run(op, self.agent)
        op.refresh_from_db()
        self.assertEqual(op.status, 'completed', op.result)
        self.assertNotIn('moment_id', op.result)
        activity = AgentActivity.objects.get(event_key=f'social:{op.pk}')
        from .daily_feed import day_events
        from rest_framework.test import APIRequestFactory
        request = APIRequestFactory().get('/')
        request.user = self.user
        all_events, events, counts, total, actor_counts = day_events(request, self.owner, local_time().date())
        self.assertNotIn(f'activity:{activity.pk}', {event['id'] for event in events})
        self.assertEqual(all_events, [])
        self.assertEqual(counts.get('interaction', 0), 0)
        self.assertEqual(total, 0)
        self.assertEqual(actor_counts, {})
        self.assertTrue(AgentActivity.objects.filter(pk=activity.pk).exists())
        # 历史点赞的 moment_id 也不能盖过真实点赞对象。
        op.result.update(moment_id=self.moment.pk, likes=[other_moment.pk]); op.save()
        self.assertEqual(self.feed_activity(activity)['target']['artifactId'], other_moment.pk)

    def test_like_toggle_cannot_farm_affinity(self):
        actor = f'agent-id:{self.other.pk}'
        for active in (True, False, True, False, True): like(self.owner, self.moment.pk, actor, {'name': '菲伦'}, active)
        self.assertEqual(SocialRelation.objects.get(actor_id=self.other.pk).affinity, 1)
        self.assertEqual(SocialEvent.objects.count(), 1)

    def test_invalid_parent_and_delete_cancel_inbox(self):
        with self.assertRaises(ValueError): comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '回复', 'missing')
        first = comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '评论')
        delete_moment(self.owner, self.moment.pk, self.moment.actor_id)
        self.assertEqual(SocialInbox.objects.get(source_id=first.pk).status, 'invalid')

    def test_graph_get_is_read_only_and_user_has_no_feelings(self):
        apply_event(self.owner, self.agent.pk, user_actor(self.owner), 'hello', {'category': 'agreement', 'reason': '欣赏这个想法'}, {'name': '我'})
        from system_settings.agent_relation import relation_graph
        before = list(SocialRelation.objects.values())
        graph = relation_graph(self.owner)
        self.assertEqual(before, list(SocialRelation.objects.values()))
        self.assertTrue(any(n.get('kind') == 'user' for n in graph['nodes']))
        self.assertTrue(graph['edges'][0]['one_way'])
        self.assertIsNone(graph['edges'][0]['target_relation'] if graph['edges'][0]['target_id'].startswith('user:') else graph['edges'][0]['source_relation'])

    def test_auto_reply_cap_and_human_reset(self):
        entries = [{'actor_id': 'agent-id:a'} for _ in range(7)]
        self.assertEqual(auto_reply_count({'entries': entries}), 6)
        entries.append({'actor_id': 'user:admin'})
        self.assertEqual(auto_reply_count({'entries': entries}), 0)

    def test_restart_does_not_repeat_committed_opportunity(self):
        self.moment.created_at = timezone.now()-timedelta(days=1); self.moment.save()
        op = self.op('daily')
        with patch('system_settings.agent_world.life_planner.ask', return_value={'action': 'publish', 'reason': '想分享', 'content': '今天发生的真实小事。'}):
            run(op, self.agent); run(op, self.agent)
        self.assertEqual(Moment.objects.count(), 2)
        self.assertEqual(WorldAction.objects.filter(pk=op.pk).count(), 1)

    def test_sync_integrity_and_local_execution_disabled(self):
        checkpoint_all(); reconcile_social()
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
        self.moment.content = '改写'; self.moment.save()
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError): reconcile_social()

    def test_api_auth_scope_and_response_contract(self):
        response = self.client.get('/api/settings/agent-world/moments/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['moments'][0]['id'], self.moment.pk)
        response = self.client.post(f'/api/settings/agent-world/moments/{self.moment.pk}/comments/', {'content': '用户评论'}, format='json')
        self.assertEqual(response.status_code, 200)
        response = self.client.post('/api/settings/agent-world/moments/', {'content': '', 'images': []}, format='json')
        self.assertEqual(response.status_code, 400)
        second = User.objects.create_user(username='other', password='test')
        self.client.force_authenticate(second)
        self.assertEqual(self.client.get(f'/api/settings/agent-world/moments/{self.moment.pk}/comments/').status_code, 404)

    def test_post_root_unique_but_replies_allowed(self):
        coll = Anthology.objects.create(title='世界', type='agent', user_id=self.owner)
        post = Article.objects.create(title='观点', coll_id=coll.pk, agent_post_author_id=self.other.pk, is_valid=True)
        from .comments import create_comment
        identity = {'creator_id': 'agent:猫猫', 'creator_name': '猫猫'}
        root = create_comment(post, '第一条', identity, self.agent)
        with self.assertRaises(ValueError): create_comment(post, '第二条根评论', identity, self.agent)
        user = create_comment(post, '不同意', {'creator_id': self.owner}, parent_comment_id=root.pk)
        reply = create_comment(post, '解释', identity, self.agent, user.pk)
        self.assertEqual(reply.root_comment_id, root.pk)
        self.assertEqual(ArticlePostComment.objects.filter(article=post).count(), 3)

    def test_config_rejects_foreign_actors_and_bad_values(self):
        with self.assertRaises(ValueError): validate(self.owner, {'agent_ids': ['missing']})
        with self.assertRaises(ValueError): validate(self.owner, {'daily_replies': True})
        with self.assertRaises(ValueError): validate(self.owner, {'reply_mode': 'instant'})

    def test_daily_quota_and_daily_only_mode(self):
        now = local_time().replace(hour=12, minute=0, second=0, microsecond=0)
        self.config.settings = {**self.config.settings, 'reply_mode': 'daily'}; self.config.save()
        comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '说说你的看法')
        self.assertIsNone(next_opportunity(self.config, self.agent, now))
        op = next_opportunity(self.config, self.agent, now.replace(hour=23, minute=50))
        self.assertEqual(op.kind, 'daily')
        self.assertEqual(next_opportunity(self.config, self.agent, now.replace(hour=23, minute=51)).pk, op.pk)

    def test_paused_actor_cannot_start_social(self):
        life = LifeConfig.objects.get(pk=self.owner); life.paused_agents = [self.agent.pk]; life.save()
        comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '你好')
        self.assertIsNone(next_opportunity(self.config, self.agent, local_time().replace(hour=23, minute=50)))

    def test_content_change_during_thinking_does_not_commit(self):
        first = comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '原评论')
        def change(*args, **kwargs):
            first.content = '修改后的评论'; first.save()
            return {'action': 'reply', 'reason': '回应', 'content': '回复原评论'}
        with patch('system_settings.agent_world.life_planner.ask', side_effect=change): run(self.op(), self.agent)
        self.assertEqual(self.moment.comments.count(), 1)
        self.assertFalse(WorldAction.objects.exists())

    def test_media_failure_preserves_text_and_unknown_submission_is_not_repeated(self):
        from .social_media import recover_image
        self.moment.image_state = {'status': 'pending', 'request': {'request_id': 'moment:test:0', 'prompt': '场景', 'reference_image_ids': []}}
        self.moment.save()
        with patch('system_mcp.image_generation_tasks.generate_image', return_value={'task_id': 'img1', 'status': 'submission_unknown', 'message': '响应丢失'}) as generate:
            recover_image(self.moment)
            self.moment.refresh_from_db()
            self.assertEqual(self.moment.content, '今天遇到一个问题。')
            self.assertEqual(self.moment.image_state['status'], 'failed')
            from .social_media import recover_images
            recover_images()
            self.assertEqual(generate.call_count, 1)

    def test_media_success_queries_same_task_and_attaches_resource(self):
        from assets.models import Asset
        from .social_media import recover_image
        Asset.objects.create(id='pic', file_size=1, file_type='image', uploader='admin')
        self.moment.image_state = {'status': 'generating', 'task_id': 'img1', 'request': {'request_id': 'moment:test:0'}}; self.moment.save()
        with patch('system_mcp.image_generation_tasks.get_image_generation_result', return_value={'task_id': 'img1', 'status': 'succeeded', 'asset_id': 'pic'}) as query, patch('system_mcp.image_generation_tasks.generate_image') as generate:
            recover_image(self.moment)
            self.assertEqual(query.call_count, 1); generate.assert_not_called()
        self.moment.refresh_from_db(); self.assertEqual(self.moment.images, ['pic'])
        self.assertEqual(self.moment.image_state['status'], 'succeeded')

    def test_migrated_scores_are_baseline_and_rebuildable(self):
        from system_settings.models import AgentAffinity
        from .social_migration import seed_legacy_relations
        from .social_relations import rebuild_relations
        AgentAffinity.objects.create(actor=self.agent, counterpart=self.other, score=65, event_count=30)
        seed_legacy_relations(self.owner)
        relation = SocialRelation.objects.get(actor_id=self.agent.pk)
        self.assertEqual(relation.affinity, 65); self.assertEqual(relation.familiarity, 60)
        self.assertEqual(relation.pk, stable_id(self.owner, self.agent.pk, f'agent-id:{self.other.pk}'))
        apply_event(self.owner, self.agent.pk, f'agent-id:{self.other.pk}', 'new', {'category': 'disagreement', 'reason': '有分歧'})
        relation.refresh_from_db(); self.assertEqual(relation.affinity, 65)
        SocialRelation.objects.all().delete(); rebuild_relations(self.owner)
        self.assertEqual(SocialRelation.objects.get(actor_id=self.agent.pk).affinity, 65)

    def test_media_failure_does_not_overwrite_new_request(self):
        from .social_media import recover_image
        self.moment.image_state = {'status': 'pending', 'request': {'request_id': 'old'}}
        self.moment.save()
        def changed(*args, **kwargs):
            Moment.objects.filter(pk=self.moment.pk).update(image_state={'status': 'pending', 'request': {'request_id': 'new'}})
            raise RuntimeError('旧请求失败')
        with patch('system_mcp.image_generation_tasks.generate_image', side_effect=changed):
            recover_image(self.moment)
        self.moment.refresh_from_db()
        self.assertEqual(self.moment.image_state['request']['request_id'], 'new')
        self.assertEqual(self.moment.image_state['status'], 'pending')

    def test_invalid_user_notifications_are_hidden(self):
        incoming = comment(self.owner, self.moment.pk, user_actor(self.owner), {}, '提问')
        comment(self.owner, self.moment.pk, f'agent-id:{self.agent.pk}', {}, '回应', incoming.pk)
        self.assertEqual(self.client.get('/api/settings/agent-world/social/inbox/').json()['data']['unread'], 1)
        delete_moment(self.owner, self.moment.pk, self.moment.actor_id)
        response = self.client.get('/api/settings/agent-world/social/inbox/').json()['data']
        self.assertEqual(response['unread'], 0); self.assertEqual(response['items'], [])

    def test_snapshot_export_and_restore_roundtrip(self):
        from utils.sync_manager import SyncManager
        from .social_models import MomentLike
        first = comment(self.owner, self.moment.pk, user_actor(self.owner), {'name': '我'}, '讨论')
        like(self.owner, self.moment.pk, user_actor(self.owner), {'name': '我'}, True)
        apply_event(self.owner, self.agent.pk, user_actor(self.owner), 'read-test', {'category': 'disagreement', 'reason': '想法不同'})
        manager = SyncManager()
        data = manager.build_snapshot_data()
        self.assertTrue(any(r['model'] == 'system_settings.socialintegrity' for r in data))
        from utils.sync_manager import SyncError
        stripped = [r for r in data if not r['model'].startswith('system_settings.social') and not r['model'].startswith('system_settings.moment')]
        with self.assertRaises(SyncError):
            manager.apply_snapshot_data(stripped, manager.build_snapshot_meta(), full_overwrite=True)
        self.moment.content = '后来被改写'; self.moment.save()
        manager.apply_snapshot_data(data, manager.build_snapshot_meta(), full_overwrite=True)
        self.moment.refresh_from_db()
        self.assertEqual(self.moment.content, '今天遇到一个问题。')
        self.assertTrue(SocialInbox.objects.filter(source_id=first.pk).exists())
        self.assertEqual(MomentLike.objects.filter(is_valid=True).count(), 1)
        self.assertEqual(SocialRelation.objects.get(actor_id=self.agent.pk).familiarity, 2)
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)

    def test_get_single_moment_and_daily_feed_backfill(self):
        # 1. 验证根据 identity 获取单条动态
        res = self.client.get(f'/api/settings/agent-world/moments/{self.moment.pk}/')
        self.assertEqual(res.status_code, 200)
        data = res.json()['data']
        self.assertEqual(data['id'], self.moment.pk)
        self.assertEqual(data['content'], self.moment.content)

        # 2. 验证不存在的动态返回 404
        not_found = self.client.get('/api/settings/agent-world/moments/non-existent-id/')
        self.assertEqual(not_found.status_code, 404)

        # 3. 验证 daily_feed 中针对历史点赞记录的 artifact 回填
        from system_settings.models import AgentActivity
        from .social_models import SocialOpportunity
        from .daily_feed import day_events, _window
        from .life_time import local_time, storage_time
        now = local_time()
        op = SocialOpportunity.objects.create(
            id='test-op-backfill', owner_id=self.owner, actor_id=self.agent.pk,
            business_date=now.date(), kind='daily', snapshot={},
            result={'action': 'read', 'likes': [self.moment.pk], 'reason': '内心OS'}
        )
        activity = AgentActivity.objects.create(
            event_key='social:test-op-backfill', agent=self.agent,
            activity_type='interaction', action='social_read', title='测试社交时间',
            summary='内心OS', occurred_at=storage_time(now),
            metadata={'owner_id': self.owner, 'social_opportunity_id': op.pk}
        )
        from rest_framework.test import APIRequestFactory
        req = APIRequestFactory().get('/')
        req.user = self.user
        events, _, _, _, _ = day_events(req, self.owner, now.date())
        matched = [e for e in events if e.get('id') == f'activity:{activity.pk}']
        self.assertEqual(len(matched), 1)
        self.assertEqual(matched[0]['target']['artifactKind'], 'moment')
        self.assertEqual(matched[0]['target']['artifactId'], self.moment.pk)
