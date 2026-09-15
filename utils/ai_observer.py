"""Opt-in execution metadata, without prompts, responses, keys or reasoning."""
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Callable

_sink: ContextVar[Callable | None] = ContextVar('ai_execution_sink', default=None)
_context: ContextVar[dict] = ContextVar('ai_execution_context', default={})
_control: ContextVar[Callable | None] = ContextVar('ai_execution_control', default=None)


@contextmanager
def observe_ai(sink: Callable, check_cancel: Callable | None = None):
    token = _sink.set(sink)
    control_token = _control.set(check_cancel)
    try:
        yield
    finally:
        _sink.reset(token)
        _control.reset(control_token)


def check_ai_control():
    """Called on the owning synchronous worker, never on a network thread."""
    control = _control.get()
    if control:
        control()


@contextmanager
def ai_scope(**details):
    token = _context.set({**_context.get(), **details})
    try:
        yield
    finally:
        _context.reset(token)


def emit_ai_event(kind: str, title: str, level: str = 'info', **details):
    sink = _sink.get()
    if sink:
        sink(kind, title, level, {**_context.get(), **details})
