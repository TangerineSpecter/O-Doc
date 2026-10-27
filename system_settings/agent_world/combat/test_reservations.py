"""All databases are Django test databases; all model decisions are fakes."""
import json
from datetime import timedelta
from unittest.mock import patch
from django.test import SimpleTestCase, TestCase
from django.core import serializers
from .reservation_matching import match, voted_duration
from .reservation_resources import quota_remaining
from .reservation_models import AdventurePlanningDay, AdventureReservation
from .reservation_planning import day_for, save_intent, finalize
from .reservation_execution import tick, cancel
from .models import CombatProfile, CombatConfig, Exploration
from ..life_models import LifeItem, LifeProfile, LifeConfig
from ..life_time import local_time, storage_time


class MatchingTests(SimpleTestCase):
    def test_balanced_two_to_nine_and_stable(self):
        now = local_time()
        for n in range(1, 10):
            rows = [{'actor_id':str(i),'job_id':str(i%3),'duration_seconds':1800} for i in range(n)]
            result = match(rows, lambda group, duration:now)
            self.assertEqual(sum(len(g['members']) for g in result), n if n>1 else 0)
            self.assertTrue(all(2<=len(g['members'])<=4 for g in result))
            if n==6:self.assertEqual(sorted(len(g['members']) for g in result),[3,3])
            self.assertEqual(result,match(list(reversed(rows)), lambda group,duration:now))

    def test_vote_fallback_and_repair_incompatible_initial_teams(self):
        rows = [{'actor_id':str(i),'job_id':str(i%2),'duration_seconds':7200 if i<2 else 1800} for i in range(4)]
        self.assertEqual(voted_duration(rows),1800)
        now=local_time()
        def feasible(group, duration):
            return now if duration==1800 and {m['actor_id'] for m in group} in ({'0','2'},{'1','3'}) else None
        groups=match(rows,feasible)
        self.assertEqual(len(groups),2)
        self.assertEqual({g['duration_seconds'] for g in groups},{1800})


class ReservationTests(TestCase):
    def setUp(self):
        from system_settings.models import AIProvider, AIModel, Agent, AgentTask, WorldActionRuntime
        from .store import install
        from .profiles import ensure
        provider=AIProvider.objects.create(name='reservation-fake',type='OpenAi',base_url='https://example.invalid')
        model=AIModel.objects.create(name='fake',type='chat',provider=provider)
        self.agents=[Agent.objects.create(name='预约'+str(i),model=model) for i in range(3)]
        self.now=local_time().replace(hour=9,minute=0,second=0,microsecond=0)
        install()
        self.config=LifeConfig.objects.create(pk='admin',settings={'agent_ids':[a.pk for a in self.agents], 'active_start':'00:00','active_end':'24:00'})
        self.task=AgentTask.objects.create(task_kind='exploration',name='探索',agent=self.agents[0],agent_ids=[a.pk for a in self.agents],exploration_config={'owner_id':'admin'},enabled=True)
        WorldActionRuntime.objects.update_or_create(pk='world',defaults={'enabled':True})
        for agent in self.agents:
            LifeProfile.objects.create(pk=agent.pk,owner_id='admin')
            ensure('admin',agent,storage_time(self.now))
        CombatConfig.objects.update_or_create(pk='admin',defaults={'daily_minutes':200})
        self.day=day_for(self.config,self.now.date())
        for agent in self.agents[:2]:
            save_intent(self.config,agent,self.now.date(),{'participate':True,'reason':'一起探索','dungeon_id':'dungeon.sprout_meadow','duration_seconds':7200},[{'id':'dungeon.sprout_meadow'}])

    def book(self):
        finalize(self.day.pk,self.config,self.now)
        return AdventureReservation.objects.get()

    def test_quota_reservation_cancel_and_no_main_count(self):
        row=self.book()
        from ..life_activities import main_items,source
        self.assertEqual(main_items(LifeItem.objects.all()).count(),0)
        item=LifeItem.objects.first();self.assertEqual(source(item),'reservation')
        profile=CombatProfile.objects.get(pk=item.actor_id)
        self.assertEqual(quota_remaining(profile,self.now.date()),80*60)
        profile.loot_progress['days']={str(self.now.date()):60*60};profile.save()
        self.assertEqual(quota_remaining(profile,self.now.date()),20*60)
        self.assertEqual(quota_remaining(profile,self.now.date(),exclude_item=item.pk),140*60)
        with patch('system_settings.agent_world.combat.reservation_execution.explorations.finish'):
            cancel(row,'取消',now=self.now)
        self.assertEqual(quota_remaining(profile,self.now.date()),140*60)

    def test_common_departure_has_two_person_first_wave_and_no_duplicate(self):
        row=self.book()
        tick(self.config,self.now)
        row.refresh_from_db()
        self.assertEqual(Exploration.objects.count(),2)
        for run in Exploration.objects.all():
            run.phase='waiting_reservation'
            run.snapshot['prepared_plan']={'dungeon_id':row.dungeon_id,'duration_seconds':7200,'style_id':'style.balanced','equipment':{},'purchases':{},'potions':{},'food':None}
            run.save()
        tick(self.config,local_time(row.starts_at))
        row.refresh_from_db();self.assertEqual(row.status,'active')
        from .party_models import AdventureWave
        wave=AdventureWave.objects.get()
        self.assertEqual(wave.snapshot['count'],2)
        self.assertEqual(Exploration.objects.filter(status='active').count(),2)
        tick(self.config,local_time(row.starts_at))
        self.assertEqual(AdventureWave.objects.count(),1)
        for run in Exploration.objects.all():
            profile=CombatProfile.objects.get(pk=run.actor_id)
            self.assertEqual(quota_remaining(profile,self.now.date()),80*60)

    def test_incomplete_member_cancels_without_departure(self):
        row=self.book();tick(self.config,self.now)
        tick(self.config,local_time(row.starts_at))
        row.refresh_from_db();self.assertEqual(row.status,'cancelled')
        self.assertFalse(Exploration.objects.filter(status='active').exists())
        for item in LifeItem.objects.filter(context__adventure_reservation_id=row.pk):
            self.assertIn('就绪成员不足两人',item.result['reason'])
            self.assertIn('预约准备未完成或已错过可参与时间',item.result['reason'])

    def test_prepare_failure_reason_survives_team_cancellation(self):
        row=self.book()
        with patch('system_settings.agent_world.combat.reservation_execution.prepare_member', side_effect=ValueError('准备失败：体力不足')):
            tick(self.config,self.now)
        tick(self.config,local_time(row.starts_at))
        row.refresh_from_db();self.assertEqual(row.status,'cancelled')
        for item in LifeItem.objects.filter(context__adventure_reservation_id=row.pk):
            self.assertIn('就绪成员不足两人',item.result['reason'])
            self.assertIn('准备失败：体力不足',item.result['reason'])

    def test_snapshot_missing_member_and_revision_fork_rejected(self):
        row=self.book()
        from .reservation_sync import validate_snapshot
        from utils.sync_manager import SyncError
        data=json.loads(serializers.serialize('json',[*AdventurePlanningDay.objects.all(),row,*LifeItem.objects.all()]))
        validate_snapshot(data)
        bad=[r for r in data if r['model']!='system_settings.lifeitem' or r['pk']!=LifeItem.objects.first().pk]
        with self.assertRaises(SyncError):validate_snapshot(bad)
        for r in data:
            if r['model']=='system_settings.lifeitem':r['fields']['context']['reservation_revision']+=1;break
        with self.assertRaises(SyncError):validate_snapshot(data)

    def test_full_snapshot_repeat_restore_does_not_grant_booking_permit(self):
        import copy
        from utils.sync_manager import SyncManager
        from .models import CombatRuntime
        self.book()
        manager=SyncManager()
        source=manager.build_snapshot_data()
        meta=manager.build_snapshot_meta(data_list=source)
        self.assertEqual(meta['combat_schema_version'],17)
        for _ in range(2):
            manager.apply_snapshot_data(copy.deepcopy(source),meta)
            self.assertEqual(AdventureReservation.objects.count(),1)
            self.assertFalse(CombatRuntime.objects.filter(authorized=True).exists())
            self.assertEqual(LifeItem.objects.count(),2)

    def test_first_decision_is_saved_and_retry_does_not_replace_it(self):
        agent=self.agents[0]
        self.day.refresh_from_db()
        original=self.day.snapshot['intents'][agent.pk]
        save_intent(self.config,agent,self.now.date(),{'participate':False,'reason':'后来改变'},[])
        self.day.refresh_from_db()
        self.assertEqual(self.day.snapshot['intents'][agent.pk],original)

    def test_free_activity_window_stops_before_preparation(self):
        row=self.book()
        from ..life_interleaving_candidates import available_window
        self.assertEqual(available_window('admin',self.agents[0].pk,self.now),0)
        self.assertEqual(available_window('admin',self.agents[0].pk,self.now-timedelta(minutes=40)),25*60)
        self.assertEqual(available_window('admin',self.agents[0].pk,local_time(row.starts_at)),0)
        self.assertEqual(available_window('admin',self.agents[0].pk,local_time(row.ends_at)-timedelta(seconds=1)),0)
        self.assertGreater(available_window('admin',self.agents[0].pk,local_time(row.ends_at)),0)

    def test_legacy_recovery_does_not_reschedule_or_pause_appointments(self):
        row=self.book()
        from ..life_schedule import recover
        self.config.paused_agents=[self.agents[0].pk]
        self.config.save()
        recover(self.config, self.now+timedelta(minutes=43))
        for item in LifeItem.objects.filter(context__adventure_reservation_id=row.pk):
            self.assertEqual(local_time(item.scheduled_at),local_time(row.prepare_at))
            self.assertEqual(item.status,'pending')
            self.assertFalse(item.revisions.exists())
        row.refresh_from_db()
        self.assertEqual(row.status,'reserved')

    def test_legacy_displaced_reservations_are_filtered_and_ordered_by_prepare_time(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient
        row = self.book()
        items = list(LifeItem.objects.filter(context__adventure_reservation_id=row.pk))
        for item in items:
            item.scheduled_at = storage_time(local_time(row.prepare_at) + timedelta(days=1))
            item.save(update_fields=['scheduled_at'])
        for index in range(101):
            when = local_time(row.prepare_at) + timedelta(minutes=index + 1)
            LifeItem.objects.create(pk=f'schedule-order-{index:03}', owner_id='admin', actor_id=self.agents[0].pk,
                activity='rest', original_at=storage_time(when), scheduled_at=storage_time(when))
        client = APIClient()
        client.force_authenticate(get_user_model().objects.create_superuser('admin', password='test'))
        day = local_time(row.prepare_at).date()
        url = '/api/settings/agent-world/life/schedule/'
        params = {'start': day.isoformat(), 'end': (day + timedelta(days=1)).isoformat()}
        first = client.get(url, {**params, 'source': 'all', 'page': 1}).data['data']
        second = client.get(url, {**params, 'source': 'all', 'page': 2}).data['data']
        self.assertEqual(first['total'], 103)
        self.assertEqual(first['counts']['reservation'], 2)
        self.assertEqual(first['summary']['total'], 103)
        self.assertEqual({item['id'] for item in first['items'][:2]}, {item.pk for item in items})
        self.assertEqual(len(second['items']), 3)
        for view in ('today', 'week'):
            result = client.get(url, {**params, 'source': 'reservation', 'view': view}).data['data']
            self.assertEqual({item['id'] for item in result['items']}, {item.pk for item in items})
        next_day = client.get(url, {'start': (day + timedelta(days=1)).isoformat(),
                                    'end': (day + timedelta(days=2)).isoformat(), 'source': 'reservation'}).data['data']
        self.assertEqual(next_day['total'], 0)
        self.assertEqual(LifeItem.objects.filter(pk__in=[item.pk for item in items],
            scheduled_at=storage_time(local_time(row.prepare_at) + timedelta(days=1))).count(), 2)

    def test_main_schedule_change_cancels_entire_unstarted_team(self):
        row=self.book()
        from ..life_schedule import revise
        item=LifeItem.objects.create(pk='main-conflict',owner_id='admin',actor_id=self.agents[0].pk,
            activity='rest',original_at=storage_time(self.now),scheduled_at=storage_time(self.now))
        revise(item,'人工重新规划',activity='post_publish')
        row.refresh_from_db();self.assertEqual(row.status,'cancelled')
        self.assertEqual(LifeItem.objects.filter(context__adventure_reservation_id=row.pk,status='cancelled').count(),2)

    def test_prepared_supplies_cannot_be_sold_out_from_under_booking(self):
        row=self.book();tick(self.config,self.now)
        from ..inventory_stock import add_stock,take_stock
        run=Exploration.objects.first();run.phase='waiting_reservation'
        run.snapshot['prepared_plan']={'potions':{'potion.small_red':2}};run.save()
        add_stock(run.actor_id,'admin','测试居民','combat.potion.small_red',3,'红药','material',price=1,operation_id='test-stock')
        take_stock(run.actor_id,'admin','combat.potion.small_red',1)
        with self.assertRaisesMessage(ValueError,'预留'):
            take_stock(run.actor_id,'admin','combat.potion.small_red',1)

    def test_real_preparation_waits_and_snapshot_remains_valid(self):
        row=self.book();tick(self.config,self.now)
        from .preparation import prepare
        from utils.sync_manager import SyncManager
        plan={'dungeon_id':row.dungeon_id,'duration_seconds':7200,'style_id':'style.balanced','equipment':{},'purchases':{},'potions':{},'food':None}
        for run in list(Exploration.objects.all()):
            with patch('system_settings.agent_world.combat.preparation_decision.build_plan',return_value=(plan,{})):
                value=prepare(run.pk)
                self.assertEqual(value.phase,'waiting_reservation')
                self.assertEqual(value.status,'preparing')
        manager=SyncManager()
        source=manager.build_snapshot_data()
        from .sync import validate_source,metadata
        validate_source(source,metadata(source))
        tick(self.config,local_time(row.starts_at))
        source=manager.build_snapshot_data()
        validate_source(source,metadata(source))

    def test_late_departure_keeps_original_deadline(self):
        row=self.book();tick(self.config,self.now)
        for run in Exploration.objects.all():
            run.phase='waiting_reservation'
            run.snapshot['prepared_plan']={'dungeon_id':row.dungeon_id,'duration_seconds':7200,'style_id':'style.balanced','equipment':{},'purchases':{},'potions':{},'food':None}
            run.save()
        tick(self.config,local_time(row.starts_at)+timedelta(seconds=2))
        row.refresh_from_db();self.assertEqual(row.status,'active')
        from .recovery import deadline
        from .party_models import AdventureParty
        self.assertEqual(AdventureParty.objects.get().ends_at,row.ends_at)
        for run in Exploration.objects.all():
            self.assertEqual(deadline(run),local_time(row.ends_at))
            self.assertEqual(run.duration_seconds,7198)

    def test_coordination_waits_until_main_planning_finished(self):
        from .reservation_planning import coordinated
        save_intent(self.config,self.agents[2],self.now.date(),{'participate':False,'reason':'不探索'},[])
        item=LifeItem.objects.create(pk='unplanned-main',owner_id='admin',actor_id=self.agents[0].pk,
            scheduled_at=storage_time(self.now+timedelta(hours=5)),original_at=storage_time(self.now+timedelta(hours=5)))
        self.assertFalse(coordinated(self.config,self.now))
        self.assertEqual(AdventureReservation.objects.count(),0)
        item.activity='rest';item.context={'planned_on':str(self.now.date())};item.save()
        self.assertTrue(coordinated(self.config,self.now))
        self.assertEqual(AdventureReservation.objects.count(),1)
        self.assertTrue(coordinated(self.config,self.now))
        self.assertEqual(AdventureReservation.objects.count(),1)

    def test_expired_unstarted_appointment_is_cancelled_not_completed_exploration(self):
        row=self.book();tick(self.config,self.now)
        from ..life_activity_recovery import recover_exploration
        run=Exploration.objects.first()
        run.phase='waiting_reservation';run.save(update_fields=['phase'])
        recover_exploration(run.pk,local_time(row.ends_at)+timedelta(seconds=6))
        row.refresh_from_db();self.assertEqual(row.status,'cancelled')
        self.assertIn('收尾时本机预约授权有效',row.snapshot['reason'])
        self.assertIn('已建立准备记录 2/2 人，等待出发 1/2 人',row.snapshot['reason'])
        self.assertIn('无法单凭它们确定',row.snapshot['reason'])
        self.assertTrue(all(item.result['reason']==row.snapshot['reason'] for item in LifeItem.objects.filter(context__adventure_reservation_id=row.pk)))
        self.assertFalse(Exploration.objects.filter(status='completed').exists())

    def test_expired_unpermitted_appointment_records_observed_state_without_starting(self):
        from .models import CombatRuntime
        row=self.book()
        CombatRuntime.objects.filter(pk=row.pk).update(authorized=False)
        tick(self.config, local_time(row.starts_at))
        self.assertFalse(Exploration.objects.exists())
        tick(self.config, local_time(row.ends_at))
        row.refresh_from_db()
        self.assertEqual(row.status,'cancelled')
        self.assertIn('收尾时本机预约授权未生效',row.snapshot['reason'])
        self.assertIn('已建立准备记录 0/2 人，等待出发 0/2 人',row.snapshot['reason'])
        reason=row.snapshot['reason']
        tick(self.config, local_time(row.ends_at)+timedelta(minutes=1))
        row.refresh_from_db()
        self.assertEqual(row.snapshot['reason'],reason)
        self.assertFalse(Exploration.objects.exists())
