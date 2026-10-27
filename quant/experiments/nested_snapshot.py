"""Validate recorded inner folds and arithmetic without executing source on restore."""
import copy
from quant.research.contracts import digest
from .nested import aggregate


def validate(attempt: dict, count: int, fail, *, strategy=None, label_target=None) -> dict:
    from .snapshot import validate_metric
    value = attempt.get('inner_evaluation')
    extra = {'label_summary'} if label_target else set()
    if (not isinstance(value, dict) or set(value) != {'version', 'planned_folds', 'folds', 'summary'} | extra
            or type(value['version']) is not int or value['version'] != (2 if label_target else 1)
            or type(value['planned_folds']) is not int or value['planned_folds'] != count
            or not isinstance(value['folds'], list) or len(value['folds']) > count):
        fail('嵌套尝试缺少匹配的内层评价记录')
    folds = value['folds']
    for index, fold in enumerate(folds):
        if (not isinstance(fold, dict) or set(fold) != {'number', 'metrics'} | ({'label_metrics'} if label_target else set()) or type(fold['number']) is not int
                or fold['number'] != index+1 or not isinstance(fold['metrics'], dict)
                or set(fold['metrics']) not in (set(), {'train'}, {'train', 'validation'})):
            fail('内层评价必须按连续折和训练/验证顺序保存')
        if index < len(folds)-1 and set(fold['metrics']) != {'train', 'validation'}:
            fail('未完成的内层折不能继续下一折')
        for metric in fold['metrics'].values():
            validate_metric(metric, fail, strategy=strategy)
            if attempt['status'] == 'evaluated' and (metric['missing_signals'] == metric['bars']
                    or metric.get('execution', {}).get('status') == 'insolvent'):
                fail('内层全缺失或资金耗尽的尝试不能参与选择')
        if label_target:
            from quant.label_studies.snapshot import validate_record
            validate_record({'version': 1, 'metrics': fold['label_metrics']}, label_target, fail)
            if set(fold['label_metrics']) - set(fold['metrics']): fail('标签不能先于实际窗口计算')
            if index < len(folds)-1 and set(fold['label_metrics']) != {'train', 'validation'}: fail('内层标签未完成不能继续下一折')
    expected = aggregate(folds, count)
    if digest(value['summary']) != digest(expected) or (attempt['status'] == 'evaluated' and expected is None):
        fail('内层汇总与已完成的每折指标不一致')
    if attempt['metrics'] != (folds[-1]['metrics'] if folds else {}):
        fail('候选顶层指标必须等于最后已启动的内层折')
    if label_target:
        from quant.label_studies.search import mean
        labels = mean(folds, count)
        if digest(labels) != digest(value['label_summary']) or attempt['status'] == 'evaluated' and labels is None:
            fail('标签内层均值与完整窗口不一致')
        if attempt['label_evaluation']['metrics'] != (folds[-1]['label_metrics'] if folds else {}): fail('顶层标签须投影最后已启动内层')
    return {key: copy.deepcopy(item) for key, item in attempt.items() if key != 'inner_evaluation'}


def ranges(attempt: dict, schedule: dict, rows: list, fail) -> None:
    for fold in attempt['inner_evaluation']['folds']:
        split = schedule['inner_windows'][fold['number']-1]['partitions']
        for name, metric in fold['metrics'].items():
            start, end = split[name]
            if (metric['bars'] != end-start or metric['start'] != rows[start]['timestamp']
                    or metric['end'] != rows[end]['timestamp']):
                fail('内层指标区间与冻结行情不一致')
