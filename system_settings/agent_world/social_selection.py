"""以居民已配置的生活偏好匹配话题；只提供轻量排序，不替代自主判断。"""
import re
from .life_models import LifeProfile


def interest_terms(actor):
    profile = LifeProfile.objects.filter(pk=actor).first()
    if not profile: return set()
    terms = set()
    for word in re.findall(r'[a-zA-Z]{3,}|[\u4e00-\u9fff]{2,}', profile.preferences):
        word = word.lower()
        if re.fullmatch(r'[a-z]+', word): terms.add(word)
        else: terms.update(word[i:i+2] for i in range(len(word)-1))
    return terms - {'喜欢', '比较', '希望', '可以', '自己', '每天', '时候'}


def interest_weight(content, terms):
    content = content.lower()
    return 1 + min(1, sum(term in content for term in terms) * .2)
