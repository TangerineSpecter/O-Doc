import {Bot} from 'lucide-react';

export default function AgentAvatar({name, avatar, size = 'md'}: {name: string; avatar?: string; size?: 'sm' | 'md' | 'lg'}) {
    const sizeClass = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
    const isImage = Boolean(avatar && (/^(https?:|data:|\/)/.test(avatar)));
    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-orange-100 bg-orange-50 text-orange-600 ${sizeClass}`}>
            {isImage ? <img src={avatar} alt={name} className="h-full w-full object-cover"/> : avatar ? (
                <span className="text-lg">{avatar}</span>
            ) : <Bot className="h-5 w-5"/>}
        </span>
    );
}
