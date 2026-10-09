"""统一生活回归：隔离数据库、模拟模型，不调用外部服务。"""
from collections import Counter
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase, override_settings
from django.db import transaction
from django.utils import timezone
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from system_settings.models import Agent, AgentTask, WorldActionRuntime, AgentRunRecord, WorldAction, AIProvider, AIModel, SystemSetting
from .life_models import LifeConfig, LifeProfile, LifeGoal, LifeCycle, LifeItem
from .life_config import DEFAULTS, validate_settings, ensure_profiles
from .life_schedule import SHANGHAI, allocation_times, ensure_cycle, recover, requeue, stable_id
from .life_time import local_time
from .life_budget import charge_budget, adjust_budget
from .life_scope import life_scope
from .life_planner import apply_plan, check_goals
from .life_context import build_context
from .life_sync import checkpoint_all, reconcile_life
from .market_models import MarketSession, MarketBatch
from .market_sessions import enter, close_session
from .market_shop import current_batch
from .market_service import trade

NOW=datetime(2026,9,29,8,tzinfo=SHANGHAI)


class AllocationTests(SimpleTestCase):
    def test_feasible_interval_remains_valid_across_days(self):
        settings = {**DEFAULTS, 'agent_ids': ['a', 'b', 'c', 'd'],
                    'interval_minutes': 30, 'min_gap_minutes': 60,
                    'active_start': '08:00', 'active_end': '12:00'}
        for day in range(1, 31):
            rows = allocation_times(settings, NOW.replace(day=day), full_period=True)
            self.assertEqual(len(rows), 8)
            self.assertEqual(set(Counter(actor for _, actor in rows).values()), {2})
            for actor in settings['agent_ids']:
                times = [at for at, identity in rows if identity == actor]
                self.assertGreaterEqual(times[1]-times[0], timedelta(minutes=60))

    def settings(self,count=12):
        return {**DEFAULTS,'mode':'random','count':count,'agent_ids':['a','b','c','d']}

    def test_equal_and_random_remainder_stable(self):
        for count in (12,13):
            result=allocation_times(self.settings(count),NOW,full_period=True)
            counts=Counter(a for _,a in result)
            self.assertEqual(len(result),count)
            self.assertLessEqual(max(counts.values())-min(counts.values()),1)
            self.assertEqual(result,allocation_times(self.settings(count),NOW,full_period=True))

    def test_fixed_full_day_has_24_world_opportunities(self):
        result=allocation_times({**DEFAULTS,'agent_ids':['a','b','c','d']},NOW,full_period=True)
        self.assertEqual(len(result),24)
        self.assertEqual(set(Counter(a for _,a in result).values()),{6})

    def test_capacity_error_not_silent_reduction(self):
        with self.assertRaises(ValueError):
            allocation_times({**self.settings(100),'active_start':'09:00','active_end':'10:00'},NOW,full_period=True)

    def test_week_starts_monday(self):
        result=allocation_times({**self.settings(),'period':'weekly'},NOW,full_period=True)
        self.assertTrue(all(datetime(2026,9,28,tzinfo=SHANGHAI)<=t<datetime(2026,10,5,tzinfo=SHANGHAI) for t,_ in result))


@override_settings(USE_TZ=True)
class LifeTests(TestCase):
    def setUp(self):
        provider=AIProvider.objects.create(name='test',base_url='http://example.invalid',api_key='fake')
        self.model=AIModel.objects.create(provider=provider,name='fake',type='chat')
        self.agents=[Agent.objects.create(name=f'A{i}',model=self.model,money=10000) for i in range(4)]
        self.ids=[a.pk for a in self.agents]
        self.config=LifeConfig.objects.create(pk='admin',settings={**DEFAULTS,'agent_ids':self.ids,'mode':'random','count':12},migrated=True)
        ensure_profiles('admin',self.ids)
        WorldActionRuntime.objects.create(pk='world',enabled=True)
        self.task=AgentTask.objects.create(name='投资',agent=self.agents[0],agent_ids=[self.ids[0]],task_kind='investment',investment_config={'owner_id':'admin'},enabled=True)

    def item(self,identity='one',**values):
        defaults={'owner_id':'admin','actor_id':self.ids[0],'original_at':NOW,'scheduled_at':NOW}
        return LifeItem.objects.create(pk=identity,**{**defaults,**values})

    def test_manual_travel_finalized_when_automatic_runner_disabled(self):
        from .travel_models import TravelJourney
        from .action_runner import tick
        item = self.item(activity='travel', status='running', budget=9000, context={'manual': True})
        TravelJourney.objects.create(pk=item.pk, owner_id='admin', actor_id=self.ids[0],
                                     agent=self.agents[0], status='completed', phase='done')
        WorldActionRuntime.objects.filter(pk='world').update(enabled=False)
        with patch('system_settings.agent_world.travel_runner.tick_travel'), \
             patch('system_settings.agent_world.farm_runner.tick_farms'), \
             patch('system_settings.agent_world.life_runner.ensure_cycle') as plan:
            tick(None)
        item.refresh_from_db()
        self.assertEqual(item.status, 'completed')
        self.assertFalse(LifeItem.objects.filter(actor_id=self.ids[0], status__in=('pending','running','deferred','paused')).exists())
        plan.assert_not_called()

    def test_unchanged_snapshot_does_not_update_integrity(self):
        from .life_models import LifeIntegrity
        checkpoint_all()
        before = LifeIntegrity.objects.get(pk='admin').updated_at
        checkpoint_all()
        self.assertEqual(LifeIntegrity.objects.get(pk='admin').updated_at, before)

    def test_life_merge_preserves_independent_goals_and_rejects_missing_source(self):
        import copy
        from utils.sync_manager import SyncManager, SyncError, canonical_hash
        from .life_snapshot import validate_source
        manager = SyncManager()
        base = manager.build_snapshot_data()
        remote_goal = LifeGoal.objects.create(owner_id='admin', actor_id=self.ids[0], title='远端目标')
        remote_id = remote_goal.pk
        remote = manager.build_snapshot_data()
        remote_goal.delete()
        local_goal = LifeGoal.objects.create(owner_id='admin', actor_id=self.ids[0], title='本地目标')
        local = manager.build_snapshot_data()

        def revisions(data, stamp):
            return {f"{row['model']}:{row['pk']}": {'hash': canonical_hash(row['fields']),
                    'revision_at': stamp, 'origin_device': 'test', 'deleted': False} for row in data}

        baseline = {'data': base, 'revisions': revisions(base, '2026-09-29T00:00:00')}
        remote_state = {'data': remote, 'revisions': revisions(remote, '2026-09-29T01:00:00')}
        handoff, _, _ = manager.merge_v2_data(baseline, base, baseline['revisions'], remote_state)
        validate_source(handoff)
        self.assertIn(remote_id, [row['pk'] for row in handoff if row['model'] == 'system_settings.lifegoal'])
        local_revisions = revisions(local, '2026-09-29T02:00:00')
        merged, merged_revisions, _ = manager.merge_v2_data(baseline, local, local_revisions, remote_state)
        validate_source(merged)
        for row in merged:
            self.assertEqual(merged_revisions[f"{row['model']}:{row['pk']}"]['hash'], canonical_hash(row['fields']))
        manager.apply_snapshot_data(merged, full_overwrite=True)
        self.assertEqual(set(LifeGoal.objects.values_list('pk', flat=True)), {local_goal.pk, remote_id})
        broken = copy.deepcopy(remote_state)
        broken['data'] = [row for row in broken['data'] if row['pk'] != remote_id]
        with self.assertRaises(SyncError):
            manager.merge_v2_data(baseline, local, local_revisions, broken)

    def test_cycle_persists_and_changes_wait(self):
        cycle=ensure_cycle(self.config,NOW)
        before=list(LifeItem.objects.filter(cycle=cycle).values_list('id','actor_id','scheduled_at'))
        self.config.settings['count']=20;self.config.save()
        self.assertEqual(ensure_cycle(self.config,NOW).pk,cycle.pk)
        self.assertEqual(before,list(LifeItem.objects.filter(cycle=cycle).values_list('id','actor_id','scheduled_at')))

    def test_late_start_skips_new_planning(self):
        self.assertIsNone(ensure_cycle(self.config,NOW.replace(hour=22)))
        self.assertFalse(LifeItem.objects.exists())

    def test_partial_period_does_not_compress_complete_count(self):
        self.config.settings.update(count=100,min_gap_minutes=1)
        self.config.save()
        self.assertIsNone(ensure_cycle(self.config,NOW.replace(hour=19)))
        self.assertFalse(LifeItem.objects.exists())

    def test_backlog_agent_excluded_others_plan(self):
        self.item()
        cycle=ensure_cycle(self.config,NOW)
        self.assertFalse(LifeItem.objects.filter(cycle=cycle,actor_id=self.ids[0]).exists())
        self.assertEqual(LifeItem.objects.filter(cycle=cycle).count(),12)

    def test_recover_does_not_push_normal_due_forever(self):
        item=self.item()
        recover(self.config,NOW+timedelta(seconds=30))
        item.refresh_from_db();self.assertEqual(item.scheduled_at,NOW)
        recover(self.config,NOW+timedelta(minutes=5))
        item.refresh_from_db();self.assertEqual(item.status,'deferred')
        new_at=item.scheduled_at
        recover(self.config,NOW+timedelta(minutes=6))
        item.refresh_from_db();self.assertEqual(item.scheduled_at,new_at)

    def test_pause_resume_next_day_original_time(self):
        item=self.item(status='paused')
        recover(self.config,NOW+timedelta(hours=2),resume_actor=self.ids[0])
        item.refresh_from_db();self.assertEqual(item.scheduled_at.date(),NOW.date()+timedelta(days=1));self.assertEqual(item.scheduled_at.astimezone(SHANGHAI).hour,8)

    def test_budget_protects_travel_and_rollback(self):
        item=self.item(budget=7000)
        self.item('trip',activity='travel',budget=3000)
        with life_scope(item,{}),transaction.atomic():
            with self.assertRaises(ValueError):charge_budget(self.agents[0],Decimal('8000'))
            charge_budget(self.agents[0],Decimal('1000'))
        item.refresh_from_db();self.assertEqual(item.spent,1000)
        with self.assertRaises(ValueError):adjust_budget('admin',self.ids[0],[{'id':item.pk,'budget':'500'}],'不能低于已支出')
        with self.assertRaises(ValueError):adjust_budget('admin',self.ids[0],[{'id':'trip','budget':'9000'}],'总额不足')
        adjust_budget('admin',self.ids[0],[{'id':item.pk,'budget':'8000'},{'id':'trip','budget':'2000'}],'减少购物预算')
        self.assertEqual(item.revisions.count(),1)

    def test_apply_plan_and_completed_goals_excluded(self):
        item=self.item()
        goal=LifeGoal.objects.create(owner_id='admin',actor_id=self.ids[0],title='攒钱',condition={'kind':'savings','amount':'10000'})
        apply_plan('admin',self.agents[0],[item],{'plans':[{'id':item.pk,'activity':'investment','budget':'1000','reason':'保留旅行资金'}]})
        item.refresh_from_db();self.assertEqual(item.task_id,self.task.pk)
        check_goals('admin',self.agents[0]);goal.refresh_from_db();self.assertEqual(goal.status,'completed')
        self.assertEqual(build_context('admin',self.agents[0],item)['goals'],[])

    def test_unknown_activity_and_missing_slot_rejected(self):
        item=self.item()
        for plans in ([],[{'id':item.pk,'activity':'market','reason':'去逛市场','budget':'0'}]):
            with self.assertRaises(ValueError):apply_plan('admin',self.agents[0],[item],{'plans':plans})

    def test_planning_can_adjust_future_commitments_with_reason(self):
        item=self.item()
        future=self.item('future',budget=9000)
        proposal={'plans':[{'id':item.pk,'activity':'investment','budget':'2000','reason':'增加本次可用金额'}],
                  'budget_allocations':[{'id':future.pk,'budget':'8000'}],'budget_reason':'降低后续购物预期'}
        apply_plan('admin',self.agents[0],[item],proposal)
        future.refresh_from_db();self.assertEqual(future.budget,8000)
        self.assertEqual(future.revisions.get().reason,'降低后续购物预期')

    def test_shared_context_has_past_and_future(self):
        first=self.item(status='completed',result={'reason':'已买到种子'})
        second=self.item('later',budget=2000,intent='下午旅行')
        AgentRunRecord.objects.create(task=self.task,agent=self.agents[0],task_name='采购',status='success',summary='已买到种子')
        data=build_context('admin',self.agents[0],second)
        self.assertEqual(data['recent_experiences'][0]['summary'],'已买到种子')
        self.assertEqual(data['current']['budget'],'2000')
        self.assertIn('today',data)

    def test_pinned_actor_no_second_random_selection(self):
        from .action_schedule import select_agent
        item=self.item()
        item.actor_id=self.ids[3];item.save()
        with life_scope(item,{}):self.assertEqual(select_agent(self.task,cost=5).pk,self.ids[3])

    def test_full_snapshot_missing_fact_rejected(self):
        self.item()
        checkpoint_all();reconcile_life()
        LifeItem.objects.all().delete()
        with self.assertRaises(Exception):reconcile_life()

    def test_api_owner_isolation_and_profile(self):
        user=User.objects.create_user('admin',password='test',is_superuser=True)
        client=APIClient();client.force_authenticate(user)
        item=self.item()
        self.assertEqual(client.get('/api/settings/agent-world/life/schedule/'+item.pk+'/').status_code,200)
        foreign=LifeGoal.objects.create(owner_id='other',actor_id='other',title='private',condition={'kind':'subjective'})
        response=client.post('/api/settings/agent-world/life/goals/',{'id':foreign.pk,'status':'abandoned','reason':'x'},format='json')
        self.assertEqual(response.status_code,404)

    def test_snapshot_round_trip_keeps_identity_and_disables_runner(self):
        from utils.sync_manager import SyncManager
        from .life_schedule import revise
        item=self.item(budget=2000)
        revise(item,'旅行预留',intent='晚上旅行')
        manager=SyncManager()
        snapshot=manager.build_snapshot_data()
        labels={v['model'] for v in snapshot}
        self.assertIn('system_settings.lifeitem',labels)
        self.assertIn('system_settings.lifeintegrity',labels)
        self.assertNotIn('system_settings.worldactionruntime',labels)
        manager.apply_snapshot_data(snapshot,full_overwrite=True)
        restored=LifeItem.objects.get(pk=item.pk)
        self.assertEqual(restored.budget,2000)
        self.assertEqual(restored.revisions.count(),1)
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)

    def test_recovery_avoids_existing_future_time(self):
        old=self.item()
        future=self.item('future',scheduled_at=NOW+timedelta(minutes=15))
        recover(self.config,NOW+timedelta(minutes=5))
        old.refresh_from_db();future.refresh_from_db()
        self.assertGreaterEqual(abs((old.scheduled_at-future.scheduled_at).total_seconds()),900)

    def test_production_naive_time_serializes_in_shanghai(self):
        from .life_views import item_data
        with override_settings(USE_TZ=False):
            item=self.item()
            item.refresh_from_db()
            self.assertIsNone(item.scheduled_at.tzinfo)
            self.assertIn('08:00:00+08:00',item_data(item)['scheduled_at'])
            cycle=ensure_cycle(self.config,NOW)
            self.assertEqual(ensure_cycle(self.config,NOW).pk,cycle.pk)
            self.agents[0].refresh_from_db()
            data=build_context('admin',self.agents[0],item)
            import json
            json.dumps(data)

    def test_unified_pipeline_plans_then_consumes_once(self):
        from .life_runner import tick_life
        item=self.item(scheduled_at=timezone.now(),activity='unplanned')
        record=AgentRunRecord.objects.create(task=self.task,agent=self.agents[0],task_name='投资',status='success',summary='保持现金')
        def proposal(agent,instruction,context):
            return {'plans':[{'id':slot['id'],'activity':'investment','budget':'1000','reason':'保留现金'} for slot in context['slots']]}
        with patch('system_settings.agent_world.life_planner.ask',side_effect=proposal), patch('system_settings.agent_world.investment_runner.run_investment_opportunity',return_value=record) as run:
            tick_life(None)
            item.refresh_from_db()
            self.assertEqual(item.status,'completed')
            self.assertEqual(item.record_id,record.pk)
            self.assertEqual(run.call_args.kwargs['key'],item.pk)
            tick_life(None)
            self.assertEqual(run.call_count,1)

    def test_planning_failure_keeps_model_reason_on_schedule(self):
        from .life_runner import tick_life
        item=self.item(scheduled_at=timezone.now(),activity='unplanned')
        with patch('system_settings.agent_world.life_planner.ask',side_effect=ValueError('规划必须为本次每个时间点指定且仅指定一次活动')):
            tick_life(None)
        item.refresh_from_db()
        self.assertEqual(item.status,'deferred')
        self.assertIn('规划必须为本次每个时间点指定',item.result['reason'])
        self.assertIn('规划必须为本次每个时间点指定',item.revisions.latest('created_at').reason)

    def test_frozen_migration_keeps_future_slots_and_disables_auto(self):
        import importlib
        from django.apps import apps
        from django.db import connection
        from .life_models import LifeConfig,LifeProfile
        now=timezone.now()
        points=[(now-timedelta(hours=1)).isoformat(),(now+timedelta(hours=1)).isoformat()]
        self.task.world_state={'schedule':{'id':'old','index':0,'slots':points}}
        self.task.save()
        LifeConfig.objects.all().delete();LifeProfile.objects.all().delete()
        migration=importlib.import_module('system_settings.migrations.0050_migrate_world_life_schedule')
        migration.migrate_world(apps,connection.schema_editor())
        self.assertEqual(LifeItem.objects.count(),1)
        self.assertTrue(LifeConfig.objects.get(pk='admin').migrated)
        self.assertFalse(WorldActionRuntime.objects.get(pk='world').enabled)
        identity=LifeItem.objects.get().pk
        migration.migrate_world(apps,connection.schema_editor())
        self.assertEqual(LifeItem.objects.get().pk,identity)

    def test_travel_budget_can_be_reassigned_before_payment(self):
        from types import SimpleNamespace
        from .life_travel_budget import review_travel_budget
        item=self.item(activity='travel',budget=1000,status='running')
        self.item('later',budget=9000)
        trip=SimpleNamespace(pk=item.pk,agent=self.agents[0])
        decision={'allocations':[{'id':item.pk,'budget':'2000'},{'id':'later','budget':'8000'}],'reason':'真实旅费增加，减少后续可选购物'}
        with patch('system_settings.agent_world.travel_ai.ask',return_value=decision):
            review_travel_budget(trip,Decimal('1500'))
        item.refresh_from_db()
        self.assertEqual(item.budget,2000)
        self.assertEqual(item.spent,0)
        self.agents[0].refresh_from_db();self.assertEqual(self.agents[0].money,10000)

    def test_cancel_requires_reason_before_workflow_changes(self):
        from .travel_models import TravelJourney
        item=self.item(activity='travel',status='running')
        trip=TravelJourney.objects.create(pk=item.pk,owner_id='admin',actor_id=self.ids[0],agent=self.agents[0],status='manual')
        user=User.objects.create_user('admin',is_superuser=True)
        client=APIClient();client.force_authenticate(user)
        response=client.post('/api/settings/agent-world/life/schedule/'+item.pk+'/',{'action':'cancel'},format='json')
        self.assertEqual(response.status_code,400)
        trip.refresh_from_db();self.assertEqual(trip.status,'manual')
        response=client.post('/api/settings/agent-world/life/schedule/'+item.pk+'/',{'action':'cancel','reason':'不再继续'},format='json')
        self.assertEqual(response.status_code,200)
        trip.refresh_from_db();self.assertEqual(trip.status,'cancelled')

    def test_failed_planning_can_be_requeued(self):
        item=self.item(activity='unplanned',status='failed',attempts=3,result={'reason':'规划必须为本次每个时间点指定且仅指定一次活动'},
                       context={'planning_retry_at':NOW.isoformat(),'planned_on':'2026-09-29'})
        executed=self.item('done',status='failed',record_id='rec1',attempts=1,activity='investment',task_id=self.task.pk,intent='试单',budget=2000)
        prepare=self.item('prep',activity='market_prepare',status='failed')
        user=User.objects.create_user('admin',is_superuser=True)
        client=APIClient();client.force_authenticate(user)
        blocked_prep=client.post('/api/settings/agent-world/life/schedule/'+prepare.pk+'/',{'action':'replan','reason':'补做失败安排'},format='json')
        self.assertEqual(blocked_prep.status_code,400)
        retried=client.post('/api/settings/agent-world/life/schedule/'+executed.pk+'/',{'action':'retry','reason':'字段超长已修复，重试投资'},format='json')
        self.assertEqual(retried.status_code,200,retried.data)
        executed.refresh_from_db()
        self.assertIn(executed.status,('pending','deferred'))
        self.assertEqual(executed.activity,'investment')
        self.assertEqual(executed.intent,'试单')
        self.assertEqual(executed.record_id,'')
        self.assertTrue(executed.context.get('execution_key'))
        self.assertNotEqual(executed.context['execution_key'],executed.pk)
        response=client.post('/api/settings/agent-world/life/schedule/'+item.pk+'/',{'action':'replan','reason':'规划误失败，重新排队'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        item.refresh_from_db()
        self.assertIn(item.status,('pending','deferred'))
        self.assertEqual(item.activity,'unplanned')
        self.assertEqual(item.attempts,0)
        self.assertEqual(item.result,{})
        self.assertNotIn('planning_retry_at',item.context)
        self.assertGreaterEqual(local_time(item.scheduled_at), local_time()-timedelta(seconds=90))
        bulk=client.post('/api/settings/agent-world/life/schedule/',{'action':'replan_failed','actorId':self.ids[0],'reason':'批量补做本周失败安排','start':'2026-09-29','end':'2026-10-06'},format='json')
        self.assertEqual(bulk.status_code,200,bulk.data)
        self.assertEqual(bulk.data['data']['count'],0)
        other=self.item('more',actor_id=self.ids[0],status='failed',scheduled_at=NOW+timedelta(hours=1))
        bulk=client.post('/api/settings/agent-world/life/schedule/',{'action':'replan_failed','actorId':self.ids[0],'reason':'批量补做本周失败安排','start':'2026-09-29','end':'2026-10-06'},format='json')
        self.assertEqual(bulk.status_code,200,bulk.data)
        self.assertEqual(bulk.data['data']['count'],1)
        other.refresh_from_db()
        self.assertIn(other.status,('pending','deferred'))
        self.assertGreaterEqual(local_time(other.scheduled_at), local_time()-timedelta(seconds=90))

    def test_requeue_advances_overdue_slots_in_original_order(self):
        early=self.item('early',status='failed',scheduled_at=NOW.replace(hour=4))
        mid=self.item('mid',status='failed',scheduled_at=NOW.replace(hour=5))
        future=self.item('later',scheduled_at=NOW+timedelta(hours=4))
        requeue(early,'规划误失败，重新排队')
        requeue(mid,'规划误失败，重新排队')
        recover(self.config,NOW,resume_actor=self.ids[0],delay_reason='人工补做，过期时间点已顺延到可执行空档')
        early.refresh_from_db();mid.refresh_from_db();future.refresh_from_db()
        self.assertGreaterEqual(local_time(early.scheduled_at), NOW+timedelta(minutes=5))
        self.assertGreaterEqual(local_time(mid.scheduled_at)-local_time(early.scheduled_at), timedelta(minutes=15))
        self.assertEqual(local_time(future.scheduled_at), NOW+timedelta(hours=4))
        self.assertIn('人工补做', early.revisions.latest('created_at').reason)

    def test_retry_execute_uses_new_opportunity_key(self):
        from .life_runner import execute_item
        item=self.item(activity='investment',task_id=self.task.pk,status='pending',budget=2000,scheduled_at=timezone.now(),
                       context={'execution_key':'retry-key-1','planned_on':timezone.now().date().isoformat()})
        record=AgentRunRecord.objects.create(task=self.task,agent=self.agents[0],task_name='投资',status='success',summary='观望')
        with patch('system_settings.agent_world.life_runner.plan_items'), \
             patch('system_settings.agent_world.investment_runner.run_investment_opportunity',return_value=record) as run:
            execute_item(item,None)
        self.assertEqual(run.call_args.kwargs['key'],'retry-key-1')
        item.refresh_from_db()
        self.assertEqual(item.status,'completed')
        self.assertEqual(item.record_id,record.pk)

    def test_planned_retry_mints_key_without_record(self):
        from .life_schedule import retry_failed
        item=self.item(activity='investment',task_id=self.task.pk,status='failed',intent='试单',budget=2000,
                       result={'reason':'本次活动失败，已提交业务保留'})
        retry_failed(item,'字段超长已修复，重试投资')
        item.refresh_from_db()
        self.assertIn(item.status,('pending','deferred'))
        self.assertEqual(item.activity,'investment')
        self.assertTrue(item.context.get('execution_key'))
        self.assertNotEqual(item.context['execution_key'],item.pk)

    def test_finish_running_uses_retry_opportunity_not_old_item_key(self):
        from .life_runner import finish_running
        record=AgentRunRecord.objects.create(task=self.task,agent=self.agents[0],task_name='投资',status='success',summary='买入观察')
        item=self.item(activity='investment',status='running',task_id=self.task.pk,context={'execution_key':'retry-key-done'})
        WorldAction.objects.create(pk=item.pk,task=self.task,agent=self.agents[0],actor_id=self.ids[0],status='failed',
                                   result={'reason':'旧失败'},snapshot={'investment':True})
        WorldAction.objects.create(pk='retry-key-done',task=self.task,agent=self.agents[0],actor_id=self.ids[0],
                                   record=record,status='success',result={'reason':'买入观察'},snapshot={'investment':True})
        LifeItem.objects.filter(pk=item.pk).update(updated_at=timezone.now()-timedelta(minutes=20))
        finish_running(self.config,local_time())
        item.refresh_from_db()
        self.assertEqual(item.status,'completed')
        self.assertEqual(item.record_id,record.pk)
        self.assertEqual(item.result.get('reason'),'买入观察')

    def test_snapshot_keeps_skipped_opportunity_without_selected_actor(self):
        item=self.item(activity='investment',task_id=self.task.pk,status='rest')
        record=AgentRunRecord.objects.create(task=self.task,task_name='投资',status='success',summary='没有空闲居民')
        item.record_id=record.pk;item.save()
        checkpoint_all();reconcile_life()
        self.assertEqual(LifeItem.objects.get(pk=item.pk).record_id,record.pk)

    def test_snapshot_spending_must_match_actual_ledger(self):
        from .models import WorldLedger
        item=self.item(budget=2000,spent=1000,context={'debit_keys':['proof']})
        ledger=WorldLedger.objects.create(pk='proof',agent_id=item.actor_id,agent_name='A',kind='travel',amount=-1000)
        checkpoint_all();reconcile_life()
        ledger.delete()
        with self.assertRaises(Exception):reconcile_life()

    def test_snapshot_revokes_only_life_lease_not_custom_task(self):
        from .execution import execution_lease
        from system_settings.models import AgentExecutionLease
        item=self.item()
        self.item('another',actor_id=self.ids[1])
        with execution_lease(AgentExecutionLease,{'agent':self.agents[1]}) as custom:
            with life_scope(item,{}),execution_lease(AgentExecutionLease,{'agent':self.agents[0]}) as living:
                self.assertTrue(living.startswith('life:'))
                checkpoint_all();reconcile_life()
                self.assertEqual(AgentExecutionLease.objects.get(pk=self.ids[0]).token,'')
                self.assertEqual(AgentExecutionLease.objects.get(pk=self.ids[1]).token,custom)

    def test_cycle_actor_remains_authorized_after_future_config_removal(self):
        from .life_scope import allowed,check_current_authorization
        cycle=ensure_cycle(self.config,NOW)
        item=LifeItem.objects.filter(cycle=cycle,actor_id=self.ids[0]).first()
        self.config.settings['agent_ids']=self.ids[1:];self.config.save()
        with life_scope(item,{}):
            self.assertTrue(allowed(self.task,self.ids[0]))
            check_current_authorization()
            self.config.paused_agents=[self.ids[0]];self.config.save()
            with self.assertRaises(ValueError):check_current_authorization()

    def test_due_planned_item_runs_before_later_planning(self):
        from .life_runner import tick_life
        today=local_time().date().isoformat()
        item=self.item(activity='investment',task_id=self.task.pk,scheduled_at=timezone.now(),context={'planned_on':today})
        self.item('later',actor_id=self.ids[1],activity='unplanned',scheduled_at=timezone.now()+timedelta(hours=3))
        record=AgentRunRecord.objects.create(task=self.task,agent=self.agents[0],task_name='投资',status='success',summary='观望')
        order=[]
        with patch('system_settings.agent_world.life_runner.plan_items',side_effect=lambda *args,**kwargs: order.append('plan')), \
             patch('system_settings.agent_world.investment_runner.run_investment_opportunity',side_effect=lambda *args,**kwargs: order.append('run') or record):
            tick_life(None)
        item.refresh_from_db()
        self.assertEqual(item.status,'completed')
        self.assertEqual(order, ['plan', 'run', 'plan'])

    def test_planner_lock_does_not_skip_due_planned_item(self):
        from .life_runner import tick_life
        today=local_time().date().isoformat()
        item=self.item(activity='investment',task_id=self.task.pk,scheduled_at=timezone.now(),context={'planned_on':today})
        WorldActionRuntime.objects.create(pk='life-planner',token='held',until=timezone.now()+timedelta(minutes=10))
        record=AgentRunRecord.objects.create(task=self.task,agent=self.agents[0],task_name='投资',status='success',summary='观望')
        with patch('system_settings.agent_world.life_runner.plan_items'), \
             patch('system_settings.agent_world.investment_runner.run_investment_opportunity',return_value=record):
            tick_life(None)
        item.refresh_from_db()
        self.assertEqual(item.status,'completed')
        self.assertEqual(item.record_id,record.pk)

    def test_overdue_planned_item_is_deferred_instead_of_remaining_silent(self):
        from .life_runner import tick_life
        today=local_time().date().isoformat()
        original=timezone.now()-timedelta(minutes=10)
        item=self.item(activity='investment',task_id=self.task.pk,scheduled_at=original,context={'planned_on':today})
        with patch('system_settings.agent_world.life_runner.plan_items'), \
             patch('system_settings.agent_world.investment_runner.run_investment_opportunity') as run:
            tick_life(None)
        item.refresh_from_db()
        self.assertEqual(item.status,'deferred')
        self.assertGreater(item.scheduled_at,timezone.now())
        self.assertIn('顺延',item.revisions.latest('created_at').reason)
        run.assert_not_called()

    def test_busy_world_lock_closes_finished_work_and_leaves_due_slot(self):
        from .action_runner import tick
        today=local_time().date().isoformat()
        record=AgentRunRecord.objects.create(task=self.task,agent=self.agents[0],task_name='投资',status='success',summary='已结束')
        done=self.item('done',activity='investment',status='running',task_id=self.task.pk,context={'execution_key':'done-key'})
        WorldAction.objects.create(pk='done-key',task=self.task,agent=self.agents[0],actor_id=self.ids[0],record=record,
                                   status='success',result={'reason':'已结束'},snapshot={'investment':True})
        due=self.item(activity='investment',task_id=self.task.pk,scheduled_at=timezone.now(),context={'planned_on':today})
        WorldActionRuntime.objects.filter(pk='world').update(token='held',until=timezone.now()+timedelta(minutes=10))
        with patch('system_settings.agent_world.investment_runner.run_investment_opportunity') as run:
            tick(None)
        done.refresh_from_db();due.refresh_from_db()
        self.assertEqual(done.status,'completed')
        self.assertEqual(due.status,'pending')
        run.assert_not_called()

    def test_replan_that_loses_the_world_lock_leaves_the_slot_pending(self):
        from .life_runner import tick_life
        today=local_time().date().isoformat()
        scheduled=timezone.now()
        item=self.item(activity='investment',task_id=self.task.pk,scheduled_at=scheduled,context={'planned_on':today})
        item.refresh_from_db()
        scheduled=item.scheduled_at
        def hold_lock(*args, **kwargs):
            WorldActionRuntime.objects.filter(pk='world').update(token='held', until=timezone.now()+timedelta(minutes=10))
        with patch('system_settings.agent_world.life_runner.plan_items', side_effect=hold_lock), \
             patch('system_settings.agent_world.investment_runner.run_investment_opportunity') as run:
            tick_life(None)
        item.refresh_from_db()
        self.assertEqual(item.status,'pending')
        self.assertEqual(item.scheduled_at, scheduled)
        self.assertFalse(item.record_id)
        self.assertFalse(WorldAction.objects.filter(pk=item.pk).exists())
        run.assert_not_called()

    def test_runner_that_loses_the_world_lock_rolls_the_slot_back(self):
        from .life_runner import tick_life
        today=local_time().date().isoformat()
        item=self.item(activity='investment',task_id=self.task.pk,scheduled_at=timezone.now(),context={'planned_on':today,'execution_started':'stale'})
        item.refresh_from_db()
        scheduled=item.scheduled_at
        WorldActionRuntime.objects.filter(pk='world').update(token='held', until=timezone.now()+timedelta(minutes=10))
        with patch('system_settings.agent_world.life_runner.world_execution_busy', return_value=False), \
             patch('system_settings.agent_world.life_runner.plan_items'):
            tick_life(None)
        item.refresh_from_db()
        self.assertEqual(item.status,'pending')
        self.assertEqual(item.scheduled_at, scheduled)
        self.assertNotIn('execution_started', item.context)
        self.assertFalse(item.record_id)
        self.assertFalse(WorldAction.objects.exists())
        self.assertFalse(AgentRunRecord.objects.exists())



@override_settings(USE_TZ=True)
class LifeMarketTests(TestCase):
    def setUp(self):
        SystemSetting.objects.create(key='system_mcp_config',value={'enabled':True})
        self.agent=Agent.objects.create(name='buyer',money=10000)
        LifeConfig.objects.create(pk='owner',migrated=True,settings={**DEFAULTS,'agent_ids':[self.agent.pk,'b','c','d']})
        LifeProfile.objects.create(pk=self.agent.pk,owner_id='owner')

    def test_hourly_slots_and_two_grids_across_sessions(self):
        batch=current_batch('owner')
        self.assertEqual(len(batch.slots),8)
        batch.slots=[{'id':str(i),'sku':'seed.radish','name':'重复种子','kind':'seed','price':'1','initial_quantity':3,'remaining_quantity':3} for i in range(8)];batch.save()
        first=enter('owner',self.agent,'first')
        for i in (0,1):trade(first,self.agent,'buy'+str(i),{'kind':'buy_shop','batch_id':batch.pk,'slot_id':str(i),'quantity':1})
        close_session(first,'离开')
        second=enter('owner',self.agent,'second')
        with self.assertRaises(ValueError):trade(second,self.agent,'third',{'kind':'buy_shop','batch_id':batch.pk,'slot_id':'2','quantity':1})
        trade(second,self.agent,'repeat',{'kind':'buy_shop','batch_id':batch.pk,'slot_id':'0','quantity':2})
        trade(second,self.agent,'feed',{'kind':'buy_shop','batch_id':batch.pk,'slot_id':'feed','quantity':1})
        batch.refresh_from_db();self.assertEqual(batch.slots[0]['remaining_quantity'],0)


class LifeProposalParsingTests(SimpleTestCase):
    def test_parse_clean_json(self):
        from .life_planner import parse_life_proposal
        res = parse_life_proposal('{"plans": [{"id": "1", "activity": "rest"}]}')
        self.assertEqual(res, {"plans": [{"id": "1", "activity": "rest"}]})

    def test_parse_with_thinking_tags(self):
        from .life_planner import parse_life_proposal
        raw = '<think>I should rest today because stamina is low.</think>\n{"plans": [{"id": "1", "activity": "rest"}]}'
        res = parse_life_proposal(raw)
        self.assertEqual(res, {"plans": [{"id": "1", "activity": "rest"}]})

    def test_parse_with_thinking_and_markdown_fences(self):
        from .life_planner import parse_life_proposal
        raw = '<think>\n规划分析...\n</think>\n```json\n{"plans": [{"id": "1", "activity": "farm"}]}\n```'
        res = parse_life_proposal(raw)
        self.assertEqual(res, {"plans": [{"id": "1", "activity": "farm"}]})

    def test_parse_with_surrounding_commentary(self):
        from .life_planner import parse_life_proposal
        raw = '好的，这是为你规划的活动：\n```json\n{"plans": []}\n```\n祝你今天开心！'
        res = parse_life_proposal(raw)
        self.assertEqual(res, {"plans": []})

    def test_parse_empty_or_thinking_only_raises_friendly_error(self):
        from .life_planner import parse_life_proposal
        with self.assertRaisesMessage(ValueError, '生活规划返回内容为空'):
            parse_life_proposal('')
        with self.assertRaisesMessage(ValueError, '生活规划未返回有效正文'):
            parse_life_proposal('<think>正在思考但是没有生成正文...</think>')

    def test_ask_passes_thinking_disabled_and_strips_thinking(self):
        from unittest.mock import MagicMock, patch
        from .life_planner import ask
        mock_agent = MagicMock()
        mock_agent.name = '菲伦'
        mock_agent.prompt = '冷静专注的魔法使'
        mock_agent.model_id = 'mod_minimax'

        mock_config = {'provider_type': 'MiniMax', 'model_name': 'MiniMax-M3', 'api_key': 'k', 'base_url': 'http://test'}

        with patch('utils.ai_service.AIService.get_client_config_for_model', return_value=mock_config), \
             patch('system_settings.agent_world.life_planner.complete', return_value='<think>思考...</think>{"plans": []}') as mock_complete:
            res = ask(mock_agent, '规划', {})
            self.assertEqual(res, {'plans': []})
            self.assertEqual(mock_complete.call_args.kwargs['extra_body'], {'thinking': {'type': 'disabled'}})

    def test_ask_retries_when_first_attempt_fails(self):
        from unittest.mock import MagicMock, patch
        from .life_planner import ask
        mock_agent = MagicMock()
        mock_agent.name = '菲伦'
        mock_agent.prompt = '冷静'
        mock_agent.model_id = 'mod_minimax'
        mock_config = {'provider_type': 'MiniMax', 'model_name': 'MiniMax-M3'}

        responses = ['invalid json text', '{"plans": [{"id": "1", "activity": "rest"}]}']
        with patch('utils.ai_service.AIService.get_client_config_for_model', return_value=mock_config), \
             patch('system_settings.agent_world.life_planner.complete', side_effect=responses) as mock_complete:
            res = ask(mock_agent, '规划', {})
            self.assertEqual(res, {'plans': [{"id": "1", "activity": "rest"}]})
            self.assertEqual(mock_complete.call_count, 2)
            self.assertIn('【格式修正要求】', mock_complete.call_args_list[1].args[1])




@override_settings(USE_TZ=True)
class LifeWeekScheduleTests(TestCase):
    def setUp(self):
        user = User.objects.create_user('admin', password='week-test', is_superuser=True)
        self.client = APIClient()
        self.client.force_authenticate(user)
        self.start = datetime(2026, 10, 5, tzinfo=SHANGHAI)
        LifeItem.objects.bulk_create([
            LifeItem(id=f'week-{i}', owner_id='admin', actor_id='a' if i % 2 else 'b',
                     original_at=self.start, scheduled_at=self.start+timedelta(days=i//27, minutes=i%27),
                     activity='rest', status='completed' if i % 3 else 'pending')
            for i in range(135)
        ])
        for identity, owner, at in [('foreign', 'someone-else', self.start),
                                    ('next-week', 'admin', self.start+timedelta(days=7))]:
            LifeItem.objects.create(id=identity, owner_id=owner, actor_id='a',
                                    original_at=at, scheduled_at=at)
        self.params = {'start': '2026-10-05', 'end': '2026-10-12'}
        self.url = '/api/settings/agent-world/life/schedule/'

    def test_week_returns_every_day_even_above_page_limit(self):
        response = self.client.get(self.url, {**self.params, 'view': 'week', 'page': 2})
        self.assertEqual(response.status_code, 200)
        data = response.data['data']
        self.assertEqual(data['total'], 135)
        self.assertEqual(len(data['items']), 135)
        self.assertEqual(data['page'], 1)
        ids = {row['id'] for row in data['items']}
        self.assertIn('week-134', ids)
        self.assertNotIn('foreign', ids)
        self.assertNotIn('next-week', ids)
        per_day = Counter(row['scheduled_at'][:10] for row in data['items'])
        self.assertEqual(per_day['2026-10-09'], 27)
        self.assertEqual(list(per_day.values()), [27]*5)

    def test_week_filters_and_empty_week(self):
        response = self.client.get(self.url, {**self.params, 'view': 'week', 'actor_id': 'a', 'status': 'completed'})
        rows = response.data['data']['items']
        self.assertTrue(rows)
        self.assertTrue(all(r['actor_id'] == 'a' and r['status'] == 'completed' for r in rows))
        empty = self.client.get(self.url, {'view': 'week', 'start': '2026-10-19', 'end': '2026-10-26'})
        self.assertEqual(empty.data['data']['items'], [])
        self.assertEqual(empty.data['data']['total'], 0)

    def test_list_keeps_pagination_and_week_rejects_large_range(self):
        first = self.client.get(self.url, self.params).data['data']
        second = self.client.get(self.url, {**self.params, 'view': 'list', 'page': 2}).data['data']
        self.assertEqual(len(first['items']), 100)
        self.assertEqual(len(second['items']), 35)
        self.assertEqual(second['page'], 2)
        rejected = self.client.get(self.url, {**self.params, 'view': 'week', 'end': '2026-10-13'})
        self.assertEqual(rejected.status_code, 400)
