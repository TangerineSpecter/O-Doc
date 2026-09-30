"""有界角色写作快照与表达指导；不装载资金、计划或运行授权。"""
from .life_models import LifeProfile, LifeItem
from .publish_config import own_posts
from system_settings.models import AgentRunRecord


def writing_context(owner, agent):
    profile = LifeProfile.objects.filter(owner_id=owner, pk=agent.pk).first()
    records = AgentRunRecord.objects.filter(agent_id=agent.pk, status='success').exclude(summary='').order_by('-created_at', '-pk')[:10]
    experiences = [{'id': r.pk, 'activity': r.task_name, 'result': r.summary,
                    'time': r.created_at.isoformat()} for r in records]
    # 只提供完成活动的结果，intent/context 中的计划不能成为亲身经历。
    activities = LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, status='completed').order_by('-updated_at', '-pk')[:10]
    for item in activities:
        reason = item.result.get('reason') or item.result.get('summary')
        if isinstance(reason, str) and reason.strip():
            experiences.append({'id': item.pk, 'activity': item.activity, 'result': reason[:500],
                                'time': item.updated_at.isoformat()})
    posts = list(own_posts(agent).filter(is_valid=True).order_by('-created_at', '-pk').values('title', 'post_summary', 'content')[:20])
    recent = [{'title': p['title'], 'summary': p['post_summary'],
               'excerpt': (p['content'] or '')[:1000] if i < 3 else ''} for i, p in enumerate(posts)]
    return {'preferences': (profile.preferences or '')[:2000] if profile else '',
            'direction': (profile.direction or '')[:1000] if profile else '',
            'experiences': experiences, 'recent_posts': recent,
            'rules': '记录只证明其中明确的实际结果，不证明计划已经完成。仅选与主题相关的经历；无相关经历也可以基于材料表达观点。近期正文用于避免重复表达，不是固定模板。'}


VOICE_GUIDANCE = '''
标题建议15–25字，最多32字，禁止 emoji；只讲一个具体主题或关注点，避免把摘要、多个卖点或整句长铺垫塞进标题。人物风格主要通过正文表达。
向读者讲述你自己的理解，而不是交付资料汇总报告。结合角色的性格、职业、偏好，决定关注点、语气和组织方式。
新闻围绕具体事件讲清变化及你在意的地方；专题围绕一个问题解释和推理。允许质疑、比较、解释、期待、保留意见或不表态。
事实必须有素材支持，推测与个人判断要明确说明。不要用角色设定替代证据，不把计划、失败活动或别人的经历写成自己经历。
根据资料调整原先表达方向，不为了保持立场忽略反证。不强制第一人称、口头禅、情绪、固定开场或结尾；避免机械的逐点罗列，但合适的列表可以使用。
发布前自查是否围绕具体问题、是否有角色自己的关注或理解、是否与近期作品重复；不要输出自查过程。
排版完全可选，纯文字有效，不追求装饰数量。支持 Markdown 表格；++重点++ 红色划线、^^重点^^ 蓝色波浪线、==重点== 高亮。
支持 fenced chart 图表，例如：
```chart
type: bar
title: 对比（单位：元）
项目甲,100
项目乙,120
```
chart 类型限 bar、line、pie、wordcloud。数值只能来自本次采用素材，图旁写清单位、统计口径、时间和来源，不混用不可比较的数据，不凭空生成频次或权重。
支持 fenced mermaid 非数值示意图，使用 flowchart、sequenceDiagram、stateDiagram-v2、classDiagram、erDiagram 或 mindmap；关系同样应有依据。
没有可靠数值时选择文字或非数值示意图；不要生成图片、图片占位符、HTML 或可执行脚本。
'''
