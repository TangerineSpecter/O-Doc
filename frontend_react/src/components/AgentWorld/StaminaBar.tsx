import { Battery, BatteryMedium, BatteryLow, BatteryWarning } from 'lucide-react';

export interface StaminaBarProps {
    stamina?: string | number | null;
    maxStamina?: number;
    showText?: boolean;
    size?: 'sm' | 'md';
    className?: string;
}

export function StaminaBar({
    stamina,
    maxStamina = 100,
    showText = true,
    size = 'md',
    className = '',
}: StaminaBarProps) {
    if (stamina == null || stamina === '') return null;

    const rawNum = typeof stamina === 'number' ? stamina : parseFloat(stamina);
    if (isNaN(rawNum)) return null;

    const max = maxStamina > 0 ? maxStamina : 100;
    const clamped = Math.max(0, Math.min(max, rawNum));
    const percent = Math.round((clamped / max) * 100);

    // 格式化数值：去除非必要的尾随零（如 100.00 -> 100），非整数保留1位小数（如 85.50 -> 85.5）
    const formattedCurrent = Number.isInteger(rawNum) || rawNum % 1 === 0 ? Math.round(rawNum) : Number(rawNum.toFixed(1));

    // 根据不同体力区间设置对应颜色样式与电池图标
    // >= 60%: 充沛活力 (绿)
    // 20% ~ 59%: 消耗进行中 (琥珀/橙)
    // < 20%: 疲惫匮乏 (红)
    const isHigh = percent >= 60;
    const isMedium = percent >= 20 && percent < 60;

    let Icon = Battery;
    let theme = {
        container: 'border-emerald-200/90 bg-emerald-50/80 text-emerald-700',
        icon: 'text-emerald-600',
        text: 'text-emerald-700',
        track: 'bg-emerald-100',
        bar: 'bg-emerald-500',
        value: 'text-emerald-800',
    };

    if (isMedium) {
        Icon = BatteryMedium;
        theme = {
            container: 'border-amber-200/90 bg-amber-50/80 text-amber-700',
            icon: 'text-amber-600',
            text: 'text-amber-700',
            track: 'bg-amber-100',
            bar: 'bg-amber-500',
            value: 'text-amber-800',
        };
    } else if (!isHigh) {
        Icon = percent < 10 ? BatteryWarning : BatteryLow;
        theme = {
            container: 'border-rose-200/90 bg-rose-50/80 text-rose-700',
            icon: 'text-rose-600',
            text: 'text-rose-700',
            track: 'bg-rose-100',
            bar: 'bg-rose-500',
            value: 'text-rose-800',
        };
    }

    const sizeConfig = {
        sm: {
            container: 'px-1.5 py-0.5 text-[11px] gap-1',
            icon: 'h-2.5 w-2.5',
            label: 'text-[10px]',
            bar: 'h-1.5 w-8 sm:w-10',
            value: 'text-[10px]',
        },
        md: {
            container: 'px-2 py-0.5 text-xs gap-1.5',
            icon: 'h-3 w-3',
            label: 'text-[11px]',
            bar: 'h-1.5 w-10 sm:w-12',
            value: 'text-[11px]',
        },
    }[size];

    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full border leading-none transition-colors select-none ${sizeConfig.container} ${theme.container} ${className}`}
            title={`体力：${formattedCurrent} / ${max} (${percent}%)\n满额 100 点，每小时自动恢复 5 点`}
            role="progressbar"
            aria-label={`体力 ${formattedCurrent}/${max}`}
            aria-valuenow={clamped}
            aria-valuemin={0}
            aria-valuemax={max}
        >
            <Icon className={`shrink-0 ${sizeConfig.icon} ${theme.icon}`} />
            {showText && (
                <span className={`font-medium ${sizeConfig.label} ${theme.text}`}>
                    体力
                </span>
            )}
            <span className={`inline-block overflow-hidden rounded-full ${sizeConfig.bar} ${theme.track}`}>
                <span
                    className={`block h-full rounded-full transition-all duration-300 ${theme.bar}`}
                    style={{ width: `${percent}%` }}
                />
            </span>
            <span className={`font-mono font-semibold tabular-nums ${sizeConfig.value}`}>
                {formattedCurrent} / {max}
            </span>
        </span>
    );
}

export default StaminaBar;
