"""Current document projection and on-demand section comparison."""
from copy import deepcopy
import json
from quant.models import ResearchReport
from quant.research.presentation import report_data
from .sections import FIELDS, LABELS, payload, pointer
from .services import differences


def current_report(document):
    if not document.sections:
        return None
    reports = {row.pk: row for row in ResearchReport.objects.filter(pk__in={p['report_id'] for p in document.sections.values()})}
    reading = document.sections['reading']
    base = reports[reading['report_id']]
    result = report_data(base, include_history=False,
        factor_report=reports[document.sections['factors']['report_id']],
        plan_report=reports[document.sections['plan']['report_id']])
    data = deepcopy(base.data)
    for key, selected in document.sections.items():
        for field in FIELDS[key]:
            data.pop(field, None)
        data.update({k: v for k, v in payload(reports[selected['report_id']], key, selected['revision_id']).items() if k != 'markdown'})
    from quant.feedback.execution import analysis_presentation
    result['data'] = analysis_presentation({k: v for k, v in data.items() if k != 'research_memory'})
    result['research_memory_json'] = json.dumps(data['research_memory'], ensure_ascii=False) if 'research_memory' in data else None
    result['markdown'] = payload(base, 'reading', reading['revision_id'])['markdown']
    result['current_revision_id'] = reading['revision_id']
    result['document_revision'] = document.revision
    result['section_report_ids'] = {key: value['report_id'] for key, value in document.sections.items()}
    return result


def present(document, compare_id='', history_id=''):
    result = {'revision': document.revision, 'sections': document.sections, 'report': current_report(document),
              'pending': [], 'history': document.history, 'history_limit': 5}
    for report in ResearchReport.objects.filter(pk__in=document.pending).order_by('-created_at'):
        changes = differences(document, {key: pointer(report) for key in FIELDS})
        result['pending'].append({'id': report.pk, 'created_at': report.created_at,
            'changed_sections': [row['section'] for row in changes if row['changed']]})
    target = None
    if compare_id in document.pending:
        report = ResearchReport.objects.get(pk=compare_id)
        target = {key: pointer(report) for key in FIELDS}
    elif history_id:
        target = next((row['sections'] for row in document.history if row['id'] == history_id), None)
    if target:
        result['comparison'] = [{**row, 'label': LABELS[row['section']]} for row in differences(document, target)]
    return result
