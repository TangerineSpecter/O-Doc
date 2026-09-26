"""Diagnostic context for worker operations without retaining business arguments."""
import inspect
import time
import uuid
from functools import wraps
from .capture import capture, request_context


def diagnostic_operation(module, resource_attr=None):
    def decorate(function):
        signature = inspect.signature(function)
        @wraps(function)
        def call(*args, **kwargs):
            context = {**request_context.get(), 'module': module, 'operation': function.__name__}
            context.setdefault('request_id', uuid.uuid4().hex)
            try:
                bound = signature.bind_partial(*args, **kwargs).arguments
                for source, target in [('task', 'task_id'), ('record', 'run_id'), ('run', 'run_id'), ('agent', 'agent_id')]:
                    if source in bound:
                        value = getattr(bound[source], 'pk', None) or getattr(bound[source], 'id', None)
                        if value is not None:
                            context[target] = str(value)
                for name in ('article_id', 'task_id', 'run_id', 'book_id'):
                    if name in bound:
                        context['resource_id' if name == 'article_id' else name] = str(bound[name])
                if resource_attr and args:
                    context['resource_id'] = str(getattr(args[0], resource_attr))
            except Exception:
                pass  # Instrumentation cannot prevent the original operation from running.
            token = request_context.set(context)
            started = time.monotonic()
            try:
                return function(*args, **kwargs)
            except Exception as exc:
                capture('后台操作异常', module=module, exc=exc, duration_ms=round((time.monotonic() - started) * 1000))
                raise
            finally:
                request_context.reset(token)
        return call
    return decorate
