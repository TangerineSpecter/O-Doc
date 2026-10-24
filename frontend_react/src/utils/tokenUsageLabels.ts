import type {TokenRequest} from '../types/api/tokenUsage';
import {purposeNames} from './tokenUsage';

/** 展示层兼容历史阶段标识，原始请求、响应与导出中的协议字段保持原样。 */
const phaseNames: Record<string, string> = {
    daily_consolidation: '每日记忆整理', life_interleaving: '空档活动选择',
    combat_preparation: '迷宫探索准备', combat_listing_price: '探索装备挂牌定价',
    fishing_spot: '钓鱼地点选择', fishing_duration: '钓鱼时长选择',
    fishing_bait: '钓鱼携带鱼饵', fishing_duel: '鱼王猜拳',
    lottery_quantity: '大乐透购票数量', lottery_number: '大乐透逐位选号',
    market: '市场选择', market_disposition: '市场处置标记', market_equipment: '装备购买判断',
    market_plan: '市场日规划选择', life_activity: '生活活动选择', life_budget: '生活预算选择',
    farm_queue: '农场种植队列规划', cooking_recipe: '美食菜谱选择',
    cooking_quantity: '美食份数选择', cooking_continue: '美食继续制作', cooking_ingredient_strategy: '美食用料策略',
    alchemy_recipe: '炼金配方选择', alchemy_quantity: '炼金瓶数选择', alchemy_continue: '炼金继续制作',
    blacksmith_level_band: '打造等级档选择', blacksmith_slot: '打造部位选择',
    blacksmith_type: '打造类型选择', blacksmith_continue: '打造继续判断',
    blacksmith_goal_count: '打造目标登记数量', blacksmith_goal_priority: '打造材料争用选择',
    social_action: '社交行为选择', bounty_accept: '悬赏接单选择', bounty: '悬赏执行',
    travel_destination: '旅行目的地选择', travel_visit: '旅行游览', travel_event: '旅行遭遇',
    publish_category: '自主发帖分类选择', publish_preview: '发帖预览', publish: '自主发帖',
    tournament_reward_slot: '武道大会奖励部位选择', chat_tools: '对话工具调用',
};

export function requestPhaseName(row: Pick<TokenRequest, 'phase' | 'purpose'>): string {
    const phase = row.phase.trim();
    if (phaseNames[phase]) return phaseNames[phase];
    if (/[\u3400-\u9fff]/u.test(phase)) return phase;
    // 未登记的新内部标识也不能直接漏到流程标题；用途保留业务语义。
    return purposeNames[row.purpose] || '模型请求';
}
