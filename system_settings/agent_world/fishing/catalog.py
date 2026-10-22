"""版本化首版内容；进行中的出钓使用自己的完整快照。"""
from copy import deepcopy

VERSION = 'fishing-1.0.0'
BAITS = {
    'worm': {'name': '蚯蚓', 'price': '1'},
    'dough': {'name': '面团', 'price': '1'},
    'corn': {'name': '玉米', 'price': '2'},
    'minnow': {'name': '小鱼饵', 'price': '3'},
    'shrimp': {'name': '鲜虾', 'price': '3'},
}
SPOTS = {
    'pond': {'name': '青苇池塘', 'required_level': 1},
    'river': {'name': '流光河湾', 'required_level': 10},
    'lake': {'name': '镜月湖畔', 'required_level': 20},
}
# id, 名称, 钓点, 等级, 偏好饵, 可接受饵, 活跃时段, 重量公斤范围, 回收价, 鱼王
FISH_ROWS = [
    ('crucian', '鲫鱼', 'pond', 1, 'worm', 'dough', [[0,24]], [.1,.8], '2', False),
    ('bitterling', '彩鳑鲏', 'pond', 3, 'dough', 'worm', [[0,24]], [.02,.08], '3', False),
    ('carp', '鲤鱼', 'pond', 6, 'corn', 'dough', [[5,9],[17,21]], [.5,4], '5', False),
    ('snakehead', '乌鳢', 'pond', 9, 'minnow', 'shrimp', [[0,24]], [1,6], '6', False),
    ('golden_carp', '金鳞鲤王', 'pond', 12, 'shrimp', 'minnow', [[17,21]], [5,12], '60', True),
    ('dace', '白条', 'river', 10, 'dough', 'worm', [[0,24]], [.1,.5], '6', False),
    ('yellow_catfish', '黄颡鱼', 'river', 12, 'worm', 'shrimp', [[0,24]], [.2,1.2], '7', False),
    ('catfish', '鲶鱼', 'river', 16, 'minnow', 'worm', [[21,5]], [1,8], '9', False),
    ('mandarin', '鳜鱼', 'river', 19, 'shrimp', 'minnow', [[5,9],[17,21]], [.5,3], '11', False),
    ('river_king', '苍须河王', 'river', 22, 'minnow', 'shrimp', [[21,5]], [8,20], '110', True),
    ('silverfish', '银鱼', 'lake', 20, 'dough', 'worm', [[0,24]], [.02,.1], '11', False),
    ('bream', '鳊鱼', 'lake', 23, 'corn', 'dough', [[0,24]], [.5,3], '12', False),
    ('perch', '湖鲈', 'lake', 26, 'shrimp', 'minnow', [[5,9],[17,21]], [.5,5], '14', False),
    ('yellowcheek', '鳡鱼', 'lake', 30, 'minnow', 'shrimp', [[0,24]], [3,15], '16', False),
    ('moon_king', '镜月鱼王', 'lake', 35, 'shrimp', 'minnow', [[17,21]], [15,35], '160', True),
]


def builtin() -> dict:
    return {'version': VERSION, 'spots': deepcopy(SPOTS), 'baits': deepcopy(BAITS),
            'rod': {'id': 'ordinary', 'name': '普通钓竿', 'bonus': 0},
            'interval_seconds': 300, 'energy_cost': 2, 'durations': [30,60,120],
            'max_level': 50, 'empty_probability': .15, 'junk_probability': .20,
            'king_probability': .01,
            'fish': {row[0]: {'name': row[1], 'spot': row[2], 'level': row[3],
                'preferred': [row[4]], 'accepted': [row[5], *(['corn'] if row[0] == 'crucian' else [])], 'hours': row[6],
                'weight_range': row[7], 'value': row[8], 'king': row[9], 'weight': 1}
                for row in FISH_ROWS}}


def current(owner: str) -> dict:
    from .models import FishingConfig
    row = FishingConfig.objects.select_related('catalog').filter(pk=owner).first()
    return deepcopy(row.catalog.rules) if row else builtin()


def install():
    from .models import FishingCatalog
    row, _ = FishingCatalog.objects.get_or_create(pk=VERSION, defaults={'rules': builtin()})
    if row.rules != builtin():
        raise ValueError('同版本钓鱼目录内容不一致，请升级目录版本')
    return row
