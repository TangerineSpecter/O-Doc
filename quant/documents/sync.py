"""Validate adopted sections and history without executing or publishing anything."""
from .sections import FIELDS


def validate_documents(rows, fail):
    reports = rows.get('quant.researchreport', {})
    revisions = rows.get('quant.reportrevision', {})
    seen = set()
    for document in rows.get('quant.researchdocument', {}).values():
        entry = document.get('entry')
        if entry in seen or entry not in rows.get('quant.entry', {}) or type(document.get('revision')) is not int or document['revision'] < 1:
            fail('当前研究文档归属或修订号无效')
        seen.add(entry)
        def validate_sections(sections, empty=False):
            if not isinstance(sections, dict) or (set(sections) != set(FIELDS) and not (empty and sections == {})):
                fail('当前研究内容分区不完整')
            for key, pointer in sections.items():
                if not isinstance(pointer, dict) or set(pointer) != {'report_id', 'revision_id'}:
                    fail('研究内容指针格式无效')
                report = reports.get(pointer['report_id'], {})
                if report.get('entry') != entry or report.get('schema_version') not in (2, 3):
                    fail('研究内容跨条目引用或原始结果缺失')
                revision = pointer['revision_id']
                if not isinstance(revision, str) or revision and revisions.get(revision, {}).get('report') != pointer['report_id']:
                    fail('研究正文修订指针缺失或归属错误')
        validate_sections(document.get('sections'), empty=True)
        history, pending = document.get('history'), document.get('pending')
        if not isinstance(history, list) or len(history) > 5 or not isinstance(pending, list) or len(pending) > 1:
            fail('研究更新记录范围无效')
        ids = set()
        for item in history:
            if not isinstance(item, dict) or set(item) != {'id', 'created_at', 'label', 'sections'} or not all(isinstance(item[k], str) for k in ('id', 'created_at', 'label')) or item['id'] in ids:
                fail('研究更新记录格式无效')
            ids.add(item['id'])
            validate_sections(item['sections'])
        for identity in pending:
            if not isinstance(identity, str) or reports.get(identity, {}).get('entry') != entry:
                fail('待采用分析归属无效')
        selected = document.get('sections', {}).get('factors')
        if selected:
            report = reports[selected['report_id']]
            if report.get('publication_mode', 'legacy') != 'legacy' and len(report.get('factor_bindings', {})) != len(report['data'].get('factors', [])):
                fail('当前采用的因子尚未建立入库关联')
