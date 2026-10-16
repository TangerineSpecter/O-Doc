"""A fixed cash denominator for one resident's sequential planning pass."""
from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN

TIERS = {
    'travel': (('conservative', '保守', 10), ('balanced', '均衡', 15), ('goal', '目标优先', 25)),
    'investment': (('conservative', '保守', 10), ('balanced', '均衡', 15), ('goal', '目标优先', 25)),
}


@dataclass
class BudgetChoices:
    base: Decimal
    reserved: Decimal = Decimal(0)
    selected_percent: Decimal = Decimal(0)
    selected_amount: Decimal = Decimal(0)

    def options(self, activity: str, *, minimum=Decimal(0), spent=Decimal(0),
                cash_left: Decimal | None = None) -> dict:
        if self.base <= 0:
            return {}
        occupied = self.reserved / self.base * 100 + self.selected_percent
        left = self.base - self.reserved - self.selected_amount
        if cash_left is not None:
            left = min(left, cash_left)
        result = {}
        for key, label, percent in TIERS.get(activity, ()):
            amount = (self.base * percent / 100).quantize(Decimal('.01'), rounding=ROUND_DOWN)
            if occupied + percent <= 100 and 0 < amount <= left and amount >= minimum:
                result[key] = {'label': label, 'percent': percent, 'amount': str(amount),
                               'budget': str(spent + amount)}
        return result

    def accept(self, option: dict) -> None:
        # reserved contains pre-existing commitments; selected_percent keeps nominal
        # shares exact even when rounding small monetary amounts down to cents.
        self.selected_percent += Decimal(option['percent'])
        self.selected_amount += Decimal(option['amount'])

