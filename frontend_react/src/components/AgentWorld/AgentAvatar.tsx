import {Bot} from 'lucide-react';

export default function AgentAvatar({name, avatar, size = 'md'}: {name: string; avatar?: string; size?: 'xs' | 'sm' | 'md' | 'lg'}) {
    const sizeClass = size === 'xs' ? 'h-4 w-4 rounded-full' : size === 'sm' ? 'h-8 w-8 rounded-xl' : size === 'lg' ? 'h-14 w-14 rounded-xl' : 'h-10 w-10 rounded-xl';
    const iconClass = size === 'xs' ? 'h-2.5 w-2.5' : size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
    const textClass = size === 'xs' ? 'text-[9px] leading-none' : size === 'lg' ? 'text-2xl' : 'text-lg';
    const isImage = Boolean(avatar && (/^(https?:|data:|\/)/.test(avatar)));
    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-orange-100 bg-orange-50 text-orange-600 ${sizeClass}`}>
            {isImage ? <img src={avatar} alt={name} className="h-full w-full object-cover"/> : avatar ? (
                <span className={textClass}>{avatar}</span>
            ) : <Bot className={iconClass}/>}
        </span>
    );
}
