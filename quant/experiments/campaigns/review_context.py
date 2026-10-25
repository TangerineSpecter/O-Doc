"""Bounded next-round constraints, without exposing future prices to selection."""
import json
from django.utils import timezone
from quant.models import MarketDataset, ResearchCampaignJob, ResearchRound


def requirements(job: ResearchCampaignJob, rounds: list[ResearchRound]) -> str:
    plan = job.campaign.plan
    remaining_ids = plan['dataset_ids'][len(rounds):]
    datasets = {row.pk:row for row in MarketDataset.objects.filter(
        pk__in=remaining_ids,anthology_id=job.campaign.anthology_id).only('id','snapshot')}
    context = {'remaining_rounds':max(0,plan['max_rounds']-len(rounds)),
        'remaining_candidate_budget':max(0,plan['max_attempts']-sum(r.experiment.plan['config']['max_candidates'] for r in rounds)),
        'remaining_compute_seconds':max(0,plan['compute_seconds']-sum(r.experiment.plan['config']['seconds'] for r in rounds)),
        'remaining_wall_seconds':max(0,int((job.deadline-timezone.now()).total_seconds())),
        'ordered_datasets':[],'unavailable_ids':[],'omitted_for_size':0,
        'scope':'preselected_metadata_only_not_independent_evidence'}
    for identity in remaining_ids:
        row = datasets.get(identity)
        if row is None:
            context['unavailable_ids'].append(identity)
            continue
        data = row.snapshot
        item = {'id':identity,**{key:data[key] for key in ('symbol','timeframe','timezone','price_adjustment')},
                'row_count':len(data['rows']),'start':data['rows'][0]['timestamp'],'end':data['rows'][-1]['timestamp']}
        context['ordered_datasets'].append(item)
        if len(json.dumps(context,ensure_ascii=False)) > 6000:
            context['ordered_datasets'].pop()
            context['omitted_for_size'] += 1
    return ('这是有预算的连续研究。后续方案应考虑本轮失败与参数稳定性；无合理新假设时 proposal=null。'
        '已看过的行情不能声称独立验证。以下为剩余总预算和按顺序预选的后续行情元信息，不含价格，'
        '不是收益证据、独立性审计或来源指令，不能放进 evidence_refs。'
        '下一可执行方案应匹配下一份可用行情的标的/周期/长度和剩余预算；'
        '不能默认已取得未列出的市场数据，元信息省略或不可用时保留未知。'
        '无后续轮数、预算不足或无匹配数据时 proposal=null 并说明原因，仍返回完整解读合同。'
        '\n连续研究约束：'+json.dumps(context,ensure_ascii=False))
