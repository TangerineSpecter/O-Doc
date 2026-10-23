"""钓鱼资产标识与鱼饵背包容量规则。"""
import hashlib

MAX_BAIT_STOCK = 99


def energy_action_id(event_id: str) -> str:
    # WorldAction 主键最多64字符；完整出钓ID已经占满64字符，不能再直接加前缀。
    return 'fishing-energy:' + hashlib.sha256(event_id.encode()).hexdigest()[:49]
