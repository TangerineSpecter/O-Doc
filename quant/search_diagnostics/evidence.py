"""Small immutable summaries for AI, with explicit historical references."""
import copy


def summary(data):
    value=copy.deepcopy(data)
    if value.get('version')==2:
        from .history import summary as history_summary
        value['search_history']=history_summary(data['search_history'])
    for family in value['families']:
        if family['analysis']:
            family['analysis'].pop('splits',None)
            family['analysis'].pop('block_means',None)
    return value


def from_rows(run,rows,fail):
    context=run.get('planning_context',{})
    ref=context.get('selection_diagnostic')
    if ref is None:return None
    if (run.get('review_version') not in (10,11,12,13,14,15) or not isinstance(ref,dict) or set(ref)!={'id','content_hash'}):
        fail('搜索选择诊断的冻结引用无效')
    fields=rows.get('quant.selectiondiagnostic',{}).get(str(ref['id']),{})
    if not fields or fields.get('result')!=run.get('experiment_result') or fields.get('content_hash')!=ref['content_hash']:
        fail('搜索选择诊断引用缺失或跨实验')
    from quant.research_memory.contract import instant
    if instant(fields['created_at'])>instant(run['created_at']):
        fail('搜索选择诊断不能引用任务建立后的测量')
    return summary(fields['data'])
