"""No dropped occurrences, invented provenance, or edited extraction on restore."""
from quant.research.contracts import digest
from .expression import expression_hash


def validate_factors(rows, fail):
    from .curation import Curation
    reports = rows.get('quant.researchreport', {})
    candidates = rows.get('quant.factorcandidate', {})
    revisions = rows.get('quant.factorrevision', {})
    expected = {(report_id, ordinal): data for report_id, fields in reports.items()
        for ordinal, data in enumerate(fields.get('data', {}).get('factors', []))}
    required = {key for key in expected if reports[key[0]].get('publication_mode', 'legacy') == 'legacy'}
    for report_id, report in reports.items():
        mode, bindings = report.get('publication_mode', 'legacy'), report.get('factor_bindings', {})
        if mode not in ('legacy', 'pending', 'factors', 'adopted') or not isinstance(bindings, dict):
            fail('研究因子发布状态无效')
        if mode == 'legacy' and bindings or mode == 'pending' and bindings:
            fail('未采用分析不能发布因子关联')
        if bindings and set(bindings) != {str(i) for i in range(len(report.get('data', {}).get('factors', [])))}:
            fail('研究因子关联不完整')
        for ordinal, identity in bindings.items():
            candidate = candidates.get(identity, {})
            origin = reports.get(candidate.get('report'), {})
            if (origin.get('entry') != report.get('entry') or origin.get('source') != report.get('source')
                    or candidate.get('data') != expected.get((report_id, int(ordinal)))
                    or candidate.get('formula_version_id') or candidate.get('derived_checkpoint_id')):
                fail('研究因子关联跨来源或计算定义不一致')
            required.add((candidate.get('report'), candidate.get('ordinal')))
    seen = set()
    for identity, fields in candidates.items():
        from quant.experiments.derivation_sync import validate_derived
        checkpoint = fields.get('derived_checkpoint_id', '')
        formula_id = fields.get('formula_version_id', '')
        authored = rows.get('quant.factorformulaversion', {}).get(formula_id, {}).get('data', {}).get('origin') in ('authored', 'ai_repair', 'ai_study')
        if not isinstance(formula_id, str) or authored and checkpoint:
            fail('公式版本引用或生成类别无效')
        if not isinstance(checkpoint, str):
            fail('衍生候选的实验指针无效')
        if checkpoint:
            validate_derived(identity, fields, rows, fail)
        key = (str(fields.get('report')), fields.get('ordinal'))
        if not checkpoint and not authored and (type(key[1]) is not int or key in seen or key not in expected):
            fail('因子候选出处缺失、重复或序号无效')
        if not checkpoint and not authored:
            seen.add(key)
        data = expected.get(key)
        if not checkpoint and not authored and (fields.get('data') != data or fields.get('content_hash') != digest(data)
                or fields.get('expression_hash') != expression_hash(data)
                or identity != digest(['factor-occurrence-v1', key[0], key[1]])[:40]):
            fail('因子候选与来源报告不一致')
        pointer = fields.get('current_revision_id', '')
        if not isinstance(pointer, str) or (pointer and revisions.get(pointer, {}).get('candidate') != identity):
            fail('因子当前修订跨记录引用或缺失')
    if seen != required:
        fail('研究报告的因子候选记录不完整')
    from quant.experiments.derivation_sync import validate_ancestry
    validate_ancestry(rows, fail)
    from .versions.sync import validate_versions
    validate_versions(rows, fail)
    for identity, fields in revisions.items():
        if str(fields.get('candidate')) not in candidates or not isinstance(fields.get('parent_id'), str):
            fail('因子修订归属无效')
        serializer = Curation(data=fields.get('data'))
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data != fields.get('data') or fields.get('content_hash') != digest(fields['data']):
            fail('因子修订内容或哈希无效')
        visited, parent = {identity}, fields['parent_id']
        while parent:
            previous = revisions.get(parent, {})
            if parent in visited or previous.get('candidate') != fields['candidate']:
                fail('因子修订链循环、缺失或跨记录引用')
            visited.add(parent)
            parent = previous.get('parent_id')
