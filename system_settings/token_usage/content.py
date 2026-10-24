"""共享请求正文读取语义，避免将未完成的旧快照作为最终输出。"""
from . import details


MESSAGES = {
    'disabled': '当前服务器已关闭输入输出正文采集',
    'expired': '请求正文已超过本机最近 30 个自然日的保留范围',
    'not_found': '当前服务器未找到该请求的输入输出正文文件',
    'unreadable': '请求正文文件读取失败，请检查存储权限与挂载',
    'invalid': '请求正文文件损坏或内容无效',
    'incomplete': '请求已结束，但最终输入输出快照未保存成功',
    'other_device': '该请求由其他设备采集，当前服务器没有对应的输入输出正文',
}


def current_device_id() -> str:
    from system_settings.models import SystemSetting
    from system_settings.sync_state import DEVICE_SETTING_KEY
    value = SystemSetting.objects.filter(pk=DEVICE_SETTING_KEY).values_list('value', flat=True).first() or {}
    return value.get('device_id', '')


def request_content(request_id: str, started_at, status: str, ended_at, *, device_id: str = '', local_device_id: str | None = None) -> dict:
    detail, reason = details.read_result(request_id, started_at)
    if detail is not None and status != 'running' and detail.get('status') != status:
        detail = None
        reason = 'incomplete'
    if detail is None:
        if reason == 'not_found' and device_id:
            local = current_device_id() if local_device_id is None else local_device_id
            if local and local != device_id:
                reason = 'other_device'
        return {'available': False, 'reason': reason, 'message': MESSAGES.get(reason, '请求正文暂不可用')}
    from system_settings.agent_world.life_time import local_time
    return {
        'available': True, 'request': detail.get('request'), 'response': detail.get('response'),
        'status': status, 'error_type': detail.get('error_type'),
        'started_at': detail.get('started_at'),
        'ended_at': local_time(ended_at).isoformat() if ended_at else None,
    }
