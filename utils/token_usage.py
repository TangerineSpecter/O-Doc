"""Opt-in attribution; no database access for unrelated model calls."""
from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
from functools import wraps
import inspect
import time

_scope = ContextVar('agent_token_usage', default=None)


def usage_context() -> dict | None:
    return _scope.get()


@contextmanager
def usage_scope(*, agent=None, task=None, record=None, purpose: str | None = None, phase: str | None = None, owner_id: str | None = None):
    details = dict(_scope.get() or {})
    for prefix, obj in (('agent', agent), ('task', task), ('record', record)):
        if obj is not None:
            details[prefix + '_key'] = str(obj.pk)
            if prefix != 'record':
                details[prefix + '_name'] = obj.name
    if task is not None:
        from system_settings.agent_world.life_config import task_owner
        details['owner_key'] = str(task_owner(task) or '')
    if owner_id is not None:
        details['owner_key'] = str(owner_id)
    if purpose is not None:
        details['purpose'] = purpose
    if phase is not None:
        details['phase'] = phase
    token = _scope.set(details)
    try:
        yield
    finally:
        _scope.reset(token)


def attributed(purpose: str):
    """Attribution must remain active while generators execute on their worker."""
    def decorate(function):
        signature = inspect.signature(function)
        def scope(args, kwargs):
            values = signature.bind(*args, **kwargs).arguments
            agent, task, record = (values.get(key) for key in ('agent', 'task', 'record'))
            memory = values.get('memory')
            if memory is not None:
                agent = memory.agent
            journey = values.get('journey')
            if journey is not None:
                agent, task = journey.agent, journey.task
                from system_settings.models import AgentRunRecord
                record = AgentRunRecord.objects.filter(random_context__journey_id=journey.pk).first()
            if agent is None and task is None and usage_context() is None:
                return nullcontext()
            parent_purpose = (usage_context() or {}).get('purpose')
            resolved_purpose = parent_purpose if parent_purpose == 'task' or (purpose == 'planning' and parent_purpose) else purpose
            return usage_scope(agent=agent, task=task, record=record if purpose == 'task' else None,
                               purpose=resolved_purpose, phase=function.__name__)
        if inspect.isgeneratorfunction(function):
            @wraps(function)
            def generator(*args, **kwargs):
                with scope(args, kwargs):
                    yield from function(*args, **kwargs)
            return generator
        @wraps(function)
        def wrapped(*args, **kwargs):
            with scope(args, kwargs):
                return function(*args, **kwargs)
        return wrapped
    return decorate


def sdk_retries(default: int = 1) -> int:
    return 0 if usage_context() is not None else default


def create_completion(client, config: dict, *, retries: int = 1, **parameters):
    if usage_context() is None:
        return client.chat.completions.create(**parameters)
    from openai import APIConnectionError, APIStatusError
    from system_settings.token_usage.capture import Capture
    for attempt in range(1, retries + 2):
        capture = Capture(config, attempt=attempt)
        try:
            if parameters.get('stream') and config.get('provider_type') in ('OpenAi', 'DeepSeek', 'MiniMax', 'NewAPI'):
                parameters['stream_options'] = {'include_usage': True}
            response = client.chat.completions.create(**parameters)
            if parameters.get('stream'):
                return TrackedStream(response, capture)
            capture.usage(getattr(response, 'usage', None))
            capture.finish('success')
            return response
        except BaseException as exc:
            capture.finish('failed')
            retry = isinstance(exc, APIConnectionError) or (
                isinstance(exc, APIStatusError) and (
                    exc.response.headers.get('x-should-retry') == 'true' or exc.status_code in (408, 409, 429) or exc.status_code >= 500
                ) and exc.response.headers.get('x-should-retry') != 'false'
            )
            if attempt > retries or not retry:
                raise
            # Match the SDK's short backoff; honor capped provider retry-after.
            delay = .5
            if isinstance(exc, APIStatusError):
                try:
                    requested = float(exc.response.headers.get('retry-after', '0'))
                    if 0 < requested <= 60:
                        delay = requested
                except ValueError:
                    pass
            time.sleep(delay)


class TrackedStream:
    def __init__(self, stream, capture):
        self.stream, self.capture = stream, capture
        self.finished = False

    def __iter__(self):
        terminal = False
        try:
            for chunk in self.stream:
                self.capture.usage(getattr(chunk, 'usage', None))
                terminal = terminal or any(getattr(c, 'finish_reason', None) for c in chunk.choices)
                yield chunk
            self.capture.finish('success' if terminal else 'interrupted')
            self.finished = True
        except BaseException:
            self.capture.finish('interrupted')
            self.finished = True
            raise

    def close(self):
        try:
            self.stream.close()
        finally:
            if not self.finished:
                self.capture.finish('interrupted')
                self.finished = True
