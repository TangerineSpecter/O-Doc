"""Checkpoint finite travel selections before generating budgets or reactions."""
import time
from system_settings.decision.routing import choose_scene


def selection_for(journey, node, context):
    phase = journey.phase
    if phase == 'choose':
        funds = context.get('funds', {})
        from decimal import Decimal
        available = Decimal(str(funds.get('available', context.get('balance', '0'))))
        choices = {row['id']: row for row in context.get('candidates', []) if Decimal(str(row['price'])) <= available}
        from .life_scope import CURRENT
        scope = CURRENT.get()
        scheduled_life_trip = bool(
            scope and scope.get('actor_id') == journey.actor_id
            and (scope.get('context') or {}).get('current', {}).get('activity') == 'travel'
        )
        if not scheduled_life_trip:
            choices['skip'] = '本次不去'
        scene, field = 'travel_destination', 'destination_id'
    elif phase.startswith('visit-'):
        choices = {key: key for key in ('游览', '拍照', '休息', '略过')}
        scene, field = 'travel_visit', 'choice'
    elif phase.startswith('event-'):
        choices = {key: key for key in context.get('choices', [])}
        scene, field = 'travel_event', 'choice'
    else:
        return None
    prior = (node.input or {}).get('decision_selection')
    if prior:
        if prior.get('field') != field or prior.get('value') not in choices:
            raise ValueError('已选旅行候选失效，不能盲目重选或执行')
        return prior
    owner = journey.task.travel_config.get('owner_id')
    selected = choose_scene(owner, journey.agent, scene, {key: value for key, value in context.items() if key != '_request_deadline'}, choices, deadline=context.get('_request_deadline', time.monotonic()+120))
    if selected is None:
        return None
    result = {'field': field, 'value': selected, 'source': 'system_choice'}
    node.input = {**(node.input or {}), 'decision_selection': result}
    node.save(update_fields=['input', 'updated_at'])
    return result
