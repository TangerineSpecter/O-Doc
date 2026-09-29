export const investmentMoney = (value: string | number | null) => value === null ? '—' : Number(value).toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
export const investmentTime = (value: string) => new Date(value).toLocaleString('zh-CN', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'});
export const profitClass = (value: string | null) => Number(value) > 0 ? 'text-rose-600' : Number(value) < 0 ? 'text-emerald-600' : 'text-slate-600';
