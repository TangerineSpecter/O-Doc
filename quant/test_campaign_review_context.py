import json
from quant import test_research_campaigns as fixtures
from quant.experiments.campaigns.review_context import requirements
from quant.experiments.campaigns.worker import advance
from quant.experiments.worker import execute as calculate
from quant.models import MarketDataset
from django.test import TestCase


class CampaignReviewContextTests(TestCase):
    setUp = fixtures.ResearchCampaignTests.setUp
    collect = fixtures.ResearchCampaignTests.collect
    publish = fixtures.ResearchCampaignTests.publish
    prepare = fixtures.ResearchCampaignTests.prepare
    start = fixtures.ResearchCampaignTests.start
    ready = fixtures.ResearchCampaignTests.ready
    reviewed = fixtures.ResearchCampaignTests.reviewed
    campaign = fixtures.ResearchCampaignTests.campaign

    def test_pending_review_gets_only_future_metadata_and_remaining_caps(self):
        campaign,job = self.campaign()
        self.assertTrue(advance(job.pk,job.lease_token))
        first = campaign.rounds.get()
        calculate(first.experiment.job.pk)
        self.assertTrue(advance(job.pk,job.lease_token))
        first.refresh_from_db()
        text = first.evaluation.run.requirements
        context = json.loads(text.split('连续研究约束：',1)[1])
        self.assertEqual(context['remaining_rounds'],1)
        self.assertEqual(context['remaining_candidate_budget'],64-first.experiment.plan['config']['max_candidates'])
        self.assertEqual(context['ordered_datasets'][0]['id'],campaign.plan['dataset_ids'][1])
        self.assertEqual(context['ordered_datasets'][0]['symbol'],'SECOND')
        self.assertNotIn('rows',context['ordered_datasets'][0])
        self.assertNotIn('open',text)
        self.assertNotIn('close',text)
        self.assertEqual(context['scope'],'preselected_metadata_only_not_independent_evidence')

    def test_large_metadata_is_omitted_without_truncating_market_identity(self):
        campaign,job = self.campaign()
        row = MarketDataset.objects.get(pk=campaign.plan['dataset_ids'][1])
        data = dict(row.snapshot)
        data.update(symbol='\x01'*300,timeframe='\x02'*300,timezone='\x03'*300,price_adjustment='\x04'*300)
        MarketDataset.objects.filter(pk=row.pk).update(snapshot=data)
        text = requirements(job,[])
        self.assertLessEqual(len(text),8000)
        context = json.loads(text.split('连续研究约束：',1)[1])
        self.assertEqual(context['omitted_for_size'],1)
        self.assertNotIn(row.pk,[item['id'] for item in context['ordered_datasets']])
