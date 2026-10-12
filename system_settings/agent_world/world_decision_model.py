"""解析 Agent 世界非任务型决策的模型优先级。"""


def model_id_for_agent(agent) -> str | None:
    """优先使用世界决策模型，再回退居民模型；两者为空时沿用系统默认。"""
    from system_settings.models import AIModel
    from .life_models import LifeConfig, LifeProfile

    owner_id = LifeProfile.objects.filter(pk=agent.pk).values_list('owner_id', flat=True).first()
    if owner_id:
        settings = LifeConfig.objects.filter(pk=owner_id).values_list('settings', flat=True).first() or {}
        world_model_id = settings.get('decision_model_id')
        if world_model_id and AIModel.objects.filter(pk=world_model_id, type='chat').exists():
            return world_model_id
    return agent.model_id
