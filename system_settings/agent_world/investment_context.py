"""Small, read-only model projection for an investment decision."""
from decimal import Decimal


POSITION_FIELDS = (
    'code', 'name', 'quantity', 'available_quantity', 'cost', 'average_cost',
    'close_price', 'price_date', 'market_value', 'unrealized_profit', 'return_percent',
)


def account_projection(account: dict) -> dict:
    """Keep the account once and omit internal T+1 lot ledgers from the prompt."""
    page = account.get('positions') or {}
    return {
        key: account[key] for key in (
            'actor_id', 'actor_name', 'balance', 'realized_profit', 'unrealized_profit',
            'market_value', 'position_count',
        ) if key in account
    } | {'positions': position_page_projection(page)}


def position_page_projection(page: dict) -> dict:
    rows = [{key: row[key] for key in POSITION_FIELDS if key in row}
            for row in page.get('items', [])]
    total = page.get('total', len(rows))
    number = page.get('page', 1)
    return {'items': rows, 'page': number, 'total': total,
            'has_more': number * 20 < total}


def model_context(decision, account: dict, preference: str, completed_operations: list) -> dict:
    """Project current authoritative facts without attaching unrelated life domains."""
    result = {
        'execution_date': decision.execution_date.isoformat(),
        'reference_date': decision.reference_date.isoformat(),
        'account': account_projection(account),
    }
    if preference and preference.strip():
        result['investment_intent'] = preference.strip()

    from .life_scope import CURRENT
    scope = CURRENT.get()
    if scope and scope.get('actor_id') == decision.actor_id:
        from .life_budget_policy import remaining_reservation
        from .life_models import LifeItem
        from .life_schedule import OPEN
        from system_settings.models import Agent
        rows = list(LifeItem.objects.filter(
            owner_id=scope['owner_id'], actor_id=scope['actor_id'], status__in=OPEN,
        ).order_by('scheduled_at'))
        current = next((row for row in rows if row.pk == scope['item_id']), None)
        if current:
            agent = Agent.objects.filter(pk=scope['actor_id']).only('money').first()
            reserved = sum((remaining_reservation(row) for row in rows if row.pk != current.pk), Decimal(0))
            result['life_budget'] = {
                'current_item_id': current.pk,
                'current_activity': current.activity,
                'current_intent': current.intent,
                'current_budget': str(current.budget),
                'current_spent': str(current.spent),
                'reserved_for_other_items': str(reserved),
                'spendable_for_current_item': str(max(Decimal(0), min(
                    remaining_reservation(current), (agent.money if agent else Decimal(0)) - reserved,
                ))),
                'adjustable_commitments': [
                    {'id': row.pk, 'activity': row.activity, 'budget': str(row.budget),
                     'spent': str(row.spent), 'remaining': str(remaining_reservation(row))}
                    for row in rows if row.pk != current.pk and row.activity in ('travel', 'farm', 'market', 'market_prepare', 'investment')
                ],
            }

    if completed_operations:
        result['completed_operations'] = completed_operations
    return result
