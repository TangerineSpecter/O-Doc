"""Section contracts shared by adoption, comparison, presentation and sync."""
from copy import deepcopy

FIELDS = {
    'reading': ('title', 'kind', 'summary', 'principle', 'formula', 'usage'),
    'parameters': ('parameters', 'parameter_binding_version', 'parameter_inventory_json'),
    'factors': ('extraction_version', 'extraction_note', 'factors', 'factor_repair'),
    'review': ('scores', 'total_score', 'rubric_version', 'risks', 'source_facts', 'assumptions',
               'unknowns', 'source_findings', 'source_findings_version', 'source_findings_note', 'source_findings_scope',
               'memory_assessment', 'memory_note', 'research_memory', 'source_memory_version',
               'source_change_review_version', 'source_change_facts_json', 'source_change_assessment'),
    'plan': ('initial_planning_version', 'initial_planning_note', 'initial_proposal', 'validation_plan'),
}
LABELS = {'reading': '正文解读', 'parameters': '参数分析', 'factors': '因子算法', 'review': '评价与审查', 'plan': '实验规划'}


def pointer(report):
    return {'report_id': report.pk, 'revision_id': report.current_revision_id}


def payload(report, section, revision_id=''):
    data = {key: deepcopy(report.data[key]) for key in FIELDS[section] if key in report.data}
    if section == 'reading':
        revision = report.revisions.filter(pk=revision_id).first() if revision_id else None
        data['markdown'] = revision.markdown if revision else report.markdown
    return data
