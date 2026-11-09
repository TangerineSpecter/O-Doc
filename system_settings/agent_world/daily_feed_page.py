"""先按业务事实分组、计数、分页，再为真正可见的卡片补充只影响显示的内容。"""
from django.db.models.functions import Substr
from system_settings.models import AgentRunRecord
from .ledger_details import ledger_details
from .market_finance import classify_market_ledger_entries


class DeferredFeedCard(dict):
    """Only public event fields are dictionary entries, including before pagination."""
    __slots__ = ('ledger', 'step_source')

    def __init__(self, event, *, ledger=None, steps=None):
        super().__init__(event)
        self.ledger = ledger
        self.step_source = steps


def attach_steps(card, rows, reason):
    steps = []
    for row in rows:
        step = {k: row[k] for k in ('id', 'title', 'detail', 'occurredAt', 'amount')}
        detail = step['detail']
        if reason and detail:
            if detail == reason:
                step['detail'] = ''
            elif detail.endswith(f' · {reason}'):
                step['detail'] = detail[:-len(f' · {reason}')]
        if row['source'] == 'activity' and row.get('rating') is not None:
            step['detail'] = f"★ {row['rating']} / 10 · {step['detail']}"
        steps.append(step)
    card['steps'] = steps


def ledger_presentation(rows, owner):
    classify_market_ledger_entries(rows, owner)
    return ledger_details(rows, owner)


def page_items(cards, owner):
    ledger_cards = [card for card in cards if isinstance(card, DeferredFeedCard) and card.ledger is not None]
    descriptions = ledger_presentation([card.ledger for card in ledger_cards], owner) if ledger_cards else {}
    run_cards = [card for card in cards if card.get('source') in ('run', 'run-finished')]
    previews = dict(AgentRunRecord.objects.filter(pk__in=[card['target']['id'] for card in run_cards])
                    .values_list('pk', Substr('output', 1, 300)))
    for card in run_cards:
        card['outputPreview'] = previews.get(card['target']['id']) or ''
    for card in ledger_cards:
        row = card.ledger
        card['detail'] = str(descriptions.get(row.pk) or '')[:1200]
        if row.kind == 'farm':
            card['title'] = '农场收入' if row.amount > 0 else '农场支出'
    for card in cards:
        if isinstance(card, DeferredFeedCard) and card.step_source:
            attach_steps(card, *card.step_source)
    return [{key: value for key, value in card.items() if not key.startswith('_')} for card in cards]
