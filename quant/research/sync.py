"""Cross-record ownership and immutable content checks for research snapshots."""
from quant.models import SourceMaterial, SourceRevision, ResearchReport, ReportRevision, FactorCandidate, FactorRevision, FactorRelation
from .contracts import digest, legacy_markdown
from .analysis import validate_analysis, validate_source_evidence, analysis_markdown

LABELS = {'quant.sourcematerial', 'quant.sourcerevision', 'quant.researchreport', 'quant.reportrevision', 'quant.factorcandidate', 'quant.factorrevision', 'quant.factorformulaversion', 'quant.factorformulaselection'}
from quant.graph.sync import LABELS as GRAPH_LABELS
LABELS |= GRAPH_LABELS


def validate_research(rows: dict, fail) -> None:
    entries = rows.get('quant.entry', {})
    materials = rows.get('quant.sourcematerial', {})
    sources = rows.get('quant.sourcerevision', {})
    reports = rows.get('quant.researchreport', {})
    revisions = rows.get('quant.reportrevision', {})
    versions = rows.get('quant.codeversion', {})
    implementations = rows.get('quant.implementation', {})
    runs = rows.get('quant.airun', {})
    for identity, fields in materials.items():
        if str(fields.get('entry')) not in entries or not isinstance(fields.get('title'), str):
            fail('研究来源归属或标题无效')
        pointer = fields.get('current_revision_id')
        if pointer and str(sources.get(str(pointer), {}).get('material')) != identity:
            fail('研究来源当前快照不属于该材料')
    used_versions, used_runs = set(), set()
    for identity, fields in sources.items():
        material = materials.get(str(fields.get('material')))
        payload = fields.get('payload')
        if not material or not isinstance(payload, dict) or fields.get('content_hash') != digest(payload):
            fail('研究来源快照缺失或哈希不一致')
        if payload.get('provenance') == 'legacy_entry':
            if (set(payload) != {'description', 'url', 'provenance', 'fetch_status'}
                    or not isinstance(payload['description'], str) or not isinstance(payload['url'], str)
                    or payload['fetch_status'] != 'not_fetched'
                    or (payload['url'] and not payload['url'].lower().startswith(('http://', 'https://')))
                    or fields.get('code_version')):
                fail('历史文字来源快照格式无效')
        elif payload.get('provenance') == 'code_version':
            if (set(payload) != {'code', 'language', 'language_version', 'dependencies', 'parameters', 'note', 'provenance'}
                    or any(not isinstance(value, str) for value in payload.values())
                    or not fields.get('code_version')):
                fail('代码来源快照格式无效')
        elif payload.get('provenance') == 'intake':
            required = {'title', 'code', 'description', 'url', 'platform', 'language', 'provenance', 'fetch_status', 'request_fingerprint'}
            if (set(payload) != required or any(not isinstance(v, str) for v in payload.values())
                    or fields.get('code_version') or payload['fetch_status'] != 'not_fetched'
                    or payload['language'] not in ('python', 'pine', 'mql4', 'tongdaxin', 'text')
                    or (payload['url'] and not payload['url'].lower().startswith(('http://', 'https://')))):
                fail('收集材料格式无效')
        elif payload.get('provenance') == 'source_supplement':
            from .supplements.sync import validate as validate_supplement
            validate_supplement(identity,fields,sources,fail)
        elif payload.get('provenance') == 'external_feedback':
            from quant.feedback.contracts import validate_payload
            validate_payload(payload)
        elif payload.get('provenance') == 'web_fetch':
            validate_web_source(identity, fields, sources, runs, fail)
        else:
            fail('未知研究来源快照类型')
        version_id = fields.get('code_version')
        if version_id:
            version = versions.get(str(version_id), {})
            implementation = implementations.get(str(version.get('implementation')), {})
            if version_id in used_versions or str(implementation.get('entry')) != str(material['entry']):
                fail('来源代码版本重复或跨研究引用')
            used_versions.add(version_id)
            for key in ('code', 'language', 'language_version', 'dependencies', 'parameters', 'note'):
                if payload.get(key) != version.get(key):
                    fail('来源快照与代码版本不一致')
    for identity, fields in reports.items():
        source = sources.get(str(fields.get('source')), {})
        material = materials.get(str(source.get('material')), {})
        run = runs.get(str(fields.get('run')), {})
        data, markdown = fields.get('data'), fields.get('markdown')
        if (str(fields.get('entry')) not in entries or material.get('entry') != fields.get('entry')
                or run.get('entry') != fields.get('entry') or fields.get('run') in used_runs
                or run.get('status') != 'completed'
                or (run.get('kind') == 'explain' and str(run.get('source_version')) != str(source.get('code_version')))
                or (run.get('kind') in ('analyze', 'experiment_review', 'feedback_review') and str(run.get('resolved_source') or run.get('source')) != str(fields.get('source')))
                or run.get('kind') not in ('explain', 'analyze', 'experiment_review', 'feedback_review')):
            fail('研究报告来源、任务或归属不一致')
        used_runs.add(fields['run'])
        if (type(fields.get('schema_version')) is not int or fields['schema_version'] not in (1, 2, 3, 4, 5)
                or not isinstance(data, dict) or not isinstance(markdown, str) or not markdown.strip()):
            fail('研究报告格式无效或版本高于本机')
        expected = {'format': 'legacy_explanation', 'result': run.get('result'),
                    'model_id': run.get('model_id'), 'model_name': run.get('model_name'),
                    'requirements': run.get('requirements'), 'evidence_status': 'unverified'}
        expected_markdown = legacy_markdown(run['result'])
        if fields['schema_version'] in (2, 3):
            from .findings import validate_admission
            validate_admission(run.get('result', {}), run.get('workflow_version', 0))
            if run.get('kind') != 'analyze':
                fail('结构化报告任务类型不一致')
            from quant.experiments.initial_planning import validate_strategy_admission
            validate_strategy_admission(run.get('result', {}), run.get('workflow_version', 0))
            if 'factor_repair' in run.get('result', {}) and run.get('workflow_version') not in (8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28):
                fail('AI 修订成果缺少支持的阶段工作流')
            expected = validate_analysis(run['result'])
            if (fields['schema_version'] == 3) != (expected.get('extraction_version') == 1):
                fail('报告与提取版本不一致')
            validate_source_evidence(expected, source['payload'])
            expected_markdown = analysis_markdown(expected)
        elif fields['schema_version'] == 5:
            if run.get('kind') != 'feedback_review':
                fail('反馈报告任务类型不一致')
            from quant.feedback.contracts import validate_analysis as validate_feedback, markdown as feedback_markdown
            expected = validate_feedback(run['result'])
            expected_markdown = feedback_markdown(expected)
        elif fields['schema_version'] == 4:
            if run.get('kind') != 'experiment_review':
                fail('实验报告任务类型不一致')
            from quant.experiments.review_contract import validate_review, review_markdown
            expected = validate_review(run['result'])
            expected_markdown = review_markdown(expected)
        elif run.get('kind') != 'explain':
            fail('历史报告任务类型不一致')
        if data != expected or markdown != expected_markdown:
            fail('历史报告与 AI 原始结果不一致')
        if fields.get('content_hash') != digest({'schema_version': fields['schema_version'], 'data': data, 'markdown': markdown}):
            fail('研究报告哈希不一致')
        pointer = fields.get('current_revision_id')
        if pointer and str(revisions.get(str(pointer), {}).get('report')) != identity:
            fail('报告当前修订跨报告引用')
    for identity, fields in revisions.items():
        if (str(fields.get('report')) not in reports or not isinstance(fields.get('markdown'), str)
                or len(fields['markdown']) > 200000 or not isinstance(fields.get('parent_id'), str)):
            fail('报告修订归属或正文无效')
        if fields.get('content_hash') != digest(fields['markdown']):
            fail('报告修订哈希不一致')
        seen, parent = {identity}, fields.get('parent_id')
        while parent:
            previous = revisions.get(str(parent), {})
            if parent in seen or previous.get('report') != fields['report']:
                fail('报告修订链存在循环、缺失或跨报告引用')
            seen.add(parent)
            parent = previous.get('parent_id')
    from quant.factors.sync import validate_factors
    validate_factors(rows, fail)
    from quant.graph.sync import validate_relations
    validate_relations(rows, fail)
    for model in (SourceMaterial, SourceRevision, ResearchReport, ReportRevision, FactorCandidate, FactorRevision, FactorRelation):
        incoming = rows.get(model._meta.label_lower, {})
        for local in model.objects.filter(pk__in=incoming).values('id', *model.SNAPSHOT_FIELDS):
            fields = incoming[str(local['id'])]
            for key in model.SNAPSHOT_FIELDS:
                field = model._meta.get_field(key)
                source_key = field.name
                incoming_value = fields.get(source_key, 0 if key in ('qualification_version','admission_version') else '' if key in ('derived_checkpoint_id', 'formula_version_id') else None)
                if local[key] != incoming_value:
                    fail('同一研究快照的不可变内容冲突，拒绝覆盖')


def validate_web_source(identity, fields, sources, runs, fail) -> None:
    from django.utils.dateparse import parse_datetime
    payload = fields['payload']
    required = {'title', 'code', 'description', 'url', 'language', 'platform', 'provenance',
        'origin_source_id', 'run_id', 'fetched_at', 'fetch_status', 'fetch_error', 'final_url',
        'web_markdown', 'extraction_method', 'extraction_confidence', 'code_origin'}
    if (set(payload) != required or any(not isinstance(value, str) for value in payload.values())
            or fields.get('code_version') or not payload['url'].startswith(('http://', 'https://'))
            or payload['fetch_status'] not in ('fetched', 'failed')
            or payload['language'] not in ('python', 'pine', 'mql4', 'tongdaxin', 'text')
            or not parse_datetime(payload['fetched_at'])):
        fail('网页来源快照格式无效')
    origin = sources.get(payload['origin_source_id'], {})
    request = runs.get(payload['run_id'], {})
    original = origin.get('payload', {})
    if (origin.get('material') != fields['material'] or request.get('source') != payload['origin_source_id']
            or request.get('resolved_source') != identity or request.get('kind') != 'analyze'
            or any(payload[key] != original.get(key, '') for key in ('description', 'url', 'platform'))):
        fail('网页来源跨材料引用或请求不一致')
    if original.get('code'):
        if payload['code'] != original['code'] or payload['code_origin'] != 'submitted' or payload['language'] != original['language']:
            fail('网页获取不能覆盖提交的源码')
    elif payload['code_origin'] == 'web_extracted':
        if not payload['code'] or payload['code'] not in payload['web_markdown'] or payload['fetch_status'] != 'fetched':
            fail('网页代码缺少原文依据')
    elif payload['code_origin'] != 'none' or payload['code']:
        fail('网页代码来源无效')
    if payload['fetch_status'] == 'fetched':
        if not payload['web_markdown'].strip() or payload['fetch_error'] or not payload['final_url'].startswith(('http://', 'https://')):
            fail('网页获取成功但缺少正文或出处')
    elif not payload['fetch_error'] or any(payload[key] for key in ('web_markdown', 'final_url', 'extraction_method', 'extraction_confidence')):
        fail('网页获取失败状态与内容不一致')
    seen, parent = {identity}, payload['origin_source_id']
    while parent:
        if parent in seen or parent not in sources:
            fail('网页来源链存在循环或缺失')
        seen.add(parent)
        parent = sources[parent].get('payload', {}).get('origin_source_id', '')
