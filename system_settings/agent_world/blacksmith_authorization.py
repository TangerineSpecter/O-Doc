"""Device-local permission for manual forge continuation; never part of snapshots."""
import hashlib

from system_settings.models import WorldActionRuntime


class BlacksmithAuthorizationRequired(ValueError):
    """Keep the business checkpoint until this device receives execution permission."""


def authorization_key(action_id: str) -> str:
    return 'forge:' + hashlib.sha256(action_id.encode()).hexdigest()[:32]


def authorize(action_id: str) -> None:
    """Only an explicit manual execution entry may grant this local permission."""
    WorldActionRuntime.objects.update_or_create(pk=authorization_key(action_id),
        defaults={'enabled': True, 'token': '', 'until': None})


def authorized(action_id: str, manual: bool = False) -> bool:
    if WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return True
    return bool(manual and WorldActionRuntime.objects.filter(
        pk=authorization_key(action_id), enabled=True).exists())


def require_authorized(action_id: str, *, manual: bool = False) -> None:
    if not authorized(action_id, manual):
        raise BlacksmithAuthorizationRequired('本机尚未授权接续打造，请手动执行或开启世界运行')


def reset_authorizations() -> None:
    WorldActionRuntime.objects.filter(pk__startswith='forge:').update(enabled=False, token='', until=None)
