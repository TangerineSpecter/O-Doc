import re
import uuid
from .capture import capture, request_context


class DiagnosticMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.headers.get('X-Request-ID', '')
        request_id = supplied if re.fullmatch(r'[a-f0-9]{32}', supplied) else uuid.uuid4().hex
        request.system_log_request_id = request_id
        excluded = request.path.startswith('/api/system/logs/')
        token = request_context.set({'request_id': request_id, 'operation': request.method,
                                     'path': request.path[:500], 'exclude': excluded})
        try:
            response = self.get_response(request)
            if not excluded and response.status_code >= 500:
                capture('服务请求失败', module=request.path.split('/')[2] if request.path.startswith('/api/') else 'backend',
                        http_status=response.status_code, error_type=f'http_{response.status_code}')
            if response.streaming:
                context = dict(request_context.get())
                content = response.streaming_content
                if response.is_async:
                    async def async_stream():
                        stream_token = request_context.set(context)
                        try:
                            async for chunk in content:
                                yield chunk
                        except Exception as exc:
                            if not excluded:
                                capture('流式响应异常', exc=exc)
                            raise
                        finally:
                            request_context.reset(stream_token)
                    response.streaming_content = async_stream()
                else:
                    def stream():
                        stream_token = request_context.set(context)
                        try:
                            yield from content
                        except Exception as exc:
                            if not excluded:
                                capture('流式响应异常', exc=exc)
                            raise
                        finally:
                            request_context.reset(stream_token)
                    response.streaming_content = stream()
            response['X-Request-ID'] = request_id
            return response
        finally:
            request_context.reset(token)

    def process_exception(self, request, exception):
        if not request_context.get().get('exclude'):
            capture('服务处理异常', exc=exception)
        return None
