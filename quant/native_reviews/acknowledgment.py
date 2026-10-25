import json
from .contracts import acknowledgment


def instruction(context:dict) -> str:
    if not context.get('native_review_policy'):return ''
    return ('\n本次是有界Python事实审查合同。必须增加native_review_version:2，并在native_review中逐字复制以下三个确认字段：'+
        json.dumps(acknowledgment(context['native_check']),ensure_ascii=False)+
        '。解释文字须与这些确认一致，所有段落left均为受控表达式、right均为原始函数。'
        '比较条件是abs(left-right) <= abs_tol + rel_tol*max(abs(left),abs(right))，不是独立绝对/相对阈值的AND或OR。'
        '不要返回native_review_gate、native_review_facts或evidence_hash，这些由系统填写；原稿保留后会由同一配置模型另行审查，审查不是独立验证。')
