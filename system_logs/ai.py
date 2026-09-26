"""Model boundary instrumentation, preserving return values, exceptions and streams."""
import inspect
import time
import uuid
from functools import wraps
from .capture import capture, request_context


def model_operation(function):
    @wraps(function)
    def call(*args, **kwargs):
        def execute():
            started = time.monotonic()
            parent = request_context.get()
            details = {'operation': function.__name__, 'module': 'ai', 'model_call_id': uuid.uuid4().hex}
            if args and hasattr(args[0], 'model_name'):
                details['model_name'] = args[0].model_name
                details['provider_name'] = type(args[0]).__name__.replace('ImageClient', '')
            if 'bounded' in kwargs:
                details['sdk_retries'] = 0 if kwargs['bounded'] else 1
            token = request_context.set({**parent, **details})
            try:
                if inspect.isgeneratorfunction(function):
                    yield from function(*args, **kwargs)
                else:
                    return function(*args, **kwargs)
            except Exception as exc:
                capture('大模型调用异常', module='ai', exc=exc,
                        duration_ms=round((time.monotonic() - started) * 1000))
                raise
            finally:
                request_context.reset(token)
        iterator = execute()
        if inspect.isgeneratorfunction(function):
            return iterator
        try:
            next(iterator)
        except StopIteration as result:
            return result.value
    return call


def model_config(config):
    context = request_context.get()
    if context.get('module') == 'ai':
        request_context.set({**context, **{key: config.get(key, '') for key in ('provider_name', 'model_name', 'model_role')}})
    return config


def observe_config(function):
    @wraps(function)
    def call(*args, **kwargs):
        return model_config(function(*args, **kwargs))
    return call
