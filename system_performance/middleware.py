import time
import inspect
from pathlib import Path
from .safety import ROOT
from .instrumentation import active, finish, open_operation, outcome

EXCLUDE = ('/api/system/', '/api/health/', '/static/', '/media/')


class PerformanceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith('/api/') or request.path.startswith(EXCLUDE):
            return self.get_response(request)
        event = open_operation('request', 'unmatched', method=request.method,
                               request_id=getattr(request, 'system_log_request_id', None))
        try:
            with active(event):
                response = self.get_response(request)
        except BaseException as exc:
            finish(event, outcome(exc))
            raise
        if event is None:
            return response
        match = getattr(request, 'resolver_match', None)
        event['operation'] = str(getattr(match, 'route', None) or 'unmatched')[:240]
        if match and callable(match.func):
            callback = match.func
            view_class = getattr(callback, 'cls', None) or getattr(callback, 'view_class', None)
            action = getattr(callback, 'actions', {}).get(request.method.lower(), request.method.lower())
            handler = inspect.unwrap(getattr(view_class, action, callback))
            event['handler'] = f'{handler.__module__}.{getattr(handler, "__qualname__", type(handler).__name__)}'
            try:
                path = Path(inspect.getsourcefile(handler)).resolve().relative_to(ROOT).as_posix()
                event['source'] = [dict(file=path, function=getattr(handler, '__qualname__', 'unknown'), line=inspect.getsourcelines(handler)[1])]
            except (ValueError, TypeError, OSError):
                pass
        event['http_status'] = response.status_code
        status = 'failed' if response.status_code >= 500 else 'client_error' if response.status_code >= 400 else 'success'
        if not response.streaming:
            finish(event, status)
            return response
        event['kind'] = 'stream'
        event['response_ready_ms'] = (time.monotonic() - event['_clock']) * 1000
        # Hold the actual iterator, not Django's streaming_content adapter: closing
        # that adapter does not propagate aclose to an underlying async generator.
        content = response._iterator
        if response.is_async:
            from .streams import AsyncResponseStream
            response.streaming_content = AsyncResponseStream(content, response, event, status)
        else:
            original_close = getattr(content, 'close', None)
            if original_close is not None:
                response._resource_closers = [closer for closer in response._resource_closers if closer != original_close]
            def stream():
                result = status
                try:
                    iterator = iter(content)
                    while True:
                        try:
                            with active(event):
                                chunk = next(iterator)
                        except StopIteration:
                            break
                        if chunk and 'first_chunk_ms' not in event:
                            event['first_chunk_ms'] = (time.monotonic() - event['_clock']) * 1000
                        yield response.make_bytes(chunk)
                except BaseException as exc:
                    result = outcome(exc)
                    raise
                finally:
                    try:
                        closer = getattr(content, 'close', None)
                        if closer is not None:
                            with active(event):
                                closer()
                    finally:
                        finish(event, result)
            response.streaming_content = stream()
            # An unstarted generator's close() does not execute its finally.
            def close_unstarted():
                if not event.get('finished'):
                    try:
                        if original_close is not None:
                            with active(event):
                                original_close()
                    finally:
                        finish(event, 'cancelled')
            response._resource_closers.append(close_unstarted)
        return response
