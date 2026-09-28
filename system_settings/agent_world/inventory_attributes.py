"""纪念品的固定属性，参考价值与市场售价分开；归属变更不改来源身份。"""
import random

RARITIES = ('common', 'uncommon', 'rare', 'epic', 'legendary')


def souvenir_attributes(price):
    return {'rarity': random.choices(RARITIES, weights=(60, 25, 10, 4, 1), k=1)[0], 'value': str(price)}
