"""Pure history facts from immutable records, shared by ORM and restore adapters."""
import copy
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .contract import instant

METRICS = ('total_return', 'max_drawdown', 'entries', 'turnover', 'exposure_fraction',
           'missing_signals', 'bars', 'start', 'end')


def seed_info(identity: str, candidate: dict, ref: dict) -> dict:
    return {'id': identity, 'candidate': copy.deepcopy(candidate),
            'entry_id': ref['entry_id'], 'source_id': ref['source_id']}


def market(snapshot: dict) -> dict:
    return {key: snapshot.get(key) for key in ('symbol', 'timeframe')}


def experiment_record(identity: str, result: dict, request: dict, dataset: dict,
                      checkpoints: list[dict], references: dict) -> dict:
    data, plan, snapshot = result['data'], request['plan'], dataset['snapshot']
    if result['content_hash'] != digest(data) or request['content_hash'] != digest(plan):
        raise ValidationError('历史实验内容哈希不一致')
    if plan['dataset_hash'] != dataset['content_hash'] or str(dataset['anthology']) != str(request['anthology']):
        raise ValidationError('历史实验行情归属或哈希不一致')
    seeds = []
    for row in plan['seeds']:
        ref = references[row['id']]
        if ref['collection_id'] != str(request['anthology']) or ref['data'] != row['candidate']:
            raise ValidationError('历史实验父代证据与文集不一致')
        seeds.append(seed_info(row['id'], row['candidate'], ref))
    if not seeds:
        raise ValidationError('历史实验缺少父代')
    ordered = sorted(checkpoints, key=lambda row: row['ordinal'])
    if data['checkpoint_hashes'] != [row['content_hash'] for row in ordered] or any(
            row['content_hash'] != digest(row['attempt']) for row in ordered):
        raise ValidationError('历史实验必须保留完整尝试')
    attempts, negative = [], data['status'] in ('failed', 'cancelled', 'partial')
    for row in ordered:
        attempt = row['attempt']
        facts = {key: copy.deepcopy(attempt.get(key)) for key in
            ('id', 'parents', 'operation', 'generation', 'requested_parameters', 'status', 'reason', 'complexity')}
        for key in ('transformation', 'fold'):
            if key in attempt:
                facts[key] = copy.deepcopy(attempt[key])
        # Historical holdout must never become a feature used to rank future parents.
        facts['metrics'] = {part: {key: values.get(key) for key in METRICS}
            for part, values in (attempt.get('metrics') or {}).items() if part in ('train', 'validation') and isinstance(values, dict)}
        spec = attempt.get('recipe')
        facts['actual_parameters'] = copy.deepcopy(spec.get('parameters')) if spec else copy.deepcopy(attempt.get('requested_parameters'))
        facts['formula'] = ({key: copy.deepcopy(spec.get(key)) for key in ('expression', 'bindings', 'parameter_names', 'output_type', 'units')}
                            if spec else None)
        negative |= attempt['status'] != 'evaluated' or any(
            type(metric.get('total_return')) in (int, float) and metric['total_return'] <= 0 for metric in facts['metrics'].values())
        attempts.append(facts)
    output = data.get('output') or {}
    bars = snapshot['rows']
    dataset_facts = {key: snapshot.get(key) for key in ('symbol', 'timeframe', 'timezone', 'price_adjustment', 'source')}
    dataset_facts.update(content_hash=dataset['content_hash'], row_count=len(bars),
                         start=bars[0]['timestamp'], end=bars[-1]['timestamp'])
    evidence = {'request_id': str(result['request']), 'request_hash': request['content_hash'],
        'engine_version': plan['engine_version'], 'status': data['status'], 'error': data.get('error', ''),
        'config': copy.deepcopy(plan['config']), 'dataset': dataset_facts,
        'seeds': [{**{key: seed[key] for key in ('id', 'entry_id', 'source_id')},
                   'name': seed['candidate']['name'], 'family': seed['candidate']['family'],
                   'tags': copy.deepcopy(seed['candidate']['tags']),
                   **{key: copy.deepcopy(seed['candidate'].get(key)) for key in ('formula', 'expression', 'output_type', 'units')},
                   'bindings': copy.deepcopy(original['bindings']), 'actual_parameters': copy.deepcopy(original['parameters'])}
                  for seed, original in zip(seeds, plan['seeds'])],
        'attempts': attempts, 'stop_reason': output.get('stop_reason'), 'limitations': copy.deepcopy(output.get('limitations', [])),
        'historical_holdout_exposed': bool(output.get('holdout') or output.get('walk_forward')),
        'independent_holdout_proven': False, 'evidence_status': 'local_simulation_unverified_platform'}
    return {'id': identity, 'kind': 'experiment', 'title': plan['name'], 'entry_id': seeds[0]['entry_id'],
            'collection_id': str(request['anthology']), 'created_at': instant(result['created_at']).isoformat(),
            'content_hash': result['content_hash'], 'seeds': seeds, 'market': market(snapshot),
            'evidence': evidence, 'has_negative_evidence': bool(negative)}


def feedback_record(identity: str, source: dict, entry: dict, target: dict, references: dict,
                    experiment_seeds: list[dict] | None = None, experiment_market: dict | None = None) -> dict:
    payload = source['payload']
    if payload.get('provenance') != 'external_feedback' or source['content_hash'] != digest(payload):
        raise ValidationError('历史反馈内容哈希或来源无效')
    if (not target or target.get('entry_id') != source['entry_id']
            or target['payload'].get('provenance') == 'external_feedback'
            or target.get('content_hash') != digest(target['payload'])
            or ('created_at' in target and instant(target['created_at']) > instant(source['created_at']))):
        raise ValidationError('历史反馈缺少同来源的原始材料')
    seeds = []
    for factor_id, ref in sorted(references.items()):
        if (ref['source_id'] == payload['target_source_id'] and ref['entry_id'] == source['entry_id']
                and ref['collection_id'] == str(entry['anthology'])
                and instant(ref['created_at']) <= instant(source['created_at'])):
            seeds.append(seed_info(factor_id, ref['data'], ref))
    if payload.get('factor_id'):
        seeds = [row for row in seeds if row['id'] == payload['factor_id']]
        if not seeds:
            raise ValidationError('历史反馈关联因子无效')
    if payload.get('experiment_result_id'):
        if not experiment_seeds or not any(row['source_id'] == payload['target_source_id'] for row in experiment_seeds):
            raise ValidationError('历史反馈关联实验无效')
        if payload.get('factor_id') and payload['factor_id'] not in {row['id'] for row in experiment_seeds}:
            raise ValidationError('历史反馈因子不在关联实验中')
        seeds = experiment_seeds
    # Historical text contracts stay byte-for-byte stable. New structured
    # evidence has a dedicated complete-metrics projection rather than feeding
    # a second copy of a potentially large raw report to a later model.
    feedback = copy.deepcopy(payload)
    if payload.get('feedback_version') == 3:
        from quant.feedback.execution import PAYLOAD_KEYS, summary
        feedback = {key: value for key, value in feedback.items() if key not in PAYLOAD_KEYS | {'document'}}
        feedback.update(document_hash=payload['execution_evidence']['document_hash'], execution_summary=summary(payload))
    evidence = {'feedback': feedback, 'target_source_hash': target['content_hash'],
                'candidate_ids': [row['id'] for row in seeds],
                'evidence_status': 'external_report_unverified', 'independent_holdout_proven': False}
    return {'id': identity, 'kind': 'feedback', 'title': payload['title'], 'entry_id': source['entry_id'],
            'collection_id': str(entry['anthology']), 'created_at': instant(source['created_at']).isoformat(), 'content_hash': source['content_hash'],
            'seeds': seeds, 'market': experiment_market, 'evidence': evidence, 'has_negative_evidence': None}
