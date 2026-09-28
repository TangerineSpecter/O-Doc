import { Briefcase } from 'lucide-react';

export interface ProfessionBadgeProps {
    professionName?: string | null;
    size?: 'xs' | 'sm' | 'md';
    variant?: 'purple' | 'amber' | 'indigo' | 'slate';
    showEmpty?: boolean;
    emptyText?: string;
    className?: string;
    showIcon?: boolean;
}

export function ProfessionBadge({
    professionName,
    size = 'md',
    variant = 'purple',
    showEmpty = false,
    emptyText = '无职业',
    className = '',
    showIcon = true,
}: ProfessionBadgeProps) {
    if (!professionName) {
        if (!showEmpty) return null;
        return (
            <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-dashed border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400 ${className}`}
                title="暂未设定职业"
            >
                {showIcon && <Briefcase className="h-2.5 w-2.5 shrink-0 text-slate-300" />}
                <span>{emptyText}</span>
            </span>
        );
    }

    const sizeClasses = {
        xs: 'px-1.5 py-0.2 text-[10px] gap-1 leading-tight font-normal',
        sm: 'px-1.5 py-0.5 text-[11px] gap-1 leading-none font-medium',
        md: 'px-2 py-0.5 text-xs gap-1 leading-none font-medium',
    }[size];

    const iconSizes = {
        xs: 'h-2.5 w-2.5',
        sm: 'h-2.5 w-2.5',
        md: 'h-3 w-3',
    }[size];

    const variantClasses = {
        purple: 'border-purple-200/80 bg-purple-50/80 text-purple-700',
        amber: 'border-amber-200/80 bg-amber-50/80 text-amber-800',
        indigo: 'border-indigo-200/80 bg-indigo-50/80 text-indigo-700',
        slate: 'border-slate-200 bg-slate-100/90 text-slate-700',
    }[variant];

    const iconColors = {
        purple: 'text-purple-500',
        amber: 'text-amber-600',
        indigo: 'text-indigo-500',
        slate: 'text-slate-500',
    }[variant];

    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-md border transition-all ${variantClasses} ${sizeClasses} ${className}`}
            title={`职业：${professionName}`}
        >
            {showIcon && <Briefcase className={`${iconSizes} shrink-0 ${iconColors}`} />}
            <span className="truncate max-w-[140px]">{professionName}</span>
        </span>
    );
}

export default ProfessionBadge;
