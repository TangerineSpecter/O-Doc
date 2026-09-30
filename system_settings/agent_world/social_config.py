"""社交默认值及可验证的账号/角色配置。"""
from .social_models import SocialConfig
from .life_models import LifeProfile

DEFAULTS = {'enabled': False, 'agent_ids': [], 'publish_enabled': True, 'read_enabled': True,
            'reply_enabled': True, 'reply_mode': 'idle_daily', 'daily_replies': 3,
            'daily_moments': 1, 'daily_images': 1, 'read_limit': 5, 'image_enabled': True,
            'image_model_id': '', 'image_aspect_ratio': '1:1', 'image_size': '1K'}


def config_for(owner):
    return SocialConfig.objects.get_or_create(pk=owner)[0]


def settings_for(config, actor=None):
    return {**DEFAULTS, **config.settings, **(config.overrides.get(actor, {}) if actor else {})}


def validate(owner, data, *, override=False):
    if not isinstance(data, dict) or set(data) - set(DEFAULTS):
        raise ValueError('无效的社交配置字段')
    value = dict(data) if override else {**DEFAULTS, **data}
    for key in ('enabled', 'publish_enabled', 'read_enabled', 'reply_enabled', 'image_enabled'):
        if key in value and type(value[key]) is not bool: raise ValueError('开关须为布尔值')
    for key, cap in (('daily_replies', 20), ('daily_moments', 10), ('daily_images', 9), ('read_limit', 5)):
        if key in value and (type(value[key]) is not int or not 0 <= value[key] <= cap):
            raise ValueError(f'{key} 须为0至{cap}整数')
    if value.get('reply_mode', 'idle_daily') not in ('idle_daily', 'daily'): raise ValueError('回应模式无效')
    if 'agent_ids' in value:
        ids = value['agent_ids']
        if not isinstance(ids, list) or any(not isinstance(a, str) for a in ids) or len(ids) != len(set(ids)):
            raise ValueError('参与居民列表无效')
        if LifeProfile.objects.filter(owner_id=owner, pk__in=ids).count() != len(ids):
            raise ValueError('请先在生活日程中配置所属居民')
    if override and 'agent_ids' in value: raise ValueError('角色覆盖不能修改参与名单')
    for key in ('image_model_id', 'image_aspect_ratio', 'image_size'):
        if key in value and (not isinstance(value[key], str) or len(value[key]) > 40): raise ValueError('生图配置无效')
    if value.get('image_aspect_ratio', '1:1') not in ('1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'): raise ValueError('配图比例无效')
    if value.get('image_size', '1K') not in ('1K', '2K', '4K'): raise ValueError('配图分辨率无效')
    if value.get('image_model_id') and not override:
        from system_mcp.image_generation import resolve_image_model
        from system_settings.image_generation_options import resolve_image_generation_request
        from system_settings.grsai_images import GrsaiImageError
        try: model = resolve_image_model(value['image_model_id'])
        except GrsaiImageError as exc: raise ValueError(str(exc)) from exc
        resolve_image_generation_request(model, {'aspect_ratio': value.get('image_aspect_ratio', '1:1'), 'image_size': value.get('image_size', '1K')}, scene='moment')
    return value
