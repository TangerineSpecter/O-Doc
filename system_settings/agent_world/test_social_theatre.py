import json
import time
from contextlib import contextmanager
from datetime import datetime, date
from types import SimpleNamespace
from zoneinfo import ZoneInfo
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from system_settings.models import AIModel, AIProvider, Agent, WorldActionRuntime
from .life_config import DEFAULTS as LIFE_DEFAULTS
from .life_models import LifeConfig
from .social_config import DEFAULTS as SOCIAL_DEFAULTS
from .social_models import SocialConfig, SocialEvent, SocialIntegrity, SocialTheatreEvent
from .social_relations import SocialRelation
from .social_sync import checkpoint_all, fingerprints, reconcile_social
from .social_theatre import normalize_news
from .social_theatre_prompt import turn_prompt, validate_turn
from .social_theatre_runner import (NEWS_SNAPSHOT_VERSION, _defer_or_skip, _ensure_news, _news_anchor,
                                   _schedule_times, _settle_relations,
                                   ensure_daily_events, queue_manual_event, run_event)
from .publish_search import search
from .social_theatre_views import event_list_item
from .social_theatre_decision import (prepare_topic, decide_turn, review_relations,
                                      validate_topic, validate_decision, validate_review)


class SocialTheatreContentTests(SimpleTestCase):
    def test_decision_stages_use_world_decision_routing_and_minimal_profiles(self):
        agent = SimpleNamespace(pk='a', name='甲', role_profile={'personality': '直率', 'mbti': 'ENTP',
                                                               'background': 'private-background'})
        source = {'title': '新规发布', 'summary': '主管部门发布新规。', 'url': 'https://secret.example/story'}
        topic = {'is_event': True, 'event': source['summary'], 'question': '你如何选择？',
                 'tradeoff': '外观与便利', 'evidence': source['summary']}
        intent = {'action': 'state_view', 'stance': '在意便利', 'point': '说自己的选择', 'tone': '直接'}
        outputs = iter([topic, intent, {'appraisals': []}])
        profiles = [{'id': 'a', 'name': '甲', 'personality': '直率', 'mbti': 'ENTP', 'avatar': 'private-avatar'}]
        with patch('system_settings.agent_world.social_theatre_decision.complete_json',
                   side_effect=lambda agent, prompt, validate, **kwargs: validate(next(outputs))) as model:
            prepare_topic(agent, source, owner='owner', check=lambda: None)
            decide_turn(agent, topic=topic, participants=profiles, transcript=[], owner='owner', check=lambda: None)
            review_relations(agent, topic=topic, participants=profiles, transcript=[], owner='owner', check=lambda: None)
        for call in model.call_args_list:
            self.assertTrue(call.kwargs['decision'])
            self.assertEqual(call.kwargs['owner'], 'owner')
            self.assertNotIn('private-background', call.args[1])
            self.assertNotIn('private-avatar', call.args[1])
            self.assertNotIn(source['url'], call.args[1])
            self.assertNotIn('max_tokens', call.kwargs)

    def test_directory_dates_roundups_and_explicitly_old_articles_are_rejected(self):
        now = datetime(2026, 10, 19, 15, 1, tzinfo=ZoneInfo('Asia/Shanghai'))
        rows = normalize_news([
            {'title': '每日热点早报 | 每天早上更新15–30个热点事件',
             'summary': '2026-09-042026-09-04早间新闻 今日值得关注的30件事',
             'url': 'https://news.example/daily'},
            {'title': '资讯归档', 'summary': '2026-09-042026-09-032026-09-02来源链接',
             'url': 'https://news.example/archive.html'},
            {'title': '一篇过期报道', 'summary': '这是一件具体事件。',
             'published_at': '2026-09-04T12:00:00+08:00', 'url': 'https://news.example/old'},
            {'title': '新规出台', 'summary': '主管部门发布了一项新的产品安全规定。',
             'published_at': '2026-10-19T10:00:00+08:00', 'url': 'https://news.example/story'},
        ], now=now)
        self.assertEqual([row['title'] for row in rows], ['新规出台'])

    def test_topic_requires_real_event_evidence_and_can_reject_navigation(self):
        source = {'title': '新规出台', 'summary': '主管部门发布了一项新的产品安全规定。'}
        value = {'is_event': True, 'event': '产品安全要求变化。', 'question': '你会如何选择产品？',
                 'tradeoff': '外观和使用便利', 'evidence': source['summary']}
        self.assertEqual(validate_topic(value, source)['evidence'], source['summary'])
        with self.assertRaises(ValueError):
            validate_topic({**value, 'evidence': '某公司被罚款。'}, source)
        self.assertFalse(validate_topic({'is_event': False, 'reason': '只有表头和网站导航'}, source)['is_event'])

    def test_intent_references_only_real_peer_messages_and_can_stop(self):
        chat = [{'id': 'm1', 'speaker_id': 'a', 'content': '我看重外观。'}]
        decision = {'action': 'question', 'reply_to': 'm1', 'stance': '我更看重便利',
                    'point': '追问遇到故障怎么办', 'tone': '直接'}
        self.assertEqual(validate_decision(decision, speaker_id='b', transcript=chat)['reply_to'], 'm1')
        with self.assertRaises(ValueError):
            validate_decision({**decision, 'reply_to': 'future'}, speaker_id='b', transcript=chat)
        self.assertEqual(validate_decision({'action': 'stop'}, speaker_id='b', transcript=chat)['action'], 'stop')

    def test_received_impression_requires_the_target_actual_words(self):
        participants = [{'id': 'a'}, {'id': 'b'}]
        chat = [{'id': 'a1', 'speaker_id': 'a', 'content': '你选东西也太没脑子了。'},
                {'id': 'b1', 'speaker_id': 'b', 'content': '别这样说我。'}]
        review = {'appraisals': [{'target_actor_id': 'a', 'category': 'insult',
                                  'reason': '甲直接轻视我的选择能力。', 'evidence_ids': ['a1']}]}
        result = validate_review(review, actor_id='b', participants=participants, transcript=chat)
        self.assertEqual(result['actor_id'], 'b')
        self.assertEqual(result['appraisals'][0]['target_actor_id'], 'a')
        with self.assertRaises(ValueError):
            validate_review({'appraisals': [{**review['appraisals'][0], 'evidence_ids': ['b1']}]},
                            actor_id='b', participants=participants, transcript=chat)
        self.assertEqual(validate_review({'appraisals': []}, actor_id='b',
                                        participants=participants, transcript=chat)['appraisals'], [])

    def test_news_preserves_content_and_duplicate_titles_are_removed(self):
        rows = normalize_news([
            {'title': '同一条新闻', 'summary': '事实。' * 200, 'url': 'https://news.example/a'},
            {'title': '同一条新闻！', 'summary': '重复内容。', 'url': 'https://different.example/b'},
            {'title': '另一条新闻', 'summary': '简短摘要。', 'url': 'https://news.example/c'},
        ])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['summary'], '事实。' * 200)

    def test_model_prompt_has_only_compact_news_and_minimal_profiles(self):
        participants = [
            {'id': 'a', 'name': '甲', 'personality': '直率', 'mbti': 'ENTP', 'avatar': 'avatar.png', 'prompt': 'private'},
            {'id': 'b', 'name': '乙', 'personality': '谨慎', 'mbti': 'ISFJ', 'avatar': 'avatar.png'},
        ]
        prompt = turn_prompt(speaker_id='a', round_number=1, round_count=2, participants=participants,
                             source={'title': '新闻标题', 'summary': '事实摘要', 'url': 'https://secret.example/story'},
                             transcript=[{'speaker_id': 'b', 'name': '乙', 'content': '我看到这条新闻了。'}])
        payload = json.loads(prompt.split('资料：', 1)[1])
        self.assertNotIn('https://secret.example/story', prompt)
        self.assertEqual(set(payload['participants'][0]), {'id', 'name', 'personality', 'mbti'})
        self.assertNotIn('prompt', prompt)
        self.assertNotIn('life', payload)
        self.assertNotIn('preference', payload)

    def test_complete_snippet_survives_search_history_and_model_input(self):
        snippet = '完整的新闻事实。' * 1000 + '末尾还有关键后续。'
        server = SimpleNamespace(pk='search', tools=[{'name': 'tavily_search', 'inputSchema': {
            'properties': {'query': {}, 'max_results': {'minimum': 5, 'maximum': 20},
                           'topic': {'enum': ['news', 'general']}, 'time_range': {'enum': ['day']},
                           'include_answer': {}, 'include_raw_content': {}}, 'required': ['query']}}])
        response = {'results': [
            {'title': '具体事件', 'url': 'https://news.example/story', 'content': snippet,
             'raw_content': '不应采用的整篇网页'},
            {'title': '缺少片段', 'url': 'https://news.example/empty', 'content': '',
             'raw_content': '只有网页正文'},
        ]}
        with patch('system_settings.agent_world.publish_search.search_server', return_value=server), \
             patch('system_settings.agent_world.publish_search.call_mcp_tool',
                   return_value=(response, None)) as call:
            results = search({}, '今日新闻', 'news', 1, time.monotonic() + 10,
                             time_range='day', require_news_filters=True, preserve_content=True)
            self.assertFalse(call.call_args.args[2]['include_answer'])
            self.assertFalse(call.call_args.args[2]['include_raw_content'])
            sources = normalize_news(results)
            self.assertEqual(len(sources), 1)
            self.assertEqual(sources[0]['summary'], snippet)
            legacy = search({}, '其他搜索', 'news', 1, time.monotonic() + 10)
            self.assertEqual(len(legacy[0]['summary']), 6000)
            self.assertEqual(legacy[1]['summary'], '只有网页正文')
        row = SimpleNamespace(pk='scene', business_date=date(2026, 10, 19), scheduled_at=None,
                              status='completed', error='', snapshot={}, source=sources[0],
                              participants=[], rounds=2, transcript=[])
        detail = event_list_item(row, detail=True)
        self.assertEqual(detail['source']['summary'], snippet)
        prompt = turn_prompt(speaker_id='a', round_number=1, round_count=2,
                             participants=[{'id': 'a', 'name': '甲'}],
                             source=detail['source'], transcript=[])
        payload = json.loads(prompt.split('资料：', 1)[1])
        self.assertEqual(payload['news']['summary'], snippet)
        self.assertNotIn(sources[0]['url'], prompt)

    def test_new_snippet_batch_takes_priority_over_old_truncated_retry(self):
        old = SimpleNamespace(snapshot={'manual': True, 'manual_news_retry': True, 'version': 1})
        current = SimpleNamespace(snapshot={'manual': True, 'manual_news_retry': True,
                                            'version': NEWS_SNAPSHOT_VERSION})
        self.assertIs(_news_anchor([old, current]), current)


class SocialTheatreTests(TestCase):
    def test_manual_trigger_can_retry_version_three_topic_failure_only_once(self):
        now = datetime(2026, 10, 20, 12, tzinfo=ZoneInfo('Asia/Shanghai'))
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        for succeeds in (True, False):
            owner = f'topic-upgrade-{succeeds}'
            with self.subTest(succeeds=succeeds):
                LifeConfig.objects.create(id=owner, migrated=True, settings={
                    **LIFE_DEFAULTS, 'active_start': '09:00', 'active_end': '18:00'})
                config = SocialConfig.objects.create(id=owner, settings={
                    **SOCIAL_DEFAULTS, 'enabled': True, 'theatre_daily_count': 0,
                    'theatre_search_server_id': 'search', 'agent_ids': ['a', 'b', 'c']})
                old = SocialTheatreEvent.objects.create(
                    id=owner, owner_id=owner, business_date=now.date(), slot_index=3,
                    scheduled_at=now, status='skipped', search_state='failed',
                    error='新闻搜索失败：Tavily MCP 工具定义不支持 topic=news，请在 MCP 设置中刷新工具定义',
                    snapshot={'manual': True, 'manual_news_retry': True, 'version': 3})
                residents = [SimpleNamespace(pk=identity) for identity in ('a', 'b', 'c')]
                with patch('system_settings.agent_world.social_theatre_runner.configured_residents',
                           return_value=residents), \
                     patch('system_settings.agent_world.publish_search.search', return_value=[{
                         'title': '新产品发布', 'summary': '公司正式发布新产品。',
                         'url': 'https://news.example/new-product'}],
                         side_effect=None if succeeds else ValueError('测试搜索失败')) as query:
                    first = queue_manual_event(config, now)
                    self.assertEqual(first.search_state, 'pending')
                    self.assertEqual(first.snapshot['version'], NEWS_SNAPSHOT_VERSION)
                    self.assertIs(_news_anchor([old, first]), first)
                    self.assertEqual(_ensure_news([old, first], now), succeeds)
                    first.refresh_from_db()
                    self.assertTrue(first.snapshot['manual_news_retry'])
                    if succeeds:
                        first.status = 'completed'
                        first.save()
                        second = queue_manual_event(config, now)
                        self.assertEqual(second.search_state, 'ready')
                        self.assertEqual(second.source['url'], 'https://news.example/new-product')
                    else:
                        with self.assertRaisesMessage(ValueError, '今天的手动新闻重搜也失败了'):
                            queue_manual_event(config, now)
                    query.assert_called_once()
                old.refresh_from_db()
                self.assertEqual(old.search_state, 'failed')
                self.assertEqual(old.snapshot['version'], 3)

    def test_manual_trigger_refreshes_legacy_cache_once_and_reuses_full_snippets(self):
        owner = 'snippet-upgrade-owner'
        now = datetime(2026, 10, 19, 12, tzinfo=ZoneInfo('Asia/Shanghai'))
        LifeConfig.objects.create(id=owner, migrated=True,
                                  settings={**LIFE_DEFAULTS, 'active_start': '09:00', 'active_end': '18:00'})
        config = SocialConfig.objects.create(id=owner, settings={
            **SOCIAL_DEFAULTS, 'enabled': True, 'theatre_daily_count': 0,
            'theatre_search_server_id': 'search', 'agent_ids': ['a', 'b', 'c']})
        WorldActionRuntime.objects.create(pk='world', enabled=True)
        old = SocialTheatreEvent.objects.create(
            id='legacy-snippet', owner_id=owner, business_date=now.date(), slot_index=3,
            scheduled_at=now, status='completed', search_state='ready',
            snapshot={'manual': True, 'manual_news_retry': True, 'version': 1},
            search_batch=[{'title': '旧新闻', 'summary': '已截短的片段', 'url': 'https://news.example/old'}])
        snippet = '新闻完整内容。' * 1000 + '关键后续。'
        residents = [SimpleNamespace(pk=identity) for identity in ('a', 'b', 'c')]
        with patch('system_settings.agent_world.social_theatre_runner.configured_residents',
                   return_value=residents), \
             patch('system_settings.agent_world.publish_search.search', return_value=[{
                 'title': '新新闻', 'summary': snippet, 'url': 'https://news.example/current'}]) as query:
            first = queue_manual_event(config, now)
            self.assertEqual(first.search_state, 'pending')
            self.assertTrue(first.snapshot['manual_news_retry'])
            self.assertIs(_news_anchor([old, first]), first)
            self.assertTrue(_ensure_news([old, first], now))
            first.refresh_from_db()
            self.assertEqual(first.source['summary'], snippet)
            first.status = 'completed'
            first.save()
            second = queue_manual_event(config, now)
            self.assertEqual(second.search_state, 'ready')
            self.assertEqual(second.source['summary'], snippet)
            self.assertEqual(query.call_count, 1)
            self.assertTrue(query.call_args.kwargs['preserve_content'])
        old.refresh_from_db()
        self.assertEqual(old.status, 'completed')
        self.assertEqual(old.search_batch[0]['summary'], '已截短的片段')

    def test_turn_requires_a_participant_target_and_discards_untargeted_appraisal(self):
        participants = [{'id': 'a'}, {'id': 'b'}]
        neutral = validate_turn({'content': '这条新闻确实值得关注。', 'appraisal': {'category': 'insult'}},
                                speaker_id='a', participants=participants)
        self.assertEqual(neutral['target_actor_id'], '')
        self.assertEqual(neutral['appraisal'], {})
        with self.assertRaises(ValueError):
            validate_turn({'content': '你说得不对。', 'target_actor_id': 'unknown',
                           'appraisal': {'category': 'insult', 'reason': '冒犯'}},
                          speaker_id='a', participants=participants)

    def test_schedule_is_randomized_within_active_window_and_idempotently_seeded(self):
        zone = ZoneInfo('Asia/Shanghai')
        start = datetime(2026, 10, 19, 9, 0, tzinfo=zone)
        end = datetime(2026, 10, 19, 21, 0, tzinfo=zone)
        now = datetime(2026, 10, 19, 8, 0, tzinfo=zone)
        first = _schedule_times('owner', date(2026, 10, 19), 3, start, end, now)
        second = _schedule_times('owner', date(2026, 10, 19), 3, start, end, now)
        self.assertEqual(first, second)
        self.assertEqual(len(first), 3)
        self.assertTrue(all(start <= point < end for point in first))
        self.assertTrue(all((right - left).total_seconds() >= 600 for left, right in zip(first, first[1:])))

    def test_daily_schedule_creation_is_idempotent_and_obeys_configured_count(self):
        owner = 'schedule-owner'
        life = LifeConfig.objects.create(id=owner, migrated=True,
            settings={**LIFE_DEFAULTS, 'active_start': '00:00', 'active_end': '24:00'})
        config = SocialConfig.objects.create(id=owner, settings={**SOCIAL_DEFAULTS, 'enabled': True,
            'agent_ids': ['a', 'b', 'c'], 'theatre_daily_count': 2})
        now = datetime.now(ZoneInfo('Asia/Shanghai')).replace(hour=12, minute=0, second=0, microsecond=0)
        residents = [SimpleNamespace(pk=actor) for actor in ('a', 'b', 'c')]
        with patch('system_settings.agent_world.social_theatre_runner.configured_residents', return_value=residents) as select:
            first = ensure_daily_events(config, life, now)
            second = ensure_daily_events(config, life, now)
        self.assertEqual(len(first), 2)
        self.assertEqual([row.pk for row in first], [row.pk for row in second])
        self.assertEqual(SocialTheatreEvent.objects.filter(owner_id=owner, business_date=now.date()).count(), 2)
        select.assert_called_once()

    def test_tavily_search_runs_once_and_assigns_distinct_news_to_slots(self):
        now = datetime.now(ZoneInfo('Asia/Shanghai'))
        rows = [SocialTheatreEvent.objects.create(id=f'search-{index}', owner_id='search-owner',
            business_date=now.date(), slot_index=index, scheduled_at=now,
            status='scheduled', snapshot={'search_server_id': 'server'}) for index in range(3)]
        results = [{'title': f'新闻{index}', 'summary': f'事实摘要{index}', 'url': f'https://news.example/{index}'}
                   for index in range(3)]
        with patch('system_settings.agent_world.publish_search.search', return_value=results) as search:
            self.assertTrue(_ensure_news(rows, now))
            fresh = list(SocialTheatreEvent.objects.filter(owner_id='search-owner').order_by('slot_index'))
            self.assertTrue(_ensure_news(fresh, now))
        self.assertEqual(search.call_count, 1)
        self.assertEqual(search.call_args.kwargs['max_results'], 10)
        self.assertEqual([row.source['url'] for row in fresh], [row['url'] for row in results])

    def test_busy_scene_is_deferred_within_window_then_skipped_after_close(self):
        owner = 'busy-owner'
        life = LifeConfig.objects.create(id=owner, migrated=True,
            settings={**LIFE_DEFAULTS, 'active_start': '09:00', 'active_end': '18:00'})
        now = datetime.now(ZoneInfo('Asia/Shanghai')).replace(hour=12, minute=0, second=0, microsecond=0)
        event = SocialTheatreEvent.objects.create(id='busy-scene', owner_id=owner, business_date=now.date(),
            slot_index=0, scheduled_at=now, status='scheduled')
        _defer_or_skip(event, now, '参与居民正在忙碌')
        event.refresh_from_db()
        self.assertEqual(event.status, 'scheduled')
        self.assertGreaterEqual((event.scheduled_at - now.replace(tzinfo=None)).total_seconds(), 600)
        near_close = now.replace(hour=17, minute=55)
        _defer_or_skip(event, near_close, '参与居民正在忙碌')
        event.refresh_from_db()
        self.assertEqual(event.status, 'skipped')

    def test_round_robin_scene_persists_one_short_turn_per_agent_per_round(self):
        owner = 'scene-owner'
        residents = [Agent.objects.create(name=f'群聊居民{i}', role_profile={'personality': '直率', 'mbti': 'ENTP'})
                     for i in range(3)]
        config = SocialConfig(id=owner, settings={'enabled': True, 'agent_ids': [agent.pk for agent in residents]})
        now = datetime.now(ZoneInfo('Asia/Shanghai'))
        event = SocialTheatreEvent.objects.create(id='round-robin', owner_id=owner, business_date=now.date(),
            slot_index=0, scheduled_at=now, status='scheduled',
            source={'title': '一条新闻', 'summary': '事实摘要', 'url': 'https://secret.example/story'})

        @contextmanager
        def lease(*args, **kwargs):
            yield 'lease-token'

        def fake_complete(agent, prompt, validate, **kwargs):
            payload = json.loads(prompt.split('资料：', 1)[1])
            self.assertNotIn('https://secret.example/story', prompt)
            self.assertEqual(payload['speaker_id'], agent.pk)
            return validate({'content': f'我觉得这件事值得继续关注。', 'target_actor_id': ''})

        with patch('system_settings.agent_world.social_theatre_runner.execution_lease', side_effect=lease), \
             patch('system_settings.agent_world.social_theatre_runner._turn_check'), \
             patch('system_settings.agent_world.social_theatre_scene.prepare_topic', return_value={
                 'is_event': True, 'event': '事实摘要', 'question': '你如何选择？',
                 'tradeoff': '各人关注点不同', 'evidence': '事实摘要'}), \
             patch('system_settings.agent_world.social_theatre_scene.decide_turn', return_value={
                 'action': 'state_view', 'reply_to': '', 'stance': '独立判断', 'point': '具体看法', 'tone': '自然'}), \
             patch('system_settings.agent_world.social_theatre_scene.review_relations',
                   side_effect=lambda agent, **kwargs: {'actor_id': agent.pk, 'appraisals': []}), \
             patch('system_settings.decision.routing.complete_json', side_effect=fake_complete):
            run_event(config, event, residents, now)
        event.refresh_from_db()
        self.assertEqual(event.status, 'completed', event.error)
        self.assertIn(len(event.participants), (2, 3))
        self.assertIn(event.rounds, (2, 3))
        self.assertEqual(len(event.transcript), len(event.participants) * event.rounds)
        for round_number in range(1, event.rounds + 1):
            turns = [row for row in event.transcript if row['round'] == round_number]
            self.assertEqual({row['speaker_id'] for row in turns}, {row['id'] for row in event.participants})
        self.assertIn('topic', event.snapshot)
        self.assertEqual(len(event.snapshot['relation_reviews']), len(event.participants))

    def test_model_only_routing_does_not_add_system_fallback(self):
        provider = AIProvider.objects.create(name='fixture', type='OpenAi', base_url='https://invalid.local')
        own_model = AIModel.objects.create(name='resident-model', type='chat', provider=provider)
        default_model = AIModel.objects.create(name='system-default', type='chat', provider=provider)
        from system_settings.decision.routing import candidates
        agent = SimpleNamespace(model_id=own_model.pk)
        self.assertEqual(candidates(agent, model_only=True), [own_model.pk])
        self.assertNotEqual(own_model.pk, default_model.pk)

    def test_only_explicit_personal_interaction_changes_a_relation_once_per_direction(self):
        first = Agent.objects.create(name='甲')
        second = Agent.objects.create(name='乙')
        event = SocialTheatreEvent.objects.create(id='theatre-test', owner_id='admin',
            business_date=date(2026, 10, 19), slot_index=0, scheduled_at=datetime(2026, 10, 19, 12, tzinfo=ZoneInfo('Asia/Shanghai')),
            status='completed', participants=[{'id': first.pk, 'name': first.name}, {'id': second.pk, 'name': second.name}],
            transcript=[
                {'speaker_id': first.pk, 'content': '我不同意这条新闻里的观点。'},
                {'speaker_id': first.pk, 'target_actor_id': second.pk,
                 'appraisal': {'category': 'insult', 'reason': '直接嘲讽乙本人。'}},
                {'speaker_id': first.pk, 'target_actor_id': second.pk,
                 'appraisal': {'category': 'help', 'reason': '之后又提供帮助。'}},
            ])
        _settle_relations(event)
        relation = SocialRelation.objects.get(owner_id='admin', actor_id=first.pk, counterpart_id=f'agent-id:{second.pk}')
        self.assertEqual(relation.affinity, -8)
        self.assertEqual(SocialEvent.objects.filter(owner_id='admin').count(), 1)

    def test_history_api_is_account_isolated_and_detail_includes_source_and_turns(self):
        user = User.objects.create_superuser(username='admin', password='test')
        event = SocialTheatreEvent.objects.create(id='theatre-api', owner_id='admin',
            business_date=date(2026, 10, 19), slot_index=0, scheduled_at=datetime(2026, 10, 19, 12, tzinfo=ZoneInfo('Asia/Shanghai')),
            status='completed', source={'title': '新闻', 'summary': '摘要', 'url': 'https://news.example/a'},
            participants=[{'id': 'resident', 'name': '居民', 'avatar': '🙂'}],
            rounds=2, transcript=[{'round': 1, 'speaker_id': 'resident', 'name': '居民', 'avatar': '🙂', 'content': '我看到了。'}])
        client = APIClient()
        client.force_authenticate(user)
        response = client.get('/api/settings/agent-world/social/discussions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data']['items'][0]['id'], event.pk)
        detail = client.get(f'/api/settings/agent-world/social/discussions/{event.pk}/')
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()['data']['source']['url'], 'https://news.example/a')
        self.assertEqual(detail.json()['data']['transcript'][0]['content'], '我看到了。')

        other = User.objects.create_user(username='other', password='test')
        client.force_authenticate(other)
        listing = client.get('/api/settings/agent-world/social/discussions/')
        self.assertEqual(listing.json()['data']['items'], [])
        hidden = client.get(f'/api/settings/agent-world/social/discussions/{event.pk}/')
        self.assertEqual(hidden.status_code, 404)

    def test_social_integrity_covers_theatre_and_upgrades_verified_v1(self):
        event = SocialTheatreEvent.objects.create(id='theatre-sync', owner_id='admin',
            business_date=date(2026, 10, 19), slot_index=0, scheduled_at=datetime(2026, 10, 19, 12, tzinfo=ZoneInfo('Asia/Shanghai')),
            source={'title': '新聞'}, status='skipped')
        checkpoint_all()
        integrity = SocialIntegrity.objects.get(pk='admin')
        self.assertEqual(integrity.version, 2)

        self.assertIn('SocialTheatreEvent', integrity.hashes)
        reconcile_social()
        event.source = {'title': '被改写'}
        event.save()
        from utils.sync_manager import SyncError
        with self.assertRaises(SyncError):
            reconcile_social()

        event.delete()
        integrity.hashes = fingerprints('admin', include_theatre=False)
        integrity.version = 1
        integrity.save()
        reconcile_social()
        integrity.refresh_from_db()
        self.assertEqual(integrity.version, 2)


class SocialTheatrePipelineTests(TestCase):
    def setUp(self):
        self.owner = 'pipeline-owner'
        self.agents = [Agent.objects.create(name=name) for name in ('甲', '乙')]
        self.config = SocialConfig(id=self.owner, settings={'enabled': True})
        self.now = datetime.now(ZoneInfo('Asia/Shanghai'))
        self.event = SocialTheatreEvent.objects.create(
            id='pipeline-scene', owner_id=self.owner, business_date=self.now.date(), slot_index=0,
            scheduled_at=self.now, search_state='ready', snapshot={'version': NEWS_SNAPSHOT_VERSION},
            source={'title': '一件具体事件', 'summary': '产品新规已经发布。', 'url': 'https://news.example/story'})
        self.topic = {'is_event': True, 'event': '产品新规已经发布。', 'question': '你买东西更看重什么？',
                      'tradeoff': '外观与实用', 'evidence': '产品新规已经发布。'}
        self.intent = {'action': 'state_view', 'reply_to': '', 'stance': '在意实用', 'point': '说出自己的选择', 'tone': '直接'}
        self.patches = [
            patch('system_settings.agent_world.social_theatre_runner.execution_lease', self.lease),
            patch('system_settings.agent_world.social_theatre_runner._turn_check'),
            patch('system_settings.agent_world.social_theatre_scene.prepare_topic', return_value=self.topic),
            patch('system_settings.agent_world.social_theatre_scene.decide_turn', return_value=self.intent),
            patch('system_settings.agent_world.social_theatre_scene.review_relations', side_effect=self.no_review),
            patch('system_settings.agent_world.social_theatre_runner._complete_turn', side_effect=self.speak),
        ]
        self.mocks = [self.enterContext(item) for item in self.patches]

    @staticmethod
    @contextmanager
    def lease(*args, **kwargs):
        yield 'lease-token'

    @staticmethod
    def no_review(agent, **kwargs):
        return {'actor_id': agent.pk, 'appraisals': []}

    @staticmethod
    def speak(agent, prompt, validate, **kwargs):
        return validate({'content': f'{agent.name}表达自己的看法。'})

    def run_scene(self):
        run_event(self.config, self.event, self.agents, self.now)
        self.event.refresh_from_db()

    def test_rejects_headers_and_tries_next_source_before_any_expression(self):
        second = {'title': '实际报道', 'summary': '产品新规已经发布。', 'url': 'https://news.example/real'}
        self.event.search_batch = [second]
        self.event.save()
        self.mocks[2].side_effect = [{'is_event': False, 'reason': '只有网站导航和表头'}, self.topic]
        self.mocks[3].return_value = {'action': 'stop', 'reply_to': '', 'stance': '', 'point': '', 'tone': ''}
        self.run_scene()
        self.assertEqual(self.event.status, 'completed', self.event.error)
        self.assertEqual(self.event.source['url'], second['url'])
        self.assertEqual(self.event.transcript, [])
        self.assertEqual(len(self.event.snapshot['news_rejections']), 1)
        self.assertEqual(len(self.event.snapshot['decisions']), len(self.agents))
        self.mocks[4].assert_not_called()
        self.mocks[5].assert_not_called()

    def test_no_factual_event_skips_without_inventing_discussion(self):
        self.mocks[2].return_value = {'is_event': False, 'reason': '只有新闻日期目录'}
        self.run_scene()
        self.assertEqual(self.event.status, 'skipped')
        self.assertEqual(self.event.source, {})
        self.assertEqual(self.event.transcript, [])
        self.mocks[3].assert_not_called()
        self.mocks[5].assert_not_called()

    def test_each_receiver_updates_their_own_direction_and_history_shows_real_deltas(self):
        sender, receiver = self.agents

        def speak(agent, prompt, validate, **kwargs):
            return validate({'content': '你选东西也太没脑子了。' if agent.pk == sender.pk else '别这样说我。'})

        def review(agent, **kwargs):
            if agent.pk != receiver.pk:
                return self.no_review(agent)
            evidence = next(row['id'] for row in kwargs['transcript'] if row['speaker_id'] == sender.pk)
            return {'actor_id': receiver.pk, 'appraisals': [{'target_actor_id': sender.pk,
                    'category': 'insult', 'reason': '甲嘲讽我的选择。', 'evidence_ids': [evidence]}]}

        self.mocks[4].side_effect = review
        self.mocks[5].side_effect = speak
        self.run_scene()
        self.assertEqual(self.event.status, 'completed', self.event.error)
        relation = SocialRelation.objects.get(owner_id=self.owner)
        self.assertEqual((relation.actor_id, relation.counterpart_id), (receiver.pk, f'agent-id:{sender.pk}'))
        self.assertEqual(relation.affinity, -8)
        detail = event_list_item(self.event, detail=True)
        self.assertEqual(detail['topic']['question'], self.topic['question'])
        self.assertEqual(detail['relation_changes'][0]['affinity_delta'], -8)
        self.assertEqual(detail['relation_changes'][0]['actor_name'], receiver.name)
        from django.core import serializers
        restored = next(serializers.deserialize('json', serializers.serialize('json', [self.event]))).object
        self.assertEqual(restored.snapshot, self.event.snapshot)
        self.assertEqual(restored.transcript, self.event.transcript)

    def test_stop_skips_expression_without_creating_a_fake_chat_bubble(self):
        silent = self.agents[0]
        self.mocks[3].side_effect = lambda agent, **kwargs: (
            {'action': 'stop', 'reply_to': '', 'stance': '', 'point': '', 'tone': ''}
            if agent.pk == silent.pk else self.intent)
        self.run_scene()
        self.assertEqual(self.event.status, 'completed', self.event.error)
        self.assertTrue(self.event.transcript)
        self.assertTrue(all(row['speaker_id'] != silent.pk for row in self.event.transcript))
        self.assertEqual(self.mocks[5].call_count, len(self.event.transcript))

    def test_review_failure_does_not_partially_change_relationships(self):
        calls = []

        def review(agent, **kwargs):
            calls.append(agent.pk)
            if len(calls) >= 2:
                raise TimeoutError('关系评价服务超时')
            peer = next(other for other in self.agents if other.pk != agent.pk)
            evidence = next(row['id'] for row in kwargs['transcript'] if row['speaker_id'] == peer.pk)
            return {'actor_id': agent.pk, 'appraisals': [{'target_actor_id': peer.pk,
                    'category': 'agreement', 'reason': '对方理解了我的顾虑。', 'evidence_ids': [evidence]}]}

        self.mocks[4].side_effect = review
        with self.assertLogs('system_settings.agent_world.social_theatre_runner', level='ERROR'):
            self.run_scene()
        self.assertEqual(self.event.status, 'failed')
        self.assertTrue(self.event.transcript)
        self.assertEqual(len(self.event.snapshot['relation_reviews']), 1)
        self.assertFalse(SocialEvent.objects.filter(owner_id=self.owner).exists())
        self.assertFalse(SocialRelation.objects.filter(owner_id=self.owner).exists())
