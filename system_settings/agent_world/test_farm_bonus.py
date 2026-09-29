"""真实收获事务和隔离快照验证，不使用外部服务或用户数据库。"""
import copy
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, SimpleTestCase
from . import test_farm
from .farm_bonus import calculate_yield
from .farm_catalog import DEFAULT_RULES
from .farm_models import AgentFarm, FarmOperation
from .farm_service import stock
from .models import WorldProfession


class YieldCalculationTests(SimpleTestCase):
    def test_exact_fraction_and_multiple_base_units(self):
        remainder='0'
        quantities=[]
        for _ in range(5):
            quantity,remainder=calculate_yield(1,'20',remainder)
            quantities.append(quantity)
        self.assertEqual(quantities,[1,1,1,1,2])
        self.assertEqual(Decimal(remainder),0)
        self.assertEqual(calculate_yield(3,'50','0.8'),(5,'0.3'))
        self.assertEqual(calculate_yield(1,'0.0001','0.999999'),(2,'0.000000'))

    def test_invalid_basis(self):
        for base,percent,remainder in [(0,'20','0'),(1,'-1','0'),(1,'nan','0'),(1,'20','1'),(1,'20','-0.1')]:
            with self.subTest(base=base,percentage=percent,remainder=remainder),self.assertRaises(ValueError):
                calculate_yield(base,percent,remainder)


class FarmBonusTests(TestCase):
    setUp=test_farm.FarmTests.setUp
    op=test_farm.FarmTests.op
    state=test_farm.FarmTests.state

    def farmer(self):
        profession=WorldProfession.objects.get(pk='profession:farmer')
        self.agent.profession=profession
        self.agent.save(update_fields=['profession'])
        return profession

    def ready(self,kind='chicken',quality='normal',quantity=1):
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        rule=copy.deepcopy(DEFAULT_RULES['animals'][kind])
        farm.state['animals']=[{'id':'animal','kind':kind,'building':rule['building'],'half_hearts':10,'fed_until':self.now.timestamp()+1000,
            'cycle':{'number':1,'grown':rule['period_seconds'],'checked_at':self.now.timestamp(),'rules':rule,
                     'result':{'quality':quality,'quantity':quantity,'half_hearts':10,'completed_at':self.now.timestamp()}}}]
        farm.save(update_fields=['state'])

    def test_five_eggs_and_idempotent_collection(self):
        self.farmer()
        for i in range(5):
            self.ready()
            result=self.op('collect',targets=['animal'],key=f'eggs{i}')
            repeated=self.op('collect',targets=['animal'],key=f'eggs{i}')
            self.assertEqual(result.pk,repeated.pk)
            self.assertEqual(result.result['products'][0]['quantity'],2 if i==4 else 1)
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        self.assertEqual(stock(farm,'product.chicken.normal').quantity,6)
        self.assertEqual(farm.state['yield_remainders'],{})
        self.assertEqual(FarmOperation.objects.count(),5)

    def test_all_animal_types_and_quality_are_separate(self):
        self.farmer()
        for kind,quality in [('chicken','normal'),('cow','normal'),('sheep','normal'),('chicken','gold')]:
            self.ready(kind,quality)
            self.op('collect',targets=['animal'])
        self.assertEqual({k:Decimal(v) for k,v in self.state()['yield_remainders'].items()},
            {f'product.{kind}.{quality}':Decimal('.2') for kind,quality in [('chicken','normal'),('cow','normal'),('sheep','normal'),('chicken','gold')]})

    def test_crops_have_their_own_remainder(self):
        self.farmer()
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        for i,kind in enumerate(('radish','potato','corn')):
            rules=copy.deepcopy(DEFAULT_RULES['crops'][kind])
            farm.state['plots'][i]['crop']={'kind':kind,'grown':rules['growth_seconds'],'checked_at':self.now.timestamp(),'rules':rules}
        farm.save(update_fields=['state'])
        result=self.op('harvest',targets=['0','1','2'])
        self.assertEqual([p['base_quantity'] for p in result.result['production_bonus']],[1,2,3])
        self.assertEqual({k:Decimal(v) for k,v in self.state()['yield_remainders'].items()},
            {'crop.radish':Decimal('.2'),'crop.potato':Decimal('.4'),'crop.corn':Decimal('.6')})

    def test_disabled_and_changed_profession_preserve_earned_remainder(self):
        profession=self.farmer()
        self.ready();self.op('collect',targets=['animal'])
        profession.enabled=False;profession.save(update_fields=['enabled'])
        self.ready();result=self.op('collect',targets=['animal'])
        self.assertEqual(result.result['production_bonus'][0]['percentage'],'0')
        self.assertEqual(Decimal(self.state()['yield_remainders']['product.chicken.normal']),Decimal('.2'))
        self.agent.profession=WorldProfession.objects.create(name='畜牧员',farm_yield_percentage='80')
        self.agent.save(update_fields=['profession'])
        self.ready();result=self.op('collect',targets=['animal'])
        self.assertEqual(result.result['products'][0]['quantity'],2)

    def test_resident_isolation_and_purchase_does_not_accumulate(self):
        from system_settings.models import Agent, AgentTask
        from .farm_service import ensure_farms
        self.farmer();self.ready();self.op('collect',targets=['animal'])
        other=Agent.objects.create(name='另一农民',model=self.agent.model,profession=self.agent.profession)
        task=AgentTask.objects.create(name='另一农场',task_kind='farm',agent=other,agent_ids=[other.pk],farm_config={'owner_id':'admin'},enabled=True)
        ensure_farms(task)
        self.assertNotIn('yield_remainders',AgentFarm.objects.get(pk=other.pk).state)
        before=copy.deepcopy(self.state()['yield_remainders'])
        self.op('buy_supply',sku='feed',quantity=2)
        self.assertEqual(self.state()['yield_remainders'],before)

    def test_extra_units_keep_original_unit_price(self):
        from .inventory_stock import take_stock
        self.farmer()
        for _ in range(5):
            self.ready();self.op('collect',targets=['animal'])
        farm=AgentFarm.objects.get(pk=self.agent.pk)
        self.assertEqual(stock(farm,'product.chicken.normal').quantity,6)
        self.assertEqual(take_stock(farm.pk,farm.owner_id,'product.chicken.normal',6),Decimal(DEFAULT_RULES['animals']['chicken']['sale_price'])*6)

    def test_failed_inventory_write_rolls_back_remainder_and_collection(self):
        self.farmer();self.ready()
        before=copy.deepcopy(self.state())
        with patch('system_settings.agent_world.inventory_stock.add_stock',side_effect=ValueError('write failure')):
            with self.assertRaises(ValueError):self.op('collect',targets=['animal'])
        self.assertEqual(self.state(),before)
        self.assertFalse(FarmOperation.objects.exists())

    def test_snapshot_preserves_progress_and_rejects_missing_basis(self):
        from utils.sync_manager import SyncManager, SyncError
        self.farmer();self.ready();self.op('collect',targets=['animal'])
        manager=SyncManager();snapshot=manager.build_snapshot_data()
        manager.apply_snapshot_data(copy.deepcopy(snapshot))
        self.assertEqual(Decimal(self.state()['yield_remainders']['product.chicken.normal']),Decimal('.2'))
        self.assertEqual(stock(AgentFarm.objects.get(pk=self.agent.pk),'product.chicken.normal').quantity,1)
        for item in snapshot:
            if item['model']=='system_settings.farmoperation':
                item['fields']['result'].pop('production_bonus')
        with self.assertRaises(SyncError):manager.apply_snapshot_data(snapshot)
        self.assertEqual(Decimal(self.state()['yield_remainders']['product.chicken.normal']),Decimal('.2'))

    def test_profession_api_and_readonly_farm_display(self):
        from .serializers import ProfessionSerializer
        self.farmer();self.ready();self.op('collect',targets=['animal'])
        response=self.client.get(f'/api/settings/agent-world/farms/{self.agent.pk}/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(Decimal(response.data['data']['farm_bonus']['percentage']),20)
        self.assertEqual(Decimal(response.data['data']['state']['yield_remainders']['product.chicken.normal']),Decimal('.2'))
        serializer=ProfessionSerializer(data={'name':'两类职业','enabled':True,'bonuses':[],'farm_yield_percentage':'-1'})
        self.assertFalse(serializer.is_valid())
        self.assertIn('farm_yield_percentage',serializer.errors)
