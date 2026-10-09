"""Enabled subject catalogs; old goal IDs remain readable in historical proposals."""
from rest_framework.exceptions import ValidationError

GOALS = {
    'email': ('能写清楚、礼貌的简单工作邮件，表达请求、说明进度并回复同事', 'work'),
    'meeting': ('能在工作会议中说明进度、提出问题并确认他人的意思', 'work'),
    'conversation': ('能与同事进行常见日常交流，表达需求并回应简单问题', 'work'),
    'dining': ('能在旅行中点餐、询问菜品并说明饮食需求', 'travel'),
    'directions': ('能在旅行中问路、理解简单指路并确认交通信息', 'travel'),
    'hotel': ('能办理住宿、询问设施并说明常见住宿问题', 'travel'),
    'shopping': ('能在旅行中购物、询价并确认商品与支付信息', 'travel'),
    'expressions': ('能在常见生活情境中使用基本英语表达，清楚说明需求', 'grammar'),
    'reading': ('能理解短篇英文材料的主旨与关键信息，并用简单语言说明理解', 'grammar'),
    'grammar': ('能在具体句子和场景中正确使用常见语法，并解释常见错误', 'grammar'),
    'unsure': ('先通过轻量初测了解常用表达、阅读与语法表现，再确认适合的阶段学习方向', 'grammar'),
}
GOALS.update({
    'work': ('能在常见工作情境中使用英语进行沟通，包括邮件、会议与同事交流；具体重点由初测和阶段计划确定', 'work'),
    'travel': ('能在旅行中使用英语完成常见交流，包括点餐、问路、交通、住宿与购物；具体重点由初测和阶段计划确定', 'travel'),
    'foundation': ('提升常用英语表达、阅读理解和语法应用能力；根据初测与实际表现安排薄弱点和阶段重点', 'grammar'),
})

SUBJECTS = {
    'english': {
        'name': '英语', 'goals': GOALS,
        'directions': [
            {'id': 'work', 'label': '工作沟通', 'description': '邮件、会议、同事交流'},
            {'id': 'travel', 'label': '旅行交流', 'description': '点餐、问路、交通、住宿、购物'},
            {'id': 'foundation', 'label': '基础提升', 'description': '常用表达、阅读、语法应用'},
            {'id': 'unsure', 'label': '还不确定，让老师推荐', 'description': '先初测，再确定方向'},
        ],
        'legacy_directions': {'email': 'work', 'meeting': 'work', 'conversation': 'work',
                              'dining': 'travel', 'directions': 'travel', 'hotel': 'travel', 'shopping': 'travel',
                              'expressions': 'foundation', 'reading': 'foundation', 'grammar': 'foundation'},
    },
}


def subject_definition(subject: str) -> dict:
    if subject not in SUBJECTS:
        raise ValidationError('该学习内容尚未开放，请选择已支持的学科')
    return SUBJECTS[subject]


def catalog_data() -> dict:
    return {'subjects': [{'id': key, 'name': item['name'], 'directions': item['directions'],
                          'legacy_directions': item['legacy_directions']} for key, item in SUBJECTS.items()]}
