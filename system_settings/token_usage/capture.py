import logging

from django.utils import timezone
from threading import Lock

from system_settings.sync_state import get_device_id
from system_settings.agent_world.farm_gate import guarded
from utils.token_usage import usage_context
from .models import AgentTokenUsage
from .normalize import normalize
from . import details

_active = set()
_active_lock = Lock()
logger = logging.getLogger(__name__)


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
        self.detail = None
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
            self.detail = {
                'version': 1,
                'id': self.row.pk,
                'started_at': self.row.started_at.isoformat(),
                'ended_at': None,
                'agent_name': self.row.agent_name,
                'task_name': self.row.task_name,
                'purpose': self.row.purpose,
                'phase': self.row.phase,
                'provider_name': self.row.provider_name,
                'model_name': self.row.model_name,
                'attempt': self.row.attempt,
                'status': 'running',
                'request': None,
                'response': None,
                'error_type': None,
            }
            self._write_detail()

            with _active_lock:
                _active.add(self.row.pk)

    @guarded
    def set_request(self, request) -> None:
        if self.detail is None:
            return
        self._update_detail('request', request)

    @guarded
    def set_response(self, response) -> None:
        if self.detail is None:
            return
        self._update_detail('response', response)

    def _detail_failed(self, error: Exception) -> None:
        # 诊断内容可缺失，不能掩盖模型结果；日志不包含请求内容或异常中的路径/凭据。
        logger.warning('Token request detail unavailable: request=%s error=%s', self.row.pk, type(error).__name__)
        self.detail = None

    def _update_detail(self, key, value) -> None:
        try:
            self.detail[key] = details.jsonable(value)
            self._write_detail()
        except Exception as exc:
            self._detail_failed(exc)

    @guarded
    def _write_detail(self) -> None:
        if self.detail is not None:
            try:
                details.write(self.detail)
            except Exception as exc:
                self._detail_failed(exc)

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
    def finish(self, status: str, error: BaseException | None = None) -> None:
        if self.row is not None:
            try:
                if status == 'interrupted':
                    self.row.usage_complete = False
                self.row.status = status
                self.row.ended_at = timezone.now()
                self.row.save(update_fields=['status', 'ended_at', 'usage_complete', 'updated_at'])
                if self.detail is not None:
                    self.detail['status'] = status
                    self.detail['ended_at'] = self.row.ended_at.isoformat()
                    self.detail['error_type'] = type(error).__name__ if error is not None else None
                    self._write_detail()
            finally:
                with _active_lock:
                    _active.discard(self.row.pk)
