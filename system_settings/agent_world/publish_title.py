"""新生成帖子标题的表达约束；历史稿件不追溯改写。"""
import re


_EMOJI = re.compile(
    '[\U0001f000-\U0001faff\u2600-\u27bf\u2300-\u23ff'
    '\u00a9\u00ae\u203c\u2049\u2122\u2139\u2194-\u2199\u21a9\u21aa'
    '\u2b05-\u2b07\u2b1b\u2b1c\u2b50\u2b55\u3030\u303d\u3297\u3299\ufe0f\u200d\u20e3]'
)


def validate_title(title: str) -> None:
    if len(title.strip()) > 32:
        raise ValueError('标题最多32字，建议15–25字，聚焦一个具体关注点，删去长串铺垫')
    if _EMOJI.search(title):
        raise ValueError('标题禁止 emoji，请用简洁文字表达，人物风格放在正文中')
