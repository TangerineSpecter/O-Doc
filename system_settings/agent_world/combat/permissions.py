"""A local permit must belong to the exact exploration incarnation, not just its key."""
from .models import CombatRuntime, Exploration


def local_runtime(run: Exploration) -> CombatRuntime | None:
    runtime=CombatRuntime.objects.filter(pk=run.pk,owner_id=run.owner_id).first()
    origin=run.snapshot.get('origin')
    return runtime if origin and runtime and runtime.requests.get('origin')==origin else None
