"""Validate research lineage and budgets without restoring local permissions."""
import re
from quant.models import ResearchCampaign, ResearchRound, ResearchEvaluation, ResearchOutcome
from quant.research.contracts import digest
from quant.experiments.search import SUPPORTED_VERSIONS
from .contracts import validate_plan
from .services import REASONS


def validate_campaigns(rows, anthologies, fail):
    campaigns, rounds, evaluations, outcomes = (rows.get('quant.' + name, {}) for name in
        ('researchcampaign', 'researchround', 'researchevaluation', 'researchoutcome'))
    requests = rows.get('quant.experimentrequest', {})
    proposals = rows.get('quant.experimentproposal', {})
    runs = rows.get('quant.airun', {})
    datasets = rows.get('quant.marketdataset', {})
    results = rows.get('quant.experimentresult', {})
    grouped = {identity: [] for identity in campaigns}
    review_by_step, outcome_by_campaign, used_requests, used_runs = {}, {}, set(), set()
    for identity, step in rounds.items():
        parent, request_id, ordinal = str(step.get('campaign')), str(step.get('experiment')), step.get('ordinal')
        if parent not in campaigns or request_id not in requests or request_id in used_requests or type(ordinal) is not int or not 1 <= ordinal <= 5:
            fail('连续研究轮次归属或序号无效')
        if identity != digest(['research-round-v1', parent, ordinal])[:40]:
            fail('连续研究轮次身份无效')
        grouped[parent].append((identity, step)); used_requests.add(request_id)
    for identity, evaluation in evaluations.items():
        step_id, run_id = str(evaluation.get('round')), str(evaluation.get('run'))
        if step_id not in rounds or run_id not in runs or step_id in review_by_step or run_id in used_runs:
            fail('连续研究解读重复或缺失')
        step, run = rounds[step_id], runs[run_id]
        campaign = campaigns[str(step['campaign'])]
        if identity != digest(['research-evaluation-v1', step_id])[:40] or run.get('kind') != 'experiment_review' or run.get('review_version') not in (2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15) or run.get('validation_result'):
            fail('连续研究解读身份或版本无效')
        if (results.get(str(run.get('experiment_result')), {}).get('request') != step['experiment']
                or results.get(str(run.get('experiment_result')), {}).get('data', {}).get('status') != 'completed'
                or str(run.get('model_id')) != campaign['plan']['model_id']
                or run.get('request_key') != digest(['campaign-review-v1', str(step['campaign']), step['ordinal']])[:40]):
            fail('连续研究解读不对应本轮结果或固定模型')
        review_by_step[step_id] = run; used_runs.add(run_id)
    for identity, outcome in outcomes.items():
        parent, data = str(outcome.get('campaign')), outcome.get('data')
        if parent not in campaigns or parent in outcome_by_campaign or not isinstance(data, dict):
            fail('连续研究终态归属无效')
        if identity != digest(['research-outcome-v1', parent])[:40] or outcome.get('content_hash') != digest(data):
            fail('连续研究终态身份或哈希无效')
        if set(data) != {'version', 'status', 'reason', 'message', 'round_count', 'independent_validation_proven'} or type(data['version']) is not int or data['version'] != 1:
            fail('连续研究终态字段无效')
        reason = data['reason']
        status = 'completed' if reason in ('round_budget', 'model_stop') else 'cancelled' if reason == 'cancelled' else 'interrupted' if reason == 'interrupted' else 'stopped'
        if reason not in REASONS or data['status'] != status or data['message'] != REASONS[reason] or data['independent_validation_proven'] is not False or type(data['round_count']) is not int or data['round_count'] != len(grouped[parent]):
            fail('连续研究停止原因或完成轮次无效')
        outcome_by_campaign[parent] = data
    keys = set()
    for identity, campaign in campaigns.items():
        plan = campaign.get('plan'); validate_plan(plan)
        anthology, proposal_id = str(campaign.get('anthology')), str(campaign.get('proposal'))
        collection = anthologies.get(anthology, {})
        if collection.get('type') != 'quant' or collection.get('permission') != 'private' or not collection.get('user_id'):
            fail('连续研究须属于私密量化文集')
        key = campaign.get('request_key')
        if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,64}', key) or (anthology, key) in keys:
            fail('连续研究请求标识无效或重复')
        keys.add((anthology, key))
        if identity != digest(['research-campaign-v1', anthology, key])[:40] or campaign.get('content_hash') != digest(plan) or proposal_id != plan['proposal_id'] or proposal_id not in proposals:
            fail('连续研究身份、方案或哈希不一致')
        run = runs.get(str(proposals[proposal_id].get('run')), {})
        if rows.get('quant.entry', {}).get(str(run.get('entry')), {}).get('anthology') != campaign['anthology']:
            fail('连续研究起点跨文集')
        if any(datasets.get(item, {}).get('anthology') != campaign['anthology'] for item in plan['dataset_ids']):
            fail('连续研究行情归属不完整')
        if proposals[proposal_id]['data']['config']['max_candidates'] > plan['max_attempts'] or proposals[proposal_id]['data']['config']['seconds'] > plan['compute_seconds']:
            fail('连续研究起点超过授权预算')
        steps = sorted(grouped[identity], key=lambda item: item[1]['ordinal'])
        if [step['ordinal'] for _, step in steps] != list(range(1, len(steps) + 1)) or len(steps) > min(plan['max_rounds'], len(plan['dataset_ids'])):
            fail('连续研究轮次不连续或超过授权范围')
        attempts, seconds, next_proposal = 0, 0, proposals[proposal_id]
        for index, (step_id, step) in enumerate(steps):
            request = requests[str(step['experiment'])]
            if index:
                previous_run = review_by_step.get(steps[index - 1][0], {})
                # Locate by immutable run link, not by user-facing text.
                previous_run_id = next((str(row['run']) for row in evaluations.values() if str(row['round']) == steps[index - 1][0]), '')
                next_id = digest(['experiment-proposal-v1', previous_run_id])[:40]
                if previous_run.get('status') != 'completed' or next_id not in proposals:
                    fail('后续研究没有已完成的前轮 AI 方案')
                next_proposal, proposal_id = proposals[next_id], next_id
            if request['plan']['engine_version'] not in SUPPORTED_VERSIONS:
                fail('连续研究实验引擎版本无效')
            expected = {'version': 2, 'engine_version': request['plan']['engine_version'], 'name': next_proposal['data']['name'],
                'dataset_hash': datasets[plan['dataset_ids'][index]]['content_hash'], 'seeds': next_proposal['data']['seeds'],
                'config': next_proposal['data']['config'], 'proposal_id': proposal_id,
                'proposal_hash': next_proposal['content_hash'], 'proposal_adapted': False}
            if request.get('anthology') != campaign['anthology'] or request.get('dataset') != plan['dataset_ids'][index] or request.get('plan') != expected or request.get('request_key') != digest(['campaign-experiment-v1', identity, index + 1])[:40]:
                fail('实际实验偏离连续研究的父代、行情顺序或预算')
            attempts += expected['config']['max_candidates']; seconds += expected['config']['seconds']
        if attempts > plan['max_attempts'] or seconds > plan['compute_seconds']:
            fail('连续研究超过候选或计算预算')
        outcome = outcome_by_campaign.get(identity)
        if outcome and outcome['reason'] in ('attempt_budget', 'compute_budget'):
            next_data = proposals[str(campaign['proposal'])]['data']
            if steps:
                evaluation = next((row for row in evaluations.values() if str(row['round']) == steps[-1][0]), {})
                last = runs.get(str(evaluation.get('run')), {})
                next_record = proposals.get(digest(['experiment-proposal-v1', str(evaluation.get('run'))])[:40])
                if last.get('status') != 'completed' or not next_record:
                    fail('预算停止缺少可执行的下一方案')
                next_data = next_record['data']
            if outcome['reason'] == 'attempt_budget' and attempts + next_data['config']['max_candidates'] <= plan['max_attempts']:
                fail('候选预算停止原因不实')
            if outcome['reason'] == 'compute_budget' and seconds + next_data['config']['seconds'] <= plan['compute_seconds']:
                fail('计算预算停止原因不实')
        if outcome and outcome['reason'] in ('round_budget', 'model_stop', 'datasets_exhausted'):
            last_run = review_by_step.get(steps[-1][0], {}) if steps else {}
            if last_run.get('status') != 'completed':
                fail('连续研究完成原因缺少末轮解读')
            if outcome['reason'] == 'round_budget' and len(steps) != plan['max_rounds']:
                fail('连续研究轮数预算终态不实')
            if outcome['reason'] == 'model_stop' and last_run.get('result', {}).get('proposal') is not None:
                fail('连续研究模型停止原因不实')
            if outcome['reason'] == 'datasets_exhausted' and len(steps) != len(plan['dataset_ids']):
                fail('连续研究行情耗尽原因不实')
    for model in (ResearchCampaign, ResearchRound, ResearchEvaluation, ResearchOutcome):
        records = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=records):
            for field in model.SNAPSHOT_FIELDS:
                source = field[:-3] if field.endswith('_id') else field
                if digest(records[local.pk].get(source)) != digest(getattr(local, field)):
                    fail('已有连续研究事实不可覆盖')
