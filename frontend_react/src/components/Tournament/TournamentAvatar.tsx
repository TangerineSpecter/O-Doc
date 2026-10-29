import {useState} from 'react';

interface TournamentAvatarProps {
    name?: string;
    avatar?: string;
    place?: 1 | 2 | 3;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}

export function TournamentAvatar({name = '', avatar, place, size = 'sm', className = ''}: TournamentAvatarProps) {
    const [failed, setFailed] = useState(false);
    const isImage = Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));
    const initial = (name || '').trim().charAt(0) || '·';

    const sizeClasses = {
        xs: 'h-5 w-5 text-[10px]',
        sm: 'h-7 w-7 text-xs',
        md: 'h-9 w-9 text-sm',
        lg: 'h-11 w-11 text-base',
    }[size];

    const ringClasses = size === 'xs'
        ? place === 1
            ? 'ring-1 ring-amber-400'
            : place === 2
            ? 'ring-1 ring-blue-400'
            : place === 3
            ? 'ring-1 ring-orange-400'
            : 'ring-1 ring-slate-200'
        : place === 1
        ? 'ring-2 ring-amber-400 ring-offset-1'
        : place === 2
        ? 'ring-2 ring-blue-300 ring-offset-1'
        : place === 3
        ? 'ring-2 ring-orange-400 ring-offset-1'
        : 'ring-1 ring-slate-200';

    if (isImage && !failed) {
        return (
            <img
                src={avatar}
                alt={name}
                loading="lazy"
                onError={() => setFailed(true)}
                className={`${sizeClasses} ${ringClasses} shrink-0 rounded-full object-cover bg-slate-100 shadow-2xs ${className}`}
            />
        );
    }

    if (avatar && !isImage) {
        return (
            <span
                className={`${sizeClasses} ${ringClasses} shrink-0 inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 font-semibold leading-none select-none shadow-2xs ${className}`}
            >
                {avatar}
            </span>
        );
    }

    const bgColors = [
        'bg-orange-100 text-orange-700',
        'bg-blue-100 text-blue-700',
        'bg-emerald-100 text-emerald-700',
        'bg-purple-100 text-purple-700',
        'bg-amber-100 text-amber-800',
        'bg-rose-100 text-rose-700',
    ];
    const colorIdx = name ? name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % bgColors.length : 0;
    const colorClass = bgColors[colorIdx];

    return (
        <span
            className={`${sizeClasses} ${ringClasses} ${colorClass} shrink-0 inline-flex items-center justify-center rounded-full font-bold leading-none select-none shadow-2xs ${className}`}
        >
            {initial}
        </span>
    );
}
