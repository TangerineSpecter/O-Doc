"""Graph research views from existing immutable assets; no publication or execution."""
import json
from quant.models import ExperimentProposal, ExperimentResult, FactorEvidenceLink, ResearchReport, SourceRevision
from quant.research.contracts import digest
from quant.research_memory.contract import instant
from quant.experiments.combination import analyze
from . import research_contract as contract

LIMIT = 6
SCAN = 12
PROPOSAL_SCAN = 200
LABELS = {'supports': '支持本样本对照规则', 'counterexample': '本样本反例', 'unknown': '组合证据不足', 'mixed': '跨窗分歧或缺测'}


def emit(nodes, edges, center, identity, kind, label, relation, payload, *, report=None, request_id=None):
    nodes.append({'id': identity, 'kind': kind, 'label': label,
        'entry_id': report.entry_id if report else center.report.entry_id, 'report_id': report.pk if report else ''})
    incoming = relation in ('reported_support', 'reported_counterexample')
    details = {'combination_observation': '全部计划验证窗口按同一事后描述规则比较两个直接父代与组合；留出不参与，也不晋升实证等级。',
        'combination_hypothesis': 'AI提出的多父代组合假设，保留原参数、否证条件和新数据要求；不是已执行或已验证结论。',
        'scenario_hypothesis': '来源AI原稿的用途与条件描述；只是来源上下文，尚未验证当前因子的适用情景或条件可得时点。',
        'feedback_assessment': 'AI依据用户反馈中的逐字引文形成的主张；平台与参数仍需核对，不是可复现计算或盈利认证。'}
    edges.append({'id': 'research:' + identity, 'from': identity if incoming else f'factor:{center.pk}',
        'to': f'factor:{center.pk}' if incoming else identity, 'kind': relation, 'label': label,
        'historical': False, 'similarity': None, 'request_id': request_id,
        'detail': details[payload['kind']], 'research_json': json.dumps(payload, ensure_ascii=False, allow_nan=False)})


def _origin(kind, record, report=None):
    value = {'kind': kind, 'id': record.pk, 'content_hash': record.content_hash,
        'created_at': instant(record.created_at.isoformat()).isoformat()}
    if report:
        value.update(report_id=report.pk, report_hash=report.content_hash)
    return value


def append_proposals(collection, center, available, selected, nodes, edges):
    records = list(ExperimentProposal.objects.filter(run__entry__anthology=collection, run__entry__is_valid=True)
        .select_related('run__report', 'run__entry').order_by('-created_at', 'id')[:PROPOSAL_SCAN + 1])
    count = 0; limited = len(records) > PROPOSAL_SCAN
    for record in records[:PROPOSAL_SCAN]:
        seeds = record.data['seeds']
        if len(seeds) < 2 or not any(seed['id'] == center.pk and digest(seed['candidate']) == digest(center.data) for seed in seeds):
            continue
        if count >= LIMIT:
            limited = True; continue
        count += 1
        for candidate in available.filter(pk__in=[row['id'] for row in seeds]):
            if candidate.pk not in selected and len(selected) >= 21:
                limited = True; continue
            selected[candidate.pk] = candidate
        report = getattr(record.run, 'report', None)
        payload = contract.proposal(center.pk, center.data, record.data, _origin('proposal', record, report))
        emit(nodes, edges, center, f'hypothesis:{record.pk}', 'hypothesis', record.data['name'],
            'complement_hypothesis', payload, report=report)
    return limited


def _matches(identity, center, by_id, checkpoint_ids):
    """Only the exact archived parent or unchanged formula's parameter variants."""
    seen = set()
    while identity in by_id and identity not in seen:
        seen.add(identity); row = by_id[identity]
        if checkpoint_ids.get(identity) == center.derived_checkpoint_id and center.derived_checkpoint_id:
            return True
        if row['operation'] == 'source_candidate':
            return row['parents'] == [center.pk]
        if row['operation'] != 'parameter_variant' or len(row['parents']) != 1:
            return False
        identity = row['parents'][0]
    return False


def append_combinations(collection, center, nodes, edges):
    links = list(FactorEvidenceLink.objects.filter(candidate=center, kind='experiment')
        .order_by('-created_at', 'id')[:SCAN + 1])
    trusted = {row.target_id: row for row in links[:SCAN] if row.data.get('candidate_hash') == digest(center.data)}
    results = ExperimentResult.objects.filter(pk__in=trusted, request__anthology=collection).select_related('request__dataset').order_by('-created_at', 'id')
    count = 0; limited = len(links) > SCAN
    for result in results:
        if trusted[result.pk].data.get('target_hash') != result.content_hash:
            continue
        checkpoints = list(result.request.checkpoints.order_by('ordinal'))
        attempts = [row.attempt for row in checkpoints]; by_id = {row['id']: row for row in attempts}
        ids = {row.attempt['id']: row.pk for row in checkpoints}
        groups = analyze(result.request.plan, attempts)['groups']
        review = ResearchReport.objects.filter(run__experiment_result=result, run__kind='experiment_review').order_by('-created_at', 'id').first()
        for group in groups:
            if not any(_matches(identity, center, by_id, ids) for identity in group['parent_ids']):
                continue
            if count >= LIMIT:
                limited = True; continue
            count += 1
            interpretation = None
            if review:
                row = next((row for row in review.data.get('combination_reviews', []) if row['evidence_ref'] == group['id']), None)
                if row and digest(row.get('facts')) == digest(group):
                    interpretation = {'text': row['text'], 'report_id': review.pk, 'report_hash': review.content_hash}
            market = {key: result.request.dataset.snapshot.get(key) for key in ('symbol', 'timeframe', 'timezone', 'source', 'price_adjustment')}
            payload = contract.combination(center.pk, center.data, result.request.plan, attempts, group,
                market, _origin('experiment_result', result, review), interpretation)
            emit(nodes, edges, center, f'combination-observation:{result.pk}:{group["attempt_id"]}', 'assessment',
                f"{group['attempt_id']} · {LABELS[payload['status']]}", 'combination_' + payload['status'],
                payload, report=review, request_id=result.request_id)
    return limited


def append_feedback(collection, center, nodes, edges):
    links = list(FactorEvidenceLink.objects.filter(candidate=center, kind='feedback')
        .order_by('-created_at', 'id')[:SCAN + 1])
    trusted = {row.target_id: row for row in links[:SCAN] if row.data.get('candidate_hash') == digest(center.data)
        and row.data.get('scope') != 'native_python_analysis_document'}
    sources = {row.pk: row for row in SourceRevision.objects.filter(pk__in=trusted, material__entry__anthology=collection,
        material__entry_id=center.report.entry_id)}
    reports = ResearchReport.objects.filter(source_id__in=sources, run__kind='feedback_review', entry_id=center.report.entry_id).order_by('-created_at', 'id')
    seen = set(); count = 0; limited = len(links) > SCAN
    for report in reports:
        if report.source_id in seen:
            continue
        seen.add(report.source_id); source = sources[report.source_id]
        if trusted[source.pk].data.get('target_hash') != source.content_hash or source.payload.get('factor_id') != center.pk:
            continue
        positive, negative = report.data.get('supporting_evidence', []), report.data.get('counter_evidence', [])
        # Counterexamples are never hidden behind the positive claims of this report.
        for index in range(max(len(positive), len(negative))):
            for field in ('counter_evidence', 'supporting_evidence'):
                if index >= len(report.data.get(field, [])):
                    continue
                if count >= LIMIT:
                    limited = True; continue
                count += 1
                payload = contract.feedback(center.pk, center.data, source.payload, report.data, field, index, _origin('feedback_source', source, report))
                label = '反馈中的支持主张（未核实）' if field == 'supporting_evidence' else '反馈中的反例主张（未核实）'
                emit(nodes, edges, center, f'feedback-claim:{report.pk}:{field}:{index}', 'assessment', label,
                    payload['status'], payload, report=report)
    return limited


def append(collection, center, available, selected, nodes, edges):
    limited = append_proposals(collection, center, available, selected, nodes, edges)
    report = center.report
    if (not center.derived_checkpoint_id and not center.data.get('formula_version')
            and report.run.kind == 'analyze' and report.data.get('usage')):
        payload = contract.scenario(center.pk, center.data, report.data, _origin('report', report))
        emit(nodes, edges, center, f'scenario:{report.pk}:{center.pk}', 'scenario', '来源用途与条件（AI假设）',
            'scenario_hypothesis', payload, report=report)
    limited = append_combinations(collection, center, nodes, edges) or limited
    return append_feedback(collection, center, nodes, edges) or limited
