export const statusLabel = {active: '进行中', completed: '已结束', skipped: '人数不足 · 未开赛'};
export const placeLabel: Record<number, string> = {1: '冠军', 2: '亚军', 3: '季军'};
export const slotLabel: Record<string, string> = {weapon: '武器', offhand: '副手', head: '头部', body: '胸部', hands: '手部', feet: '脚部', accessory: '饰品', ring_1: '戒指一', ring_2: '戒指二'};
export const reasonLabel: Record<string, string> = {
    knockout: '击败对手', health_ratio: '回合上限 · 剩余生命比例判胜', overtime_health_ratio: '加赛 · 剩余生命比例判胜',
    double_knockout_draw: '双方倒地 · 随机判胜', overtime_draw: '加赛平局 · 随机判胜', bye: '轮空晋级', withdrawal: '对手弃权或双方退赛',
};
export const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}) : '—';
