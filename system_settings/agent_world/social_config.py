"""社交默认值及可验证的账号/角色配置。"""
from .social_models import SocialConfig
from .life_models import LifeProfile

DEFAULTS = {'enabled': False, 'agent_ids': [], 'publish_enabled': True, 'read_enabled': True,
            'reply_enabled': True, 'reply_mode': 'idle_daily', 'daily_replies': 3,
            'daily_moments': 1, 'daily_images': 1, 'read_limit': 5, 'image_enabled': True,
            'image_model_id': '', 'image_aspect_ratio': '1:1', 'image_size': '1K',
            'theatre_daily_count': 1, 'theatre_search_server_id': '',
            'interaction_window_days': 7, 'reply_chance': 60}


def config_for(owner):
    return SocialConfig.objects.get_or_create(pk=owner)[0]


def resident_ids(owner):
    """此账号仍可参与的生活居民，顺序稳定，已归档居民不参与。"""
    from system_settings.models import Agent
    ids = LifeProfile.objects.filter(owner_id=owner).values_list('pk', flat=True)
    return list(Agent.objects.filter(pk__in=ids, archived_at__isnull=True).order_by('id').values_list('pk', flat=True))


def ensure_participants(config):
    """从未配置过参与名单时默认全部生活居民参与；用户保存过的名单原样保留。"""
    if 'agent_ids' in config.settings:
        return config
    ids = resident_ids(config.pk)
    if ids:
        config.settings = {**config.settings, 'agent_ids': ids}
        config.save(update_fields=['settings', 'updated_at'])
    return config


def add_participants(owner, ids):
    """未配置名单时默认全选；已保存名单只自动追加新建居民。"""
    rows = [key for key in dict.fromkeys(ids) if key]
    if not rows:
        return
    config, _ = SocialConfig.objects.get_or_create(pk=owner)
    has_saved_list = 'agent_ids' in config.settings
    current = list(config.settings['agent_ids']) if has_saved_list else resident_ids(owner)
    merged = list(dict.fromkeys([*current, *rows]))
    if merged != current or not has_saved_list:
        config.settings = {**config.settings, 'agent_ids': merged}
        config.save(update_fields=['settings', 'updated_at'])


def settings_for(config, actor=None):
    return {**DEFAULTS, **config.settings, **(config.overrides.get(actor, {}) if actor else {})}


def validate(owner, data, *, override=False):
    if not isinstance(data, dict) or set(data) - set(DEFAULTS):
        raise ValueError('无效的社交配置字段')
    value = dict(data) if override else {**DEFAULTS, **data}
    for key in ('enabled', 'publish_enabled', 'read_enabled', 'reply_enabled', 'image_enabled'):
        if key in value and type(value[key]) is not bool: raise ValueError('开关须为布尔值')
    for key, cap in (('daily_replies', 20), ('daily_moments', 10), ('daily_images', 9), ('read_limit', 5),
                     ('interaction_window_days', 30), ('reply_chance', 100)):
        if key in value and (type(value[key]) is not int or not 0 <= value[key] <= cap):
            raise ValueError(f'{key} 须为0至{cap}整数')
    if 'theatre_daily_count' in value and (type(value['theatre_daily_count']) is not int or not 0 <= value['theatre_daily_count'] <= 3):
        raise ValueError('每日小剧场场数须为0至3整数')
    if 'theatre_search_server_id' in value:
        server_id = value['theatre_search_server_id']
        if not isinstance(server_id, str) or len(server_id) > 40:
            raise ValueError('小剧场新闻搜索服务无效')
        if server_id:
            from .publish_config import search_server
            search_server({'search_server_id': server_id})
    if value.get('reply_mode', 'idle_daily') not in ('idle_daily', 'daily'): raise ValueError('回应模式无效')
    if 'agent_ids' in value:
        ids = value['agent_ids']
        if not isinstance(ids, list) or any(not isinstance(a, str) for a in ids) or len(ids) != len(set(ids)):
            raise ValueError('参与居民列表无效')
        if LifeProfile.objects.filter(owner_id=owner, pk__in=ids).count() != len(ids):
            raise ValueError('请先在生活日程中配置所属居民')
    if override and 'agent_ids' in value: raise ValueError('角色覆盖不能修改参与名单')
    if override and {'theatre_daily_count', 'theatre_search_server_id'} & set(value):
        raise ValueError('小剧场配置只能在世界默认设置中修改')
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
