"""0075 使用的内置目录冻结副本；迁移不得依赖会随版本变化的运行时默认值。"""

CROPS = {
    'radish': {'name': '萝卜', 'growth_seconds': 3600, 'seed_price': 10, 'yield': 1, 'sale_price': 18},
    'potato': {'name': '土豆', 'growth_seconds': 7200, 'seed_price': 20, 'yield': 2, 'sale_price': 18},
    'corn': {'name': '玉米', 'growth_seconds': 14400, 'seed_price': 35, 'yield': 3, 'sale_price': 20},
    'peanut': {'name': '花生', 'growth_seconds': 21600, 'seed_price': 50, 'yield': 4, 'sale_price': 23},
    'soybean': {'name': '大豆', 'growth_seconds': 10800, 'seed_price': 28, 'yield': 3, 'sale_price': 17},
    'strawberry': {'name': '草莓', 'growth_seconds': 7200, 'seed_price': 40, 'yield': 2, 'sale_price': 35},
    'pumpkin': {'name': '南瓜', 'growth_seconds': 28800, 'seed_price': 70, 'yield': 2, 'sale_price': 65},
    'sunflower': {'name': '向日葵', 'growth_seconds': 43200, 'seed_price': 90, 'yield': 5, 'sale_price': 34},
    'wheat': {'name': '小麦', 'growth_seconds': 21600, 'seed_price': 45, 'yield': 4, 'sale_price': 21},
    'rice': {'name': '水稻', 'growth_seconds': 28800, 'seed_price': 60, 'yield': 4, 'sale_price': 28},
    'tomato': {'name': '番茄', 'growth_seconds': 10800, 'seed_price': 30, 'yield': 3, 'sale_price': 19},
    'cabbage': {'name': '卷心菜', 'growth_seconds': 14400, 'seed_price': 32, 'yield': 2, 'sale_price': 29},
    'cucumber': {'name': '黄瓜', 'growth_seconds': 7200, 'seed_price': 24, 'yield': 2, 'sale_price': 21},
    'eggplant': {'name': '茄子', 'growth_seconds': 14400, 'seed_price': 38, 'yield': 3, 'sale_price': 23},
    'chili': {'name': '辣椒', 'growth_seconds': 10800, 'seed_price': 26, 'yield': 4, 'sale_price': 13},
    'onion': {'name': '洋葱', 'growth_seconds': 18000, 'seed_price': 36, 'yield': 3, 'sale_price': 23},
}


FERTILIZERS = {
    'quality': {'name': '品质肥', 'base_price': 15, 'fluctuation': 5, 'quality_bonus': 0.10, 'yield_percentage': 0},
    'yield': {'name': '增产肥', 'base_price': 35, 'fluctuation': 10, 'quality_bonus': 0, 'yield_percentage': 25},
}
