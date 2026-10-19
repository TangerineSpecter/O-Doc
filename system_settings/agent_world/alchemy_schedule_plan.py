"""日程侧只读炼金候选；具体瓶数与材料分配由执行器重新校验。"""
from .alchemy_queries import recipes


def planning_facts(owner: str, agent) -> list[dict]:
    return recipes(owner, agent)
