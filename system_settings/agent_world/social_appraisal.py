"""生成式关系判断的临时原文校验；沿既有 category/reason 保存依据。"""
from .social_relations import RULES


def validate_appraisal(value: object, source: str) -> dict:
    if not isinstance(value, dict) or value.get('category') not in RULES:
        raise ValueError('关系事件类别无效')
    reason = value.get('reason')
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
        raise ValueError('关系事件须提供不超过1000字的具体原因')
    category = value['category']
    if category == 'like':
        raise ValueError('点赞由系统单独记录，模型关系判断请选择其他类别')
    if category == 'neutral':
        return {'category': category, 'reason': reason.strip()}
    quote = value.get('quote')
    if not isinstance(quote, str) or not quote.strip() or len(quote) > 300 or quote not in source:
        raise ValueError('非中性关系判断须用quote逐字引用对方原文（最多300字）')
    grounded_reason = f'依据「{quote}」：{reason.strip()}'
    if len(grounded_reason) > 1000:
        raise ValueError('关系原因含引用后不得超过1000字')
    return {'category': category, 'reason': grounded_reason}
