"""Keep model protocol instructions out of the public market ending explanation."""
INTERNAL_TERMS = ('farm_queue', 'request_id', 'revision', '不可虚构', '不能虚构')


def public_leave_reason(reason: str, summary: str = '') -> str:
    if not any(term in reason for term in INTERNAL_TERMS):
        return reason
    # Report execution facts rather than guessing what the resident intended.
    if summary and not any(term in summary for term in INTERNAL_TERMS):
        return summary + '，已离开市场。'
    return '已离开市场，实际操作见执行明细。'
