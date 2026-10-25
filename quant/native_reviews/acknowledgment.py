import json
from .contracts import acknowledgment


def instruction(context:dict) -> str:
    if not context.get('native_review_policy'):return ''
    if context['native_review_policy']['version']==2:
        return ('\n本次为Python事实审查v2，返回native_review_version:3。在native_review逐字复制以下确认字段：'+
            json.dumps(acknowledgment(context['native_check']),ensure_ascii=False,sort_keys=True)+
            '。alignment_ack确认的是程序重放受控表达式和存储原函数输出得到的位置；下标从固定片段0开始，首次有效与显式排除预热分别定义。'
            '不得从缺失总数不同推断起点不同；原函数失败时位置未知，不填0。不得把窗口长度、缺失数量与warmup_bars混用。'
            '历史数值以metrics_columns和values无损对齐，native_history_statistics给出已冻结尝试的符号计数；不要复抄收益明细或用历史表现评价本次输出。'
            '不要返回native_review_gate、native_review_facts或evidence_hash。计算判定由系统固定，AI解释或假设不属于独立验证。')
    return ('\n本次是有界Python事实审查合同。必须增加native_review_version:2，并在native_review中逐字复制以下三个确认字段：'+
        json.dumps(acknowledgment(context['native_check']),ensure_ascii=False)+
        '。解释文字须与这些确认一致，所有段落left均为受控表达式、right均为原始函数。'
        '比较条件是abs(left-right) <= abs_tol + rel_tol*max(abs(left),abs(right))，不是独立绝对/相对阈值的AND或OR。'
        '不要返回native_review_gate、native_review_facts或evidence_hash，这些由系统填写；原稿保留后会由同一配置模型另行审查，审查不是独立验证。')
