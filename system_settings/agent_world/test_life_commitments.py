"""Farm batching uses real transactions and isolated database/media test settings."""
import copy
from datetime import datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from system_settings.models import Agent, AgentTask, AIProvider, AIModel, WorldAction, WorldActionRuntime, SystemSetting
from .execution import stamina
from .farm_automation import tick_automation, tend_farm
from .farm_catalog import DEFAULT_RULES
from .farm_models import AgentFarm, FarmOperation
from .farm_service import ensure_farms
from .inventory_stock import add_stock, stock_quantity
from .life_commitments import farm_commitments, require_energy, ResourceProtected
from .life_config import DEFAULTS, ensure_profiles
from .life_models import LifeConfig, LifeItem
from .life_scope import CURRENT
from .life_time import SHANGHAI, local_time, storage_time
from .stamina_settings import SETTING_KEY


NOW = datetime(2026, 10, 23, 8, tzinfo=SHANGHAI)


class FarmCommitmentTests(TestCase):
    def setUp(self):
        self.enterContext(patch('django.utils.timezone.now', return_value=storage_time(NOW)))
        provider = AIProvider.objects.create(name='isolated', base_url='https://example.invalid')
        model = AIModel.objects.create(name='isolated', type='chat', provider=provider)
        self.agent = Agent.objects.create(name='园丁', model=model, money=1000,
                                          created_at=storage_time(NOW - timedelta(days=1)))
        self.task = AgentTask.objects.create(name='农场', task_kind='farm', agent=self.agent,
            agent_ids=[self.agent.pk], enabled=True, farm_config={'owner_id': 'owner'})
        LifeConfig.objects.create(pk='owner', migrated=True, settings={**DEFAULTS, 'agent_ids': [self.agent.pk]})
        ensure_profiles('owner', [self.agent.pk])
        ensure_farms(self.task)
        WorldActionRuntime.objects.create(pk='world', enabled=True, token='world',
                                         until=storage_time(NOW + timedelta(days=1)))
        SystemSetting.objects.create(pk=SETTING_KEY, value=[{
            'effective_at': (NOW - timedelta(days=1)).isoformat(), 'recovery_per_hour': 0}])

    def energy(self, amount):
        WorldAction.objects.update_or_create(pk='prior-consumption', defaults={
            'actor_id': self.agent.pk, 'status': 'success', 'energy_cost': 100 - amount,
            'consumed_at': storage_time(NOW - timedelta(seconds=1))})

    def crops(self, offsets):
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        rule = copy.deepcopy(DEFAULT_RULES['crops']['potato'])
        farm.state['plots'] = [{'id': str(index), 'watered_until': NOW.timestamp() + 86400,
            'crop': {'kind': 'potato', 'grown': rule['growth_seconds'] - seconds,
                     'checked_at': NOW.timestamp(), 'planted_at': NOW.timestamp() - rule['growth_seconds'],
                     'rules': rule}} for index, seconds in enumerate(offsets)]
        farm.save(update_fields=['state'])

    def animals(self, count):
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        rule = copy.deepcopy(DEFAULT_RULES['animals']['chicken'])
        farm.state['animals'] = [{'id': f'hen-{index}', 'kind': 'chicken', 'building': 'coop',
            'half_hearts': 0, 'fed_until': NOW.timestamp(), 'cycle': {'number': 1,
                'grown': rule['period_seconds'], 'checked_at': NOW.timestamp(), 'rules': rule,
                'result': {'quality': 'normal', 'quantity': 1, 'completed_at': NOW.timestamp(), 'half_hearts': 0}}}
            for index in range(count)]
        farm.save(update_fields=['state'])

    def queue(self, starts_at=NOW):
        farm = AgentFarm.objects.get(pk=self.agent.pk)
        farm.state['planting_plans'] = {'queue': {'status': 'pending', 'starts_at': starts_at.timestamp(),
            'cutoff': (NOW + timedelta(hours=8)).timestamp(), 'progress': {},
            'entries': [{'id': 'potato', 'sku': 'seed.potato', 'quantity': 4, 'fertilizer_mode': 'none'}]}}
        farm.save(update_fields=['state'])
        add_stock(self.agent.pk, 'owner', self.agent.name, 'seed.potato', 4, '土豆种子', 'seed', 20)

    def test_background_queue_harvests_four_mature_plots_with_two_energy(self):
        self.crops([0] * 4)
        self.energy(2)
        self.assertIsNone(CURRENT.get())  # The background poll has no main-schedule exemption.
        tick_automation('world')
        operation = FarmOperation.objects.get(operation__kind='harvest')
        self.assertEqual(len(operation.operation['targets']), 4)
        self.assertEqual(stock_quantity(self.agent.pk, 'owner', 'crop.potato'), 8)
        self.assertEqual(stamina(self.agent), 0)
        self.assertFalse(any(plot['crop'] for plot in AgentFarm.objects.get(pk=self.agent.pk).state['plots']))

    def test_five_mature_plots_reserve_and_consume_two_batches(self):
        self.crops([0] * 5)
        self.assertEqual(sum(row.energy for row in farm_commitments('owner', self.agent.pk, NOW)), 4)
        self.energy(2)
        with self.assertRaises(ResourceProtected):
            require_energy('owner', self.agent, 2, farm_operation={'kind': 'harvest', 'targets': ['0', '1', '2', '3']})
        self.energy(4)
        tick_automation('world')
        self.assertEqual(sorted(len(row.operation['targets']) for row in FarmOperation.objects.all()), [1, 4])
        self.assertEqual(stamina(self.agent), 0)

    def test_separate_maturity_times_keep_future_harvest_reserved(self):
        self.crops([0, 0, 1800, 1800])
        rows = farm_commitments('owner', self.agent.pk, NOW)
        self.assertEqual([(local_time(row.at), row.energy) for row in rows],
                         [(NOW, Decimal(2)), (NOW + timedelta(minutes=30), Decimal(2))])
        self.energy(2)
        operation = {'kind': 'harvest', 'targets': ['0', '1']}
        with self.assertRaises(ResourceProtected):
            require_energy('owner', self.agent, 2, farm_operation=operation)
        setting = SystemSetting.objects.get(pk=SETTING_KEY)
        setting.value.append({'effective_at': NOW.isoformat(), 'recovery_per_hour': 4})
        setting.save()
        require_energy('owner', self.agent, 2, farm_operation=operation)

    def test_collect_batches_animals_and_preserves_other_ready_targets(self):
        self.animals(4)
        self.energy(2)
        from system_settings.models import AgentExecutionLease
        AgentExecutionLease.objects.create(agent=self.agent, token='agent', until=storage_time(NOW + timedelta(days=1)))
        tend_farm(self.agent.pk, 'world', 'agent', self.task, storage_time(NOW), force=True)
        self.assertEqual(len(FarmOperation.objects.get(operation__kind='collect').operation['targets']), 4)
        self.assertEqual(stock_quantity(self.agent.pk, 'owner', 'product.chicken.normal'), 4)
        self.assertEqual(stamina(self.agent), 0)
        self.animals(5)
        rows = farm_commitments('owner', self.agent.pk, NOW, operation={'kind': 'collect', 'targets': ['hen-0']})
        self.assertEqual(sum(row.energy for row in rows), 2)
        self.crops([0] * 4)
        self.energy(2)
        with self.assertRaises(ResourceProtected):
            require_energy('owner', self.agent, 2, farm_operation={'kind': 'harvest', 'targets': ['0', '1', '2', '3']})

    def test_harvest_still_protects_later_main_schedule(self):
        self.crops([0] * 4)
        LifeItem.objects.create(pk='publish-later', owner_id='owner', actor_id=self.agent.pk,
            activity='post_publish', original_at=storage_time(NOW + timedelta(hours=1)),
            scheduled_at=storage_time(NOW + timedelta(hours=1)))
        self.energy(20)
        tick_automation('world')
        self.assertFalse(FarmOperation.objects.exists())
        self.energy(22)
        with patch('django.utils.timezone.now', return_value=storage_time(NOW + timedelta(minutes=30))):
            tick_automation('world')
        self.assertEqual(FarmOperation.objects.filter(operation__kind='harvest').count(), 1)
        self.assertEqual(stamina(self.agent, storage_time(NOW + timedelta(minutes=30))), 20)

    def test_only_due_planting_cost_is_replaced_by_current_plant(self):
        self.queue()
        self.energy(4)
        require_energy('owner', self.agent, 2, farm_operation={'kind': 'plant', 'targets': ['0', '1', '2', '3']})
        for kind in ('water', 'harvest', 'collect', 'fertilize'):
            with self.subTest(kind=kind), self.assertRaises(ResourceProtected):
                require_energy('owner', self.agent, 2, farm_operation={'kind': kind, 'targets': ['0']})

    def test_current_plant_cannot_credit_a_future_planting_batch(self):
        self.queue(NOW + timedelta(hours=1))
        self.energy(4)
        with self.assertRaises(ResourceProtected):
            require_energy('owner', self.agent, 2, farm_operation={'kind': 'plant', 'targets': ['0']})
