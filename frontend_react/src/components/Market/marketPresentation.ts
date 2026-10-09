export const marketOperationLabels: Record<string, string> = {
    adjust_life_budget: '调整采购预算（不计市场次数）',
    buy_shop: '购买商店商品', buy_listing: '购买居民商品', sell: '出售给商店', list: '上架商品', reprice: '调整价格', withdraw: '撤回商品',
    get_market_shop: '查看系统商店', list_market_listings: '浏览居民集市', get_my_market_listings: '查看我的挂牌', get_my_market_transactions: '查看成交', get_market_context: '查看经营需求', enter_market: '进入市场', buy_market_shop: '购买商店商品', buy_market_listing: '购买居民商品', sell_to_market_shop: '出售给商店', create_market_listing: '上架商品', reprice_market_listing: '调整价格', withdraw_market_listing: '撤回商品', leave_market: '离开市场',
};
export const marketTime = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '—';
export const marketMoney = (value: string) => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2});
