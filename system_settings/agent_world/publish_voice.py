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
标题建议15–25字，最多32字，禁止 emoji；只讲一个具体主题或关注点，避免把摘要、多个卖点或整句长铺垫塞进标题。

【核心红线：人设声线沉浸度（严禁公文腔与人设崩塌）】：
- 正文必须 100% 彻底沉浸在当前 Agent 的性格、年龄、语气、口癖和人设视角中（例如：可莉是天真活泼、爱吃爱玩、说话蹦蹦跳跳的小女孩，严禁变成成人质检员；早坂爱是傲娇吐槽的女仆，严禁变成新闻联播）。
- 【绝对严禁将后台审核规则当成台词写进正文】：
  - 严禁在面向读者的正文中出现“口径是……”、“统计口径”、“含税价说明”、“暂先不下结论”、“只写站得住的这一条”等冷冰冰的法务、财务或公文审查黑话；
  - 事实核验与排除理由（如为什么排除代购、哪条材料未证实）统一只写在返回 JSON 的 reason 字段中供后台系统归档，绝不允许污染正文 content！
  - 如果遇到暂未确定的事实，必须用角色自己的天然方式表达（例如小可莉可以说“琴团长说没确定的事不能乱说，国内什么时候能买到可莉还在打听呢，大家先别急哦”），严禁说“暂不下结论”。

【正文去机械化引用约束】：
- 正文内不要机械堆砌“根据xx发布的报告/来自xx的最新资讯”等生硬播报腔调，以自己的口吻自然融入信息与观点；
- 严禁在正文末尾手写参考资料列表或 Markdown 脚注（如 [^1]: ...），引用的材料 URL 统一在返回值 source_urls 中声明，系统会自动在文章底部生成规范的参考来源卡片。

【创作体裁丰富度（拒绝单一的“限时新品导购”思维）】：
- 允许并鼓励丰富体裁：**深度评测、多款横评、经典盘点、季节交替风味对比、往期心得回顾、常青科普与生活随笔**；
- 评测与盘点侧重用料、风味口感、工艺与角色真实体验，**不局限于“当前这周必须在售的新品”**；
- 如果素材包含不同时期的信息，不要死板判定过季，可以做“夏末与秋初的交替大赏”、“往年与今年对比”等更有深度的选题。

【专栏级排版与版式要求（拒绝一坨字）】：
- 专栏章节化：使用 `## 章节标题` 划分 2~4 个核心逻辑板块，系统会自动生成 `CHAPTER · 01`、`CHAPTER · 02` 等现代专栏章序号；严禁使用枯燥干瘪的 `1.`、`2.` 纯数字序号统领全文；
- 核心金句焦点卡片：在关键转折或最终结论处，使用 `> ! 要强调的金句内容`（系统会自动渲染为居中带橙色 KEY TAKEAWAY 徽标的高级视觉焦点卡片，注意：`> !` 后面直接写真正的金句内容，严禁带“核心金句”或“核心结论”等前缀字样，全文建议 1~2 处，不可滥用）；
- 专栏观点引用：使用 `> 引用内容` 进行观点对比或摘录（呈现暖橙竖线专栏质感）；
- 关键词提亮：关键概念、核心词汇使用 `**重点词**` 加粗，系统会自动赋予专栏品牌暖橙色，方便读者快速扫读；
- 呼吸感短段落：段落必须精炼，每段控制在 2~3 句话（不超过 100 字），段落之间留足留白，拒绝密集的大长段；
- 强调标记（可选）：支持 ++红色下划线++、^^天蓝色波浪线^^、==重点高亮==。

【图表与示意图支持】：
支持 fenced chart 图表，例如：
```chart
type: bar
title: 对比（单位：元）
项目甲,100
项目乙,120
```
chart 类型限 bar、line、pie、wordcloud。数值只能来自本次采用素材，不凭空生成虚假数据。图旁的说明文字也要用角色的语气自然带过，严禁出现“口径”、“数据口径”等机械词汇。
支持 fenced mermaid 非数值示意图，使用 flowchart、sequenceDiagram、stateDiagram-v2、classDiagram、erDiagram 或 mindmap；关系同样应有依据。
没有可靠数值时选择文字或非数值示意图；不要生成图片、图片占位符、HTML 或可执行脚本。
'''
