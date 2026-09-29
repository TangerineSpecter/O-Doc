export const investmentMoney = (value: string | number | null) =>
    value === null
        ? '—'
        : Number(value).toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
          });

export const investmentSignedMoney = (value: string | number | null) => {
    if (value === null) return '—';
    const num = Number(value);
    const formatted = Math.abs(num).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    if (num > 0) return `+${formatted}`;
    if (num < 0) return `-${formatted}`;
    return formatted;
};

export const investmentTime = (value: string) =>
    new Date(value).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

export const profitClass = (value: string | number | null) => {
    const num = Number(value);
    if (num > 0) return 'text-rose-600';
    if (num < 0) return 'text-emerald-600';
    return 'text-slate-600';
};

export const profitBadgeClass = (value: string | number | null) => {
    const num = Number(value);
    if (num > 0) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (num < 0) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-100 text-slate-600 border-slate-200';
};
