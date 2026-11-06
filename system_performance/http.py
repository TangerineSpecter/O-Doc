"""Context-only HTTP timings. Never retain URLs, headers or payloads."""
from functools import wraps
from .instrumentation import CURRENT, operation


def install():
    import requests
    import httpx
    def sync(function):
        if getattr(function, '_performance_hook', False):
            return function
        @wraps(function)
        def call(*args, **kwargs):
            if CURRENT.get() is None:
                return function(*args, **kwargs)
            with operation('http', function.__module__ + '.send', timing_boundary='响应对象返回；流式响应不含完整正文传输') as event:
                response = function(*args, **kwargs)
                if event is not None:
                    event['http_status'] = response.status_code
                return response
        call._performance_hook = True
        return call
    # Transport boundaries count each network attempt once, including redirects.
    # Client.send/Session.send would include nested redirect calls in both totals.
    requests.adapters.HTTPAdapter.send = sync(requests.adapters.HTTPAdapter.send)
    httpx.HTTPTransport.handle_request = sync(httpx.HTTPTransport.handle_request)
    original = httpx.AsyncHTTPTransport.handle_async_request
    if not getattr(original, '_performance_hook', False):
        @wraps(original)
        async def async_send(*args, **kwargs):
            if CURRENT.get() is None:
                return await original(*args, **kwargs)
            with operation('http', 'httpx.AsyncHTTPTransport.handle_async_request', timing_boundary='传输层响应头返回；不含完整正文传输') as event:
                response = await original(*args, **kwargs)
                if event is not None:
                    event['http_status'] = response.status_code
                return response
        async_send._performance_hook = True
        httpx.AsyncHTTPTransport.handle_async_request = async_send
