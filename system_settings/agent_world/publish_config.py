"""自主发帖配置与资格检查；个人评论范围不会扩展发布范围。"""
from datetime import timedelta
from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from anthology.models import Anthology
from article.models import Article
from system_settings.models import MCPServer, SystemSetting
from .models import WorldCategory
from .execution import stamina

PUBLISH_COST = Decimal('20')
SEARCH_NAMES = {'tavily_search', 'tavily-search'}


class CategoryRuleSerializer(serializers.Serializer):
    category_id = serializers.CharField(max_length=64)
    modes = serializers.ListField(child=serializers.ChoiceField(choices=['news', 'topic']), allow_empty=False)
    topics = serializers.CharField(max_length=2000, allow_blank=True, default='')
    news_days = serializers.IntegerField(min_value=1, max_value=365, default=3)
    region = serializers.CharField(max_length=200, allow_blank=True, default='全球')
    excluded_topics = serializers.CharField(max_length=2000, allow_blank=True, default='')


class PublishConfigSerializer(serializers.Serializer):
    collection_id = serializers.CharField(max_length=40)
    search_server_id = serializers.CharField(max_length=40)
    rules = CategoryRuleSerializer(many=True, allow_empty=False)
    cooldown_hours = serializers.IntegerField(min_value=1, max_value=720, default=6)
    unread_enabled = serializers.BooleanField(default=False)
    unread_count = serializers.IntegerField(min_value=1, max_value=100, default=3)
    owner_id = serializers.CharField(read_only=True)

    def validate(self, data):
        ids = [r['category_id'] for r in data['rules']]
        if len(ids) != len(set(ids)) or len(ids) > 100:
            raise serializers.ValidationError('分类不能重复且最多100项')
        previous = self.context.get('previous', {})
        previous_ids = {r['category_id'] for r in previous.get('rules', [])}
        categories = {c.pk: c for c in WorldCategory.objects.filter(pk__in=ids)}
        for key in ids:
            category = categories.get(key)
            if category and (category.workflow_kind == 'travel' or is_travel_name(category.name)):
                raise serializers.ValidationError('旅行分类由旅行工作流发布，不能加入自主发帖任务')
            if (not category or not category.enabled) and key not in previous_ids:
                raise serializers.ValidationError('只能选择启用分类')
        collection = Anthology.objects.filter(pk=data['collection_id'], type='agent', is_valid=True).first()
        owner = self.context.get('owner_id') or previous.get('owner_id')
        if not collection or (owner and collection.user_id != owner):
            raise serializers.ValidationError('请选择自己可管理的有效 Agent 文集')
        search_server(data)
        data['owner_id'] = owner or collection.user_id
        return data


def is_travel_name(name: str) -> bool:
    return name.strip().lower() in {'旅行', '旅游', '旅行分享', '旅行日记', 'travel'}


def search_server(config: dict):
    server = MCPServer.objects.filter(pk=config.get('search_server_id'), enabled=True, transport='streamableHttp').first()
    if server is None or not any(t.get('name') in SEARCH_NAMES and t.get('enabled', True) for t in (server.tools or [])):
        raise ValueError('所选搜索服务没有启用可调用的 Tavily 搜索工具')
    return server


def categories_for(config: dict):
    ids = [r['category_id'] for r in config.get('rules', [])]
    return [c for c in WorldCategory.objects.filter(pk__in=ids, enabled=True).exclude(workflow_kind='travel') if not is_travel_name(c.name)]


def own_posts(agent):
    # 稳定 ID 优先；仅兼容能明确归属的旧身份，不按名称猜测。
    return Article.objects.filter(coll_id__in=Anthology.objects.filter(type='agent').values('coll_id')).filter(
        Q(agent_post_author_id=agent.pk) | Q(agent_post_creator_id=f'agent:{agent.pk}') | Q(agent_post_creator_id=f'agent-id:{agent.pk}'))


def eligibility(task, agent, *, config=None, preview=False) -> str:
    config = config or task.publish_config
    from .life_scope import allowed
    if not allowed(task,agent.pk):
        return 'Agent 已解绑'
    setting = SystemSetting.objects.filter(key='system_mcp_config').first()
    if setting and not (setting.value or {}).get('enabled', True):
        return '系统 MCP 已关闭'
    if not agent.model_id:
        return 'Agent 未配置模型'
    try:
        search_server(config)
    except ValueError as exc:
        return str(exc)
    if not Anthology.objects.filter(pk=config.get('collection_id'), type='agent', is_valid=True,
                                    user_id=config.get('owner_id')).exists():
        return '输出文集失效或管理权限发生变化'
    if not categories_for(config):
        return '没有启用且允许发布的分类'
    if not preview and stamina(agent) < PUBLISH_COST:
        return '体力不足，发帖需要20点'
    now = timezone.now()
    if own_posts(agent).filter(created_at__gt=now-timedelta(hours=config.get('cooldown_hours', 6))).exists():
        return '发帖冷却尚未结束'
    if config.get('unread_enabled'):
        rows = list(own_posts(agent).filter(is_valid=True).order_by('-created_at', '-pk')[:config.get('unread_count', 3)])
        if len(rows) == config.get('unread_count', 3) and not any(p.agent_post_has_been_read for p in rows):
            return '最近帖子全部未读，暂停发帖'
    return ''
