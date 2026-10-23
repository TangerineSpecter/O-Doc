import { isImageAvatarValue } from "../../../utils/avatar";

export const AgentAvatar = ({name, avatar, className = ''}: { name?: string; avatar?: string; className?: string }) => {
    const value = avatar?.trim();
    const initial = (name || 'A').trim().slice(0, 1).toUpperCase();
    const isImage = isImageAvatarValue(value);

    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-indigo-100 ring-1 ring-indigo-200 ${className || 'h-8 w-8 rounded-full'}`}>
            {isImage ? (
                <img src={value} alt={name || 'Agent'} className="h-full w-full object-cover" />
            ) : (
                <span className="text-[10px] font-bold text-indigo-700 leading-none select-none">{value || initial}</span>
            )}
        </span>
    );
};
