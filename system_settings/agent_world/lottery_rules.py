"""纯规则：金额按分向下分配，未分配零头继续结转。"""
from collections import Counter
from decimal import Decimal, ROUND_DOWN

# 每期期次冻结一份规则；历史期次继续按其冻结值售票、派奖和同步校验。
RULES_V1 = {'version': 1, 'ticket_price': '5.00', 'ticket_limit': 10,
            'subsidy': '100.00', 'second_prize': '50.00', 'third_prize': '20.00'}
RULES = {'version': 2, 'ticket_price': '50.00', 'ticket_limit': 10,
         'subsidy': '1000.00', 'second_prize': '500.00', 'third_prize': '200.00'}
RULE_VERSIONS = {rules['version']: rules for rules in (RULES_V1, RULES)}
PRICE = Decimal(RULES['ticket_price'])


def known_rules(value: object) -> bool:
    return isinstance(value, dict) and RULE_VERSIONS.get(value.get('version')) == value


def price(rules: dict | None = None) -> Decimal:
    return Decimal((rules or RULES)['ticket_price'])


def numbers(value: object) -> list[int]:
    if (not isinstance(value, list) or len(value) != 3
            or any(type(n) is not int or not 1 <= n <= 10 for n in value) or len(set(value)) != 3):
        raise ValueError('每张彩票须为1～10中三个不同的整数')
    return sorted(value)


def settlement(tickets: list[dict], winning: list[int], carry: Decimal, rules: dict | None = None) -> dict:
    rules = rules or RULES
    winning_set = set(numbers(winning))
    first, second, third, names = Counter(), set(), set(), {}
    for ticket in tickets:
        actor = ticket['actor_id']
        names[actor] = ticket['actor_name']
        matches = len(set(numbers(ticket['numbers'])) & winning_set)
        if matches == 3:
            first[actor] += 1
        elif matches == 2:
            second.add(actor)
        elif matches == 1:
            third.add(actor)
    sales = price(rules) * len(tickets)
    subsidy = Decimal(rules['subsidy']) if tickets else Decimal(0)
    pool = carry + sales + subsidy
    awards = []
    paid = Decimal(0)
    total = sum(first.values())
    for actor, count in sorted(first.items()):
        amount = (pool * count / total).quantize(Decimal('.01'), rounding=ROUND_DOWN)
        paid += amount
        awards.append({'actor_id': actor, 'actor_name': names[actor], 'tier': 1,
                       'winning_tickets': count, 'amount': str(amount)})
    for tier, actors, amount in ((2, second, rules['second_prize']), (3, third, rules['third_prize'])):
        awards.extend({'actor_id': actor, 'actor_name': names[actor], 'tier': tier,
                       'winning_tickets': 0, 'amount': amount} for actor in sorted(actors))
    return {'winning_numbers': sorted(winning_set), 'ticket_count': len(tickets),
            'sales': str(sales), 'subsidy': str(subsidy), 'carry_in': str(carry),
            'pool': str(pool), 'carry_out': str(pool - paid), 'awards': awards}
