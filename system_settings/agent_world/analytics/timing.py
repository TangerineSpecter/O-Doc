"""Expose coarse request timings without storing data or query contents."""
from time import perf_counter


class AnalyticsTiming:
    def __init__(self):
        self.started = self.previous = perf_counter()
        self.parts = []

    def mark(self, name):
        now = perf_counter()
        self.parts.append((name, (now - self.previous) * 1000))
        self.previous = now

    def elapsed_ms(self):
        return (perf_counter() - self.started) * 1000

    def header(self):
        total = self.elapsed_ms()
        return ', '.join(f'{name};dur={duration:.2f}' for name, duration in [*self.parts, ('total', total)])
