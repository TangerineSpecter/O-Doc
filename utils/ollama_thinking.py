"""Read local model metadata without running inference; cache it briefly."""
from functools import lru_cache
import time

import requests


@lru_cache(maxsize=128)
def _show(base_url: str, model: str, cache_window: int) -> dict:
    base = base_url.rstrip('/')
    if base.endswith('/v1'):
        base = base[:-3]
    try:
        response = requests.post(f'{base}/api/show', json={'model': model}, timeout=3)
        response.raise_for_status()
        data = response.json()
        return data.get('thinking', {}) if isinstance(data, dict) else {}
    except (requests.RequestException, ValueError):
        return {}


def model_thinking(base_url: str, model: str) -> dict:
    return _show(base_url, model, int(time.monotonic() // 60))
