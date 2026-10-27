"""Validate saved research and connectors without executing models or HTTP requests."""
import json
from quant.models import AIStudy, AIStudyGeneration, ExternalResponse
from quant.research.contracts import digest
from .contracts import StudyInput, normalize, fingerprint
from .publication import ids, candidate_data, version_data

LABELS = {'quant.aistudy', 'quant.aistudygeneration', 'quant.externalconnector', 'quant.externalresponse'}


def validate_formula(identity, row, child, root_id, parent_ids, rows, fail):
    from types import SimpleNamespace
    data = row['data']; generation = rows.get('quant.aistudygeneration', {}).get(data.get('generation_id'), {})
    candidates = rows.get('quant.factorcandidate', {})
    result = generation.get('data', {}).get('result') or {}
    item = next((r for r in result.get('candidates', []) if r['index'] == data.get('index') and r['selected']), None)
    if not item: fail('AI研究公式缺少已保留的代次记录')
    version_id, child_id = ids(data['generation_id'], item['index'])
    parents = [SimpleNamespace(pk=key, content_hash=candidates[key]['content_hash']) for key in parent_ids]
    expected = version_data(data['generation_id'], item, parents)
    if (identity != version_id or row['candidate'] != child_id or item['candidate_id'] != child_id or row.get('request_key')
            or parent_ids != item['parents'] or child.get('report') != candidates[parent_ids[0]]['report']
            or row['data'] != expected or child.get('derived_checkpoint_id') or child.get('ordinal') != 0
            or child['data'] != candidate_data(expected, identity, root_id)
            or child['content_hash'] != digest(child['data'])):
        fail('AI研究公式与代次、父代或定义不一致')


def validate(rows, anthologies, fail):
    from quant.connectors.services import config
    from quant.connectors.mapping import map_response
    studies = rows.get('quant.aistudy', {}); generations = rows.get('quant.aistudygeneration', {})
    candidates = rows.get('quant.factorcandidate', {}); reports = rows.get('quant.researchreport', {}); entries = rows.get('quant.entry', {})
    responses = rows.get('quant.externalresponse', {}); connectors = rows.get('quant.externalconnector', {})
    def collection_of(candidate): return entries.get(reports.get(candidate.get('report'), {}).get('entry'), {}).get('anthology')
    for identity, row in connectors.items():
        owner = anthologies.get(str(row.get('anthology')), {})
        if owner.get('type') != 'quant' or owner.get('permission') != 'private' or not isinstance(row.get('name'), str) or not row['name'].strip(): fail('连接配置归属无效')
        if row.get('content_hash') != digest(config(row.get('config'))): fail('连接配置哈希无效')
    for identity, row in responses.items():
        value = row.get('data')
        if row.get('connector') not in connectors or not isinstance(value, dict) or row.get('content_hash') != digest(value): fail('接口响应归属或哈希无效')
        cfg = config(value['config']); normalized, warnings = map_response(value['raw_response'], cfg.get('mappings', []))
        if value['connector_hash'] != digest(cfg) or value['normalized'] != normalized or value['warnings'] != warnings or value['evidence_status'] != 'external_report_unverified': fail('接口字段映射与原始响应不一致')
    grouped = {}
    for identity, row in generations.items():
        if row.get('study') not in studies or row.get('content_hash') != digest(row.get('data')): fail('研究代次归属或哈希无效')
        grouped.setdefault(row['study'], []).append((identity, row))
    seen_keys = set()
    for identity, row in studies.items():
        plan = row.get('plan', {}); owner = str(row.get('anthology'))
        form = StudyInput(data={key: plan[key] for key in StudyInput().fields if key != 'request_key' and key in plan} | {'request_key': row.get('request_key')})
        form.is_valid(raise_exception=True)
        if (owner not in anthologies or anthologies[owner].get('type') != 'quant' or anthologies[owner].get('permission') != 'private'
                or not isinstance(row.get('user_report', ''), str) or len(row.get('user_report', '')) > 200000
                or plan.get('version') != 1 or row.get('content_hash') != digest(plan) or (owner, row['request_key']) in seen_keys): fail('研究计划归属、预算或哈希无效')
        seen_keys.add((owner, row['request_key']))
        for seed in plan['seeds']:
            candidate = candidates.get(seed['id'], {})
            if collection_of(candidate) != owner or candidate.get('content_hash') != seed['hash'] or candidate.get('data') != seed['definition']: fail('研究父代快照无效')
        if [seed['id'] for seed in plan['seeds']] != plan['candidate_ids']: fail('研究父代清单无效')
        for proof in plan['evidence']:
            response = responses.get(proof['id'], {}); connector = connectors.get(response.get('connector'), {})
            if connector.get('anthology') != owner or response.get('content_hash') != proof['hash'] or response.get('data', {}).get('normalized') != proof['normalized']: fail('研究外部证据引用无效')
        previous = plan['seeds']; known = [fingerprint(p['definition']) for p in previous]; summary = ''
        ordered = sorted(grouped.get(identity, []), key=lambda pair: pair[1]['number'])
        if len(ordered) > plan['max_generations']: fail('研究代次超过预算')
        for number, (generation_id, generation) in enumerate(ordered, 1):
            value = generation['data']
            if generation['number'] != number or generation_id != digest(['ai-study-generation-1', identity, number])[:40]: fail('研究代次顺序无效')
            expected_input = {'parents': previous, 'known_fingerprints': known, 'previous_summary': summary,
                'external_evidence': plan['evidence'], 'empirical_status': 'unassessed'}
            if value.get('input') != expected_input or value.get('model_id') != plan['model_id']: fail('研究冻结输入与上一代不一致')
            if value.get('status') == 'failed':
                if value.get('result') is not None or not value.get('error'): fail('失败代次不能发布候选')
                continue
            if value.get('status') != 'completed': fail('未知研究代次状态')
            import re
            raw = json.loads(re.sub(r'^```(?:json)?\s*', '', value['raw_output'].strip()).removesuffix('```').strip())
            result = normalize(raw, {p['id']: p['definition'] for p in previous}, plan['population'], plan['keep'], known)
            for item in result['candidates']:
                if item['selected']: item['candidate_id'] = ids(generation_id, item['index'])[1]
            if result != value['result']: fail('研究评价或选择与保存原稿不一致')
            if not result['continue'] and number != len(ordered): fail('AI已停止的研究不能自动追加下一代')
            previous = [{'id': item['candidate_id'], 'hash': candidates[item['candidate_id']]['content_hash'], 'definition': candidates[item['candidate_id']]['data']}
                for item in result['candidates'] if item['selected']]
            # ORM parent retrieval uses deterministic candidate primary-key ordering.
            previous.sort(key=lambda p: p['id'])
            summary = result['summary']; known += [r['fingerprint'] for r in result['candidates'] if r.get('fingerprint')]
    for model in (AIStudy, AIStudyGeneration, ExternalResponse):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming):
            if local.content_hash != incoming[local.pk].get('content_hash'): fail('已保存的研究或接口证据不能被改写')
