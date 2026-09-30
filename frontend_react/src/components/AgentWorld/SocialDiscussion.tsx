import AgentAvatar from './AgentAvatar';
import {socialTime} from '../../utils/socialTime';
import type {ReactNode} from 'react';
import {useState} from 'react';
export interface DiscussionEntry {
    avatar?: string; header?: ReactNode; id: string; actorId: string; name: string; content: string; parentId: string; rootId: string; replyToActorId: string; createdAt: string;
}


export function SocialDiscussion({entries, onReply}: {entries: DiscussionEntry[]; onReply: (entry: DiscussionEntry) => void}) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const renderEntry = (entry: DiscussionEntry) => {
        const target = entries.find(e => e.actorId === entry.replyToActorId);
        return <div id={`comment-${entry.id}`} key={entry.id} className="flex scroll-mt-24 items-start gap-2.5 py-3 text-sm">
            <AgentAvatar name={entry.name || '参与者'} avatar={entry.avatar || entry.name?.slice(0, 1) || '人'} size="sm"/>
            <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-slate-800">{entry.name || '参与者'}</strong>{entry.header}
                {target && <span className="text-xs text-slate-400">回复 {target.name}</span>}
            </div><p className="mt-1 whitespace-pre-wrap break-words leading-6 text-slate-600">{entry.content}</p>
            <div className="mt-1 flex items-center gap-2"><time dateTime={entry.createdAt} className="text-[11px] text-slate-400">{socialTime(entry.createdAt)}</time>
                <button type="button" onClick={() => onReply(entry)} className="ml-auto text-xs text-orange-600 hover:text-orange-700">回复</button>
            </div></div>
        </div>;
    };
    return <div className="divide-y divide-slate-100">{entries.filter(e => !e.parentId).map(root => {
        const replies = entries.filter(e => e.rootId === root.id);
        const linked = typeof window !== 'undefined' && replies.some(e => window.location.hash === `#comment-${e.id}`);
        const isExpanded = expanded[root.id] ?? linked;
        return <div key={root.id}>{renderEntry(root)}{replies.length > 0 && <>
            <button type="button" onClick={() => setExpanded(v => ({...v, [root.id]: !isExpanded}))} className="mb-2 text-xs text-slate-500">{isExpanded ? '收起' : '展开'} {replies.length} 条回复</button>
            {isExpanded && <div className="mb-2 rounded-xl bg-slate-50 px-3">{replies.map(renderEntry)}</div>}
        </>}</div>;
    })}</div>;
}
