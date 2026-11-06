import inspect
import time
from functools import wraps
from .instrumentation import CURRENT, active, finish, open_operation, operation, outcome


def first_output(kind='content'):
    node = CURRENT.get()
    while node:
        if node['kind'] == 'ai' and 'first_output_ms' not in node:
            node['first_output_ms'] = (time.monotonic() - node['_clock']) * 1000
            node['first_output_type'] = kind
            return
        node = node.get('_parent')


def monitored_model(function):
    name = f'{function.__module__}.{function.__qualname__}'
    if inspect.isgeneratorfunction(function):
        @wraps(function)
        def stream(*args, **kwargs):
            node = open_operation('ai', name)
            result = 'success'
            iterator = function(*args, **kwargs)
            try:
                while True:
                    try:
                        with active(node):
                            chunk = next(iterator)
                            if isinstance(chunk, str) and chunk.strip():
                                first_output()
                            elif isinstance(chunk, dict) and chunk.get('type') in {'answer', 'thinking'} and isinstance(chunk.get('content'), str) and chunk['content'].strip():
                                first_output(chunk['type'])
                    except StopIteration as end:
                        return end.value
                    yield chunk
            except BaseException as exc:
                result = outcome(exc)
                raise
            finally:
                try:
                    with active(node):
                        iterator.close()
                finally:
                    finish(node, result)
        return stream
    @wraps(function)
    def call(*args, **kwargs):
        with operation('ai', name):
            return function(*args, **kwargs)
    return call


def observe_attempt(number):
    node = CURRENT.get()
    while node:
        if node['kind'] == 'ai':
            node['observable_attempts'] = max(node.get('observable_attempts', 0), int(number))
            return
        node = node.get('_parent')


def bounded_model(function):
    @wraps(function)
    def call(*args, **kwargs):
        if CURRENT.get() and CURRENT.get()['kind'] == 'ai':
            return function(*args, **kwargs)
        return monitored_model(function)(*args, **kwargs)
    return call
