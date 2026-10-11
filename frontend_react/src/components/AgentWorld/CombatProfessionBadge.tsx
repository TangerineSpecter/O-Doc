import { Swords } from 'lucide-react';

export interface CombatProfessionBadgeProps {
    combatProfessionName?: string | null;
    combatLevel?: number | null;
    size?: 'xs' | 'sm' | 'md';
    variant?: 'rose' | 'amber' | 'slate';
    showEmpty?: boolean;
    emptyText?: string;
    className?: string;
    showIcon?: boolean;
    onClick?: () => void;
}

export function CombatProfessionBadge({
    combatProfessionName,
    combatLevel = 1,
    size = 'sm',
    variant = 'rose',
    showEmpty = true,
    emptyText = '新手',
    className = '',
    showIcon = true,
    onClick,
}: CombatProfessionBadgeProps) {
    const job = combatProfessionName || emptyText;
    const level = combatLevel && combatLevel > 0 ? combatLevel : 1;

    if (!job && !showEmpty) {
        return null;
    }

    const sizeClasses = {
        xs: 'px-1.5 py-0.5 text-[10px] gap-1 leading-tight font-normal',
        sm: 'px-1.5 py-0.5 text-[11px] gap-1 leading-none font-medium',
        md: 'px-2 py-0.5 text-xs gap-1 leading-none font-medium',
    }[size];

    const iconSizes = {
        xs: 'h-2.5 w-2.5',
        sm: 'h-2.5 w-2.5',
        md: 'h-3 w-3',
    }[size];

    const variantClasses = {
        rose: 'border-rose-200/80 bg-rose-50/80 text-rose-700 hover:bg-rose-100 hover:border-rose-300',
        amber: 'border-amber-200/80 bg-amber-50/80 text-amber-800 hover:bg-amber-100 hover:border-amber-300',
        slate: 'border-slate-200 bg-slate-100/90 text-slate-700 hover:bg-slate-200 hover:border-slate-300',
    }[variant];

    const iconColors = {
        rose: 'text-rose-500',
        amber: 'text-amber-600',
        slate: 'text-slate-500',
    }[variant];

    const interactiveClasses = onClick
        ? 'cursor-pointer active:scale-95 transition-all shadow-2xs hover:shadow-xs'
        : 'cursor-default transition-colors';

    return (
        <span
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            } : undefined}
            className={`inline-flex shrink-0 items-center rounded-md border ${variantClasses} ${sizeClasses} ${interactiveClasses} ${className}`}
            title={`战斗职业：${job} · 等级：Lv.${level}${onClick ? '（点击打开冒险与战斗）' : ''}`}
        >
            {showIcon && <Swords className={`${iconSizes} shrink-0 ${iconColors}`} />}
            <span className="truncate max-w-[100px]">{job}</span>
            <span className="font-semibold tabular-nums opacity-90 text-[10px]">Lv.{level}</span>
        </span>
    );
}

export default CombatProfessionBadge;
