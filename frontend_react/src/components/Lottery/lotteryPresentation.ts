export const lotteryDate = (value: string) => new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

export const lotteryMoney = (value: string) => Number(value).toLocaleString('zh-CN', {maximumFractionDigits: 2});
export const lotteryTier = (tier: number) => ['', '一等奖', '二等奖', '三等奖'][tier] || '未中奖';

