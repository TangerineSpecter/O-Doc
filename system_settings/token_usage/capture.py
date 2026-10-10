from django.utils import timezone
from threading import Lock

from system_settings.sync_state import get_device_id
from system_settings.agent_world.farm_gate import guarded
from utils.token_usage import usage_context
from .models import AgentTokenUsage
from .normalize import normalize

_active = set()
_active_lock = Lock()


def is_active(key: str) -> bool:
    with _active_lock:
        return key in _active


def active_keys() -> set[str]:
    with _active_lock:
        return set(_active)


class Capture:
    @guarded
    def __init__(self, config: dict, *, attempt: int = 1) -> None:
        context = usage_context()
        self.row = None
        if context is not None:
            context = dict(context)
            if not context.get('owner_key') and context.get('agent_key'):
                from system_settings.agent_world.life_models import LifeProfile
                context['owner_key'] = LifeProfile.objects.filter(pk=context['agent_key']).values_list('owner_id', flat=True).first() or ''
            self.row = AgentTokenUsage.objects.create(
                **context, model_key=str(config.get('model_id') or ''), model_name=config.get('model_name', ''),
                provider_key=str(config.get('provider_id') or ''), provider_name=config.get('provider_name', ''),
                device_id=get_device_id(), attempt=attempt,
            )

            with _active_lock:
                _active.add(self.row.pk)

    def usage(self, usage: object) -> None:
        if self.row is None or usage is None:
            return
        self.counts(normalize(usage))

    @guarded
    def counts(self, counts: dict[str, int | None]) -> None:
        if self.row is None:
            return
        # A repeated/partial stream event must not erase an already-known count.
        for key, result in counts.items():
            if result is not None:
                setattr(self.row, key, result)
        self.row.usage_complete = all(getattr(self.row, key) is not None for key in ('input_tokens', 'output_tokens', 'total_tokens'))
        self.row.save(update_fields=[*counts, 'usage_complete', 'updated_at'])

    @guarded
    def finish(self, status: str) -> None:
        if self.row is not None:
            if status == 'interrupted':
                self.row.usage_complete = False
            self.row.status = status
            self.row.ended_at = timezone.now()
            self.row.save(update_fields=['status', 'ended_at', 'usage_complete', 'updated_at'])
            with _active_lock:
                _active.discard(self.row.pk)
