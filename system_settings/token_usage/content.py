"""共享请求正文读取语义，避免将未完成的旧快照作为最终输出。"""
from . import details


def request_content(request_id: str, started_at, status: str, ended_at) -> dict:
    detail = details.read(request_id, started_at)
    if detail is not None and status != 'running' and detail.get('status') != status:
        detail = None
    if detail is None:
        return {'available': False, 'message': '请求内容未记录或已超过 30 天保留期'}
    from system_settings.agent_world.life_time import local_time
    return {
        'available': True, 'request': detail.get('request'), 'response': detail.get('response'),
        'status': status, 'error_type': detail.get('error_type'),
        'started_at': detail.get('started_at'),
        'ended_at': local_time(ended_at).isoformat() if ended_at else None,
    }
