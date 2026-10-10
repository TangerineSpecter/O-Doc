import json
from copy import deepcopy
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch
from django.core import serializers
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentLongTermMemory, WorldActionRuntime, AIProvider, AIModel
from system_settings.models import SyncEntityState
from ..life_models import LifeConfig, LifeProfile
from ..farm_models import AgentFarm, FarmOperation
from ..cooking_models import CookingOperation
from ..life_time import local_time
from .models import AgentMemoryState, AgentMemoryLease
from .consolidate import initialize_states, process, validate_proposals, prepare, propose
from .policy import retain, statistics, protect, meta, estimate_tokens, RECALL_TOKENS, INPUT_TOKENS
from .recall import recall, memory_context, revision, recall_scope
from .sync import metadata, validate_source, merge_aggregates
from .sources import collect
from utils.sync_manager import SyncError


class MemoryTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.day = local_time(self.now).date() - timedelta(days=1)
        provider = AIProvider.objects.create(name='memory-test', type='OpenAi', base_url='https://example.invalid')
        model = AIModel.objects.create(name='memory-test', type='chat', provider=provider)
        self.agent = Agent.objects.create(id='memory-resident', name='小厨师', model=model)
        self.other = Agent.objects.create(id='another-resident', name='其他居民', model=model)
        LifeConfig.objects.create(id='admin', settings={'agent_ids': [self.agent.pk]})
        LifeProfile.objects.create(id=self.agent.pk, owner_id='admin')
        WorldActionRuntime.objects.create(id='world', enabled=True)
        self.state = AgentMemoryState.objects.create(agent=self.agent, owner_id='admin', enabled_at=self.now - timedelta(days=2), processed_day=self.day-timedelta(days=1))
        for mock in (
            patch('utils.rag_client.RagClient.create_embeddings', return_value=[]),
            patch('utils.rag_client.RagClient.get_embedding_model', return_value=None),
        ):
            mock.start()
            self.addCleanup(mock.stop)

    def cooking(self, pk='cook-1', when=None):
        return CookingOperation.objects.create(id=pk, actor_id=self.agent.pk, owner_id='admin', actor_name=self.agent.name,
            opportunity_id='cook-op', recipe_id='baked_potato', snapshot={}, result={'stars': 3, 'experience': 12}, reason='练习做饭', created_at=when or self.now-timedelta(days=1))

    def proposal(self, source='cooking:cook-1', **kwargs):
        return {'topic': '第一次三星料理', 'memory_id': '', 'title': '做出三星料理', 'content': '我做出了三星料理，想继续练习。',
                'memory_type': 'fact', 'importance': 4, 'milestone': True, 'source_ids': [source], **kwargs}

    def auto(self, pk='world-one', **kwargs):
        return AgentLongTermMemory.objects.create(id=pk, agent=self.agent, scope='agent', title='料理经历', content='喜欢料理',
            metadata={'source': 'world', 'world_memory': {'version': 1, 'topic': pk, 'importance': 2, 'milestone': False,
            'last_supported_at': self.now.isoformat(), 'sources': []}}, **kwargs)

    def snapshot(self):
        return json.loads(serializers.serialize('json', [self.agent, self.other, *LifeConfig.objects.all(), *LifeProfile.objects.all(),
            *AgentMemoryState.objects.all(), *AgentLongTermMemory.objects.all(), *CookingOperation.objects.all()]))

    def test_success_commits_memory_and_cursor_once(self):
        self.cooking()
        with patch('system_settings.agent_world.memory.consolidate.complete', return_value=json.dumps({'memories': [self.proposal()]})) as model:
            process(self.state, self.now)
            self.state.refresh_from_db(); process(self.state, self.now)
        self.assertEqual(model.call_count, 1)
        self.assertEqual(self.state.processed_day, self.day)
        self.assertEqual(self.state.status, 'success')
        memory = AgentLongTermMemory.objects.get(agent=self.agent)
        self.assertEqual(memory.source_count, 1)
        self.assertEqual(meta(memory)['sources'][0]['id'], 'cooking:cook-1')
        self.assertFalse(model.call_args.kwargs['allow_retries'])
        validate_source(self.snapshot(), metadata(self.snapshot()))

    def test_failure_does_not_advance_and_consumes_daily_attempt(self):
        self.cooking()
        with patch('system_settings.agent_world.memory.consolidate.complete', side_effect=ValueError('invalid')) as model:
            process(self.state, self.now)
            self.state.refresh_from_db(); process(self.state, self.now)
        self.assertEqual(model.call_count, 1)
        self.assertEqual(self.state.status, 'failed')
        self.assertEqual(self.state.processed_day, self.day-timedelta(days=1))
        self.assertFalse(AgentLongTermMemory.objects.exists())

    def test_no_history_backfill(self):
        self.state.enabled_at = self.now
        self.state.processed_day = None
        self.state.save()
        self.cooking()
        with patch('system_settings.agent_world.memory.consolidate.complete') as model:
            process(self.state, self.now)
        model.assert_not_called()

    def test_empty_day_advances_without_model(self):
        with patch('system_settings.agent_world.memory.consolidate.complete') as model:
            process(self.state, self.now)
        model.assert_not_called(); self.state.refresh_from_db()
        self.assertEqual(self.state.processed_day, self.day)

    def test_pause_and_world_switch_block_model(self):
        self.cooking()
        config = LifeConfig.objects.get(pk='admin'); config.paused_agents = [self.agent.pk]; config.save()
        with patch('system_settings.agent_world.memory.consolidate.complete') as model:
            process(self.state, self.now)
        model.assert_not_called()
        config.paused_agents=[];config.save();WorldActionRuntime.objects.update(enabled=False)
        with patch('system_settings.agent_world.memory.consolidate.complete') as model:
            process(self.state, self.now)
        model.assert_not_called()

    def test_pause_during_call_discards_result(self):
        self.cooking()
        def stop(*args, **kwargs):
            WorldActionRuntime.objects.update(enabled=False)
            return json.dumps({'memories': [self.proposal()]})
        with patch('system_settings.agent_world.memory.consolidate.complete', side_effect=stop):
            process(self.state, self.now)
        self.state.refresh_from_db(); self.assertEqual(self.state.status, 'failed')
        self.assertFalse(AgentLongTermMemory.objects.exists())

    def test_edit_during_call_discards_result(self):
        self.cooking(); manual=AgentLongTermMemory.objects.create(agent=self.agent, scope='agent', content='人工经历')
        def edit(*args, **kwargs):
            manual.content='已修正';manual.save()
            return json.dumps({'memories':[self.proposal()]})
        with patch('system_settings.agent_world.memory.consolidate.complete', side_effect=edit):
            process(self.state, self.now)
        self.state.refresh_from_db();self.assertEqual(self.state.status,'failed')
        self.assertEqual(AgentLongTermMemory.objects.count(),1)

    def test_source_change_during_call_discards_result(self):
        row=self.cooking()
        def edit(*args, **kwargs):
            row.result={'stars':1};row.save()
            return json.dumps({'memories':[self.proposal()]})
        with patch('system_settings.agent_world.memory.consolidate.complete',side_effect=edit):
            process(self.state,self.now)
        self.assertFalse(AgentLongTermMemory.objects.exists())

    def test_busy_lease_does_not_consume_daily_attempt(self):
        AgentMemoryLease.objects.create(id=self.agent.pk,token='other',until=self.now+timedelta(minutes=10))
        process(self.state,self.now);self.state.refresh_from_db();self.assertIsNone(self.state.attempted_day)

    def test_invalid_or_foreign_source_rejected(self):
        self.cooking();_,_,evidence,_=prepare(self.state,self.day)
        for value in (self.proposal(source='cooking:unknown'),self.proposal(content='x'*301),self.proposal(importance=True)):
            with self.assertRaises(ValueError):validate_proposals(self.agent,[value],evidence)

    def test_preference_needs_three_distinct_days(self):
        self.cooking();_,_,evidence,_=prepare(self.state,self.day)
        proposal=self.proposal(memory_type='preference',milestone=False)
        with self.assertRaises(ValueError):validate_proposals(self.agent,[proposal],evidence)
        for n in (1,2):
            ref=deepcopy(evidence['cooking:cook-1']);ref['id']=f'cooking:older-{n}';ref['day']=str(self.day-timedelta(days=n));ref['at']=(self.now-timedelta(days=n+1)).isoformat();evidence[ref['id']]=ref
        proposal['source_ids']=list(evidence)
        self.assertEqual(len(validate_proposals(self.agent,[proposal],evidence)),1)

    def test_routine_aggregation_and_preference_observations(self):
        farm=AgentFarm.objects.create(id=self.agent.pk,owner_id='admin',actor_name=self.agent.name)
        for n in range(20):FarmOperation.objects.create(id=f'water-{n}',farm=farm,opportunity_id='watering',operation={'kind':'water'},result={},created_at=self.now-timedelta(days=1))
        batch=collect('admin',self.agent,self.day,self.state.enabled_at)
        self.assertEqual(batch['counts']['farm'],20);self.assertEqual(len(batch['groups']),1)
        self.assertFalse(batch['groups'][0]['source']['facts']['significant'])
        with patch('system_settings.agent_world.memory.consolidate.complete') as model:process(self.state,self.now)
        model.assert_not_called();self.state.refresh_from_db();self.assertEqual(len(self.state.observations),1)

    def test_auto_capacity_and_human_protection(self):
        for n in range(130):
            memory=self.auto(pk=f'auto-{n}');memory.content='甲'*300;memory.save()
        pinned=self.auto(pk='pinned',is_pinned=True)
        manual=AgentLongTermMemory.objects.create(agent=self.agent,content='人工记录'*3000)
        retain(self.agent,self.now)
        stats=statistics(self.agent)
        self.assertLessEqual(stats['active']['count'],100);self.assertLessEqual(stats['active']['characters'],10000)
        self.assertLessEqual(stats['archived']['count'],100);self.assertLessEqual(stats['archived']['characters'],10000)
        self.assertTrue(AgentLongTermMemory.objects.filter(pk=pinned.pk).exists());self.assertTrue(AgentLongTermMemory.objects.filter(pk=manual.pk).exists())

    def test_archive_expires_with_permanent_tombstone(self):
        memory=self.auto(status='archived');memory.metadata['world_memory']['archived_at']=(self.now-timedelta(days=91)).isoformat();memory.save()
        pk=memory.pk;retain(self.agent,self.now)
        self.assertFalse(AgentLongTermMemory.objects.filter(pk=pk).exists())
        self.assertTrue(SyncEntityState.objects.filter(object_pk=pk,is_deleted=True).exists())

    def test_stale_fact_archived_but_milestone_retained(self):
        ordinary=self.auto(pk='ordinary');milestone=self.auto(pk='milestone')
        for memory in (ordinary,milestone):
            memory.metadata['world_memory']['last_supported_at']=(self.now-timedelta(days=181)).isoformat()
            memory.metadata['world_memory']['milestone']=memory.pk=='milestone';memory.save()
        retain(self.agent,self.now);ordinary.refresh_from_db();milestone.refresh_from_db()
        self.assertEqual(ordinary.status,'archived');self.assertEqual(milestone.status,'active')

    def test_protected_topic_cannot_be_rewritten(self):
        self.cooking();memory=self.auto();protect(memory);memory.save()
        _,_,evidence,_=prepare(self.state,self.day)
        with self.assertRaises(ValueError):validate_proposals(self.agent,[self.proposal(topic=meta(memory)['topic'],memory_id=memory.pk)],evidence)

    def test_recall_is_relevant_bounded_and_private(self):
        AgentLongTermMemory.objects.create(agent=self.agent,scope='agent',title='料理',content='甜品'*3000)
        AgentLongTermMemory.objects.create(agent=self.other,scope='agent',content='甜品他人秘密')
        AgentLongTermMemory.objects.create(agent=self.agent,scope='user',sender_id='alice',content='甜品用户秘密')
        text=memory_context(self.agent,'甜品')
        self.assertNotIn('秘密',text);self.assertLessEqual(estimate_tokens(text),RECALL_TOKENS)
        record=SimpleNamespace(sender_id='alice',chat_id='chat')
        self.assertEqual(len(recall(self.agent,'甜品',record)),2)
        AgentLongTermMemory.objects.filter(scope='agent',agent=self.agent).update(status='archived')
        self.assertEqual(memory_context(self.agent,'甜品'),'')

    def test_cache_revalidates_archive(self):
        memory=AgentLongTermMemory.objects.create(agent=self.agent,scope='agent',content='料理')
        with recall_scope():
            self.assertEqual(len(recall(self.agent,'料理')),1)
            memory.status='archived';memory.save()
            self.assertEqual(recall(self.agent,'料理'),[])

    def test_stale_vector_cannot_inject_old_content(self):
        memory=AgentLongTermMemory.objects.create(agent=self.agent,scope='agent',content='旧旅行')
        result={'ids':[[memory.pk]],'metadatas':[[{'revision':'old','embedding_model':'fake'}]],'distances':[[0.01]]}
        with patch('utils.rag_client.RagClient.create_embeddings',return_value=[[1,2]]),patch('system_settings.agent_world.memory.index.collection_for') as collection:
            collection.return_value.query.return_value=result
            self.assertEqual(recall(self.agent,'完全不相关的检索'),[])

    def test_missing_memory_or_state_rejected_by_snapshot(self):
        self.cooking()
        with patch('system_settings.agent_world.memory.consolidate.complete',return_value=json.dumps({'memories':[self.proposal()]})):process(self.state,self.now)
        data=self.snapshot();info=metadata(data)
        for label in ('system_settings.agentlongtermmemory','system_settings.agentmemorystate','system_settings.cookingoperation'):
            with self.subTest(label=label),self.assertRaises(SyncError):validate_source([r for r in data if r['model']!=label],info)
        with self.assertRaises(SyncError):validate_source(data,None)

    def test_old_snapshot_without_world_memories_remains_supported(self):
        validate_source([],None)

    def test_api_edit_protects_memory_and_summary(self):
        user=get_user_model().objects.create_superuser('admin','memory@example.invalid','test')
        client=APIClient();client.force_authenticate(user)
        memory=self.auto()
        response=client.put(f'/api/settings/agents/{self.agent.pk}/memories/{memory.pk}/',{'content':'人工修正'},format='json')
        self.assertEqual(response.status_code,200)
        memory.refresh_from_db();self.assertTrue(meta(memory)['human_override'])
        response=client.get(f'/api/settings/agents/{self.agent.pk}/memory-status/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['data']['protected_count'],1)
        response=client.post(f'/api/settings/agents/{self.agent.pk}/memories/',
            {'scope':'agent','sender_id':'alice','chat_id':'room','content':'角色共享'},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['data']['sender_id'],'')
        self.assertEqual(response.data['data']['chat_id'],'')
        response=client.post(f'/api/settings/agents/{self.agent.pk}/memories/',
            {'scope':'user','content':'没有归属的私有记忆'},format='json')
        self.assertIn('发送者 ID',str(response.data['msg']))
        self.assertFalse(AgentLongTermMemory.objects.filter(content='没有归属的私有记忆').exists())

    def test_api_pin_only_can_be_unpinned_without_rewriting(self):
        user=get_user_model().objects.create_superuser('admin','memory@example.invalid','test')
        client=APIClient();client.force_authenticate(user);memory=self.auto()
        response=client.put(f'/api/settings/agents/{self.agent.pk}/memories/{memory.pk}/',{'is_pinned':True},format='json')
        self.assertEqual(response.status_code,200);memory.refresh_from_db();self.assertTrue(memory.is_pinned)
        self.assertFalse(meta(memory).get('human_override',False))

    def test_merge_keeps_winning_corpus_and_human_edits(self):
        local_state={'model':'system_settings.agentmemorystate','pk':self.agent.pk,'fields':{'processed_day':'2026-10-01'}}
        remote_state=deepcopy(local_state);remote_state['fields']['processed_day']='2026-10-02'
        memory={'model':'system_settings.agentlongtermmemory','pk':'m','fields':{'agent':self.agent.pk,'metadata':{'world_memory':{'topic':'t'}},'content':'local'}}
        remote_memory=deepcopy(memory);remote_memory['fields']['content']='remote'
        result=[remote_state,deepcopy(memory)];revisions={}
        merge_aggregates(result,revisions,[local_state,memory],[remote_state,remote_memory],{}, {})
        self.assertEqual(next(r for r in result if r['pk']=='m')['fields']['content'],'remote')
        protected=deepcopy(memory);protected['fields']['metadata']['world_memory']['human_override']=True
        result=[remote_state,protected];merge_aggregates(result,{},[local_state,memory],[remote_state,remote_memory],{}, {})
        self.assertEqual(next(r for r in result if r['pk']=='m')['fields']['content'],'local')

    def test_equal_states_keep_merged_pin_changes_and_revisions(self):
        state = {'model': 'system_settings.agentmemorystate', 'pk': self.agent.pk,
                 'fields': {'processed_day': '2026-10-01'}}
        memory = {'model': 'system_settings.agentlongtermmemory', 'pk': 'm',
                  'fields': {'agent': self.agent.pk, 'is_pinned': True,
                             'metadata': {'world_memory': {'topic': 't'}}}}
        unpinned = deepcopy(memory)
        unpinned['fields']['is_pinned'] = False
        key = 'system_settings.agentlongtermmemory:m'
        winner_revision = {'hash': 'winner', 'deleted': False, 'revision_at': '2026-10-02'}
        for local, remote, winner in (
            (memory, unpinned, unpinned),
            (unpinned, memory, memory),
            (unpinned, memory, unpinned),
            (memory, unpinned, memory),
        ):
            with self.subTest(local_pinned=local['fields']['is_pinned'],
                              winner_pinned=winner['fields']['is_pinned']):
                result = [deepcopy(state), deepcopy(winner)]
                revisions = {key: deepcopy(winner_revision)}
                merge_aggregates(result, revisions, [state, local], [state, remote], {}, {})
                self.assertEqual(result, [state, winner])
                self.assertEqual(revisions[key], winner_revision)

    def test_large_history_keeps_new_evidence_within_input_budget(self):
        self.cooking()
        batch, _, evidence, _ = prepare(self.state, self.day)
        history = []
        for n in range(20):
            memory = self.auto(pk=f'history-{n}')
            memory.metadata['world_memory']['sources'] = [
                {**deepcopy(evidence['cooking:cook-1']), 'id': f'cooking:old-{n}-{i}',
                 'facts': {'significant': True, 'summary': '历史活动' * 180}}
                for i in range(8)]
            history.append(memory)
        before = deepcopy([m.metadata for m in history])
        with patch('system_settings.agent_world.memory.consolidate.recall', return_value=history), \
                patch('system_settings.agent_world.memory.consolidate.complete',
                      return_value=json.dumps({'memories': [self.proposal()]})) as model:
            proposals, used = propose(self.agent, batch, evidence)
        self.assertEqual(proposals, [self.proposal()])
        self.assertEqual(used, evidence)
        self.assertLessEqual(estimate_tokens(model.call_args.args[1]), INPUT_TOKENS)
        self.assertEqual([m.metadata for m in history], before)

    def test_history_is_dropped_before_current_evidence(self):
        self.cooking()
        batch, _, evidence, _ = prepare(self.state, self.day)
        history = [self.auto(pk=f'history-{n}') for n in range(20)]
        for memory in history:
            memory.title = '历' * 120
            memory.content = '史' * 300
        with patch('system_settings.agent_world.memory.consolidate.recall', return_value=history), \
                patch('system_settings.agent_world.memory.consolidate.INPUT_TOKENS', 1500), \
                patch('system_settings.agent_world.memory.consolidate.complete',
                      return_value=json.dumps({'memories': []})) as model:
            _, used = propose(self.agent, batch, evidence)
        self.assertEqual(used, evidence)
        self.assertLessEqual(estimate_tokens(model.call_args.args[1]), 1500)

    def test_equal_states_do_not_resurrect_deleted_memory(self):
        state = {'model': 'system_settings.agentmemorystate', 'pk': self.agent.pk, 'fields': {}}
        memory = {'model': 'system_settings.agentlongtermmemory', 'pk': 'm',
                  'fields': {'agent': self.agent.pk, 'metadata': {'world_memory': {'topic': 't'}}}}
        result = [deepcopy(state)]
        key = 'system_settings.agentlongtermmemory:m'
        revisions = {key: {'hash': '!deleted', 'deleted': True}}
        merge_aggregates(result, revisions, [state, memory], [state], {}, {})
        self.assertEqual(result, [state])
        self.assertEqual(revisions[key], {'hash': '!deleted', 'deleted': True})

    def test_oversized_evidence_does_not_advance_cursor(self):
        self.cooking()
        previous_day = self.state.processed_day
        with patch('system_settings.agent_world.memory.consolidate.INPUT_TOKENS', 1), \
                patch('system_settings.agent_world.memory.consolidate.complete') as model:
            process(self.state, self.now)
        model.assert_not_called()
        self.state.refresh_from_db()
        self.assertEqual(self.state.status, 'failed')
        self.assertEqual(self.state.processed_day, previous_day)
        self.assertEqual(self.state.observations, {})
        self.assertFalse(AgentLongTermMemory.objects.exists())

    def test_initialization_does_not_reset_existing_cutoff(self):
        initialize_states(self.now);self.state.refresh_from_db()
        self.assertEqual(self.state.enabled_at,self.now-timedelta(days=2))

    def test_role_change_during_call_discards_result(self):
        self.cooking()
        def change(*args, **kwargs):
            Agent.objects.filter(pk=self.agent.pk).update(prompt='不同角色设定')
            return json.dumps({'memories':[self.proposal()]})
        with patch('system_settings.agent_world.memory.consolidate.complete',side_effect=change):process(self.state,self.now)
        self.assertFalse(AgentLongTermMemory.objects.exists())

    def test_topic_updates_existing_identity_and_keeps_sources_bounded(self):
        self.cooking()
        memory=self.auto(); memory.metadata['world_memory']['topic']='第一次三星料理';memory.save()
        with patch('system_settings.agent_world.memory.consolidate.complete',return_value=json.dumps({'memories':[self.proposal()]})):process(self.state,self.now)
        self.assertEqual(AgentLongTermMemory.objects.count(),1)
        memory.refresh_from_db();self.assertEqual(memory.content,self.proposal()['content'])
        self.assertLessEqual(len(meta(memory)['sources']),8)

    def test_private_chat_memory_requires_matching_chat(self):
        AgentLongTermMemory.objects.create(agent=self.agent,scope='chat',chat_id='room',content='料理会话私事')
        self.assertEqual(recall(self.agent,'料理',SimpleNamespace(sender_id='alice',chat_id='other')),[])
        self.assertEqual(len(recall(self.agent,'料理',SimpleNamespace(sender_id='alice',chat_id='room'))),1)
        AgentLongTermMemory.objects.create(agent=self.agent,scope='user',content='料理旧私事')
        self.assertEqual(recall(self.agent,'料理',SimpleNamespace(sender_id='',chat_id='')),[])

    def test_forged_observation_rejected_even_with_new_manifest(self):
        self.cooking();batch,observed,_,_=prepare(self.state,self.day)
        self.state.observations=observed;self.state.save()
        data=self.snapshot()
        state=next(r for r in data if r['model']=='system_settings.agentmemorystate')
        next(iter(state['fields']['observations'].values()))[0]['facts']['result']['stars']=5
        with self.assertRaises(SyncError):validate_source(data,metadata(data))

    def test_auto_memory_sync_roundtrip_preserves_cursor_and_revokes_lease(self):
        from anthology.models import Anthology
        from system_settings.models import AgentActivity
        from utils.sync_manager import SyncManager
        Anthology.objects.create(coll_id='memory-posts',user_id='admin',title='记忆作品',type='agent')
        AgentActivity.objects.create(id='published',event_key='memory-post',agent=self.agent,activity_type='publication',
            action='publish',artifact_id='article-one',artifact_coll_id='memory-posts',title='种田心得',summary='分享我的种田经验',occurred_at=self.now-timedelta(days=1))
        value=self.proposal(source='publication:published')
        with patch('system_settings.agent_world.memory.consolidate.complete',return_value=json.dumps({'memories':[value]})):process(self.state,self.now)
        self.state.refresh_from_db();self.assertEqual(self.state.processed_day,self.day)
        manager=SyncManager();data=manager.build_snapshot_data();info=manager.build_snapshot_meta(data_list=data)
        AgentMemoryLease.objects.update(token='old-device',until=self.now+timedelta(minutes=1))
        manager.apply_snapshot_data(data,info,full_overwrite=True)
        self.state.refresh_from_db();self.assertEqual(self.state.processed_day,self.day)
        self.assertEqual(AgentLongTermMemory.objects.count(),1)
        self.assertEqual(AgentMemoryLease.objects.get(pk=self.agent.pk).token,'')
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)

    def test_travel_completion_time_survives_later_photo_updates(self):
        from ..travel_models import TravelJourney
        at=self.now-timedelta(days=1)
        journey=TravelJourney.objects.create(id='memory-trip',agent=self.agent,actor_id=self.agent.pk,owner_id='admin',status='completed',returned_at=at,
            snapshot={'memory_completed_at':at.isoformat(),'selected':{'city':'杭州'},'draft':{'reflection':'喜欢慢慢游览'}})
        batch=collect('admin',self.agent,self.day,self.state.enabled_at)
        self.assertEqual(batch['counts']['travel'],1)
        before=batch['fingerprint']
        journey.snapshot['photo']={'status':'completed'};journey.save()
        self.assertEqual(collect('admin',self.agent,self.day,self.state.enabled_at)['fingerprint'],before)
