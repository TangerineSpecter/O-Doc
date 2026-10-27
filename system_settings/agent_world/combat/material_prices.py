"""Current NPC material prices without changing frozen inventory lots."""
from decimal import Decimal

from .catalog import bundled
from .models import CombatCatalog, CombatProfile
from .store import current


def material_catalog(owner: str, actor_id: str):
    profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
    if profile:
        return current(profile.catalog_id)
    if CombatCatalog.objects.exists():
        return current()
    return bundled()[0]


def material_price(catalog, sku: str) -> Decimal:
    return Decimal(catalog.row('materials', sku.removeprefix('combat.'))['sale_price'])
