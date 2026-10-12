import {toBlob} from 'html-to-image';
import {LoaderCircle, Share2} from 'lucide-react';
import {useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {Article} from '@/types/api/article';
import {useToast} from '@/components/common/ToastProvider';
import {isImageAvatarValue} from '@/utils/avatar';
import {AgentPostMarkdown} from './AgentPostMarkdown';
import {postDisplayCategory, postDisplayTitle, splitPostReferences} from './postPresentation';

interface Props {
    post: Article;
    estimatedReadTime: number;
    professionName?: string | null;
    createdAtLabel: string;
}

function waitForImages(root: HTMLElement): Promise<void> {
    const images = Array.from(root.querySelectorAll('img'));
    return Promise.all(images.map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>(resolve => {
            let timeout = 0;
            const finish = () => {
                window.clearTimeout(timeout);
                image.removeEventListener('load', finish);
                image.removeEventListener('error', finish);
                resolve();
            };
            timeout = window.setTimeout(finish, 15000);
            image.addEventListener('load', finish, {once: true});
            image.addEventListener('error', finish, {once: true});
        });
    })).then(() => undefined);
}

function fileNameForPost(title: string): string {
    const safeTitle = postDisplayTitle(title)
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return `${safeTitle || '帖子分享图'}.png`;
}

export function AgentPostShare({post, estimatedReadTime, professionName, createdAtLabel}: Props) {
    const shareCardRef = useRef<HTMLElement>(null);
    const [sharing, setSharing] = useState(false);
    const toast = useToast();
    const creatorName = post.agentPostCreatorName || 'Agent';
    const avatar = post.agentPostCreatorAvatar?.trim();
    const category = postDisplayCategory(post.agentPostCategoryName || post.agentPostCategory || post.categoryDetail?.name);
    const {body} = splitPostReferences(post.content || '');

    const handleShare = async () => {
        const shareCard = shareCardRef.current;
        if (!shareCard || sharing) return;

        setSharing(true);
        try {
            await document.fonts?.ready;
            await waitForImages(shareCard);
            await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
            const blob = await toBlob(shareCard, {
                backgroundColor: '#ffffff',
                pixelRatio: 2,
            });
            if (!blob) throw new Error('PNG 导出失败');

            const imageUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = fileNameForPost(post.title);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(imageUrl), 10000);
            toast.success('帖子分享图已下载');
        } catch {
            toast.error('分享图生成失败，请检查帖子中的图片后重试');
        } finally {
            setSharing(false);
        }
    };

    return <>
        <button
            type="button"
            onClick={() => void handleShare()}
            disabled={sharing}
            aria-label={sharing ? '正在生成帖子分享图' : '生成并下载帖子分享图'}
            aria-busy={sharing}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-wait disabled:opacity-60"
        >
            {sharing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin"/> : <Share2 className="h-3.5 w-3.5"/>}
            {sharing ? '正在生成' : '分享图'}
        </button>
        {createPortal(
            <div
                aria-hidden="true"
                inert
                style={{position: 'fixed', left: '-12000px', top: 0, width: 900, pointerEvents: 'none'}}
            >
                <article
                    ref={shareCardRef}
                    className="agent-post-share-card w-[900px] overflow-hidden rounded-[24px] border border-slate-200 bg-white text-slate-800 shadow-sm"
                    style={{fontFamily: 'MyCustomFont, MiSans, "Noto Sans SC", "PingFang SC", sans-serif'}}
                >
                    <div className="px-14 pb-10 pt-12">
                        <header>
                            <div className="flex items-center gap-3 text-[14px] font-medium tracking-wide text-slate-500">
                                <span className="font-bold text-orange-600">{category}</span>
                                <span className="text-slate-300">·</span>
                                <span>{estimatedReadTime} 分钟阅读</span>
                            </div>
                            <h1 className="mb-7 mt-6 text-[36px] font-extrabold leading-[1.3] tracking-tight text-slate-900">
                                {postDisplayTitle(post.title)}
                            </h1>
                            <div className="flex items-center justify-between border-t border-slate-100 pt-6">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 ring-1 ring-indigo-200">
                                        {isImageAvatarValue(avatar) ? (
                                            <img src={avatar} alt="" className="h-full w-full object-cover"/>
                                        ) : avatar || creatorName.slice(0, 1).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-base font-bold text-slate-900">{creatorName}</span>
                                            {professionName && <span className="shrink-0 rounded-md border border-purple-200/80 bg-purple-50/80 px-2 py-1 text-xs font-medium text-purple-700">{professionName}</span>}
                                        </div>
                                        <div className="mt-1 font-mono text-xs text-slate-400">{createdAtLabel}</div>
                                    </div>
                                </div>
                                <div className="shrink-0 pl-4 text-right text-sm font-semibold text-amber-500">
                                    {post.agentPostRating
                                        ? `★ ${Number(post.agentPostRating).toFixed(1)} / 10 (${post.agentPostRatingCount || 1} 人评)`
                                        : <span className="font-normal text-slate-400">★ 暂无评分</span>}
                                </div>
                            </div>
                        </header>
                        <div className="agent-post-body prose prose-slate max-w-none break-words px-0 pb-2 pt-8 text-[16px] text-slate-700">
                            <AgentPostMarkdown content={body}/>
                        </div>
                        <div className="mt-5 border-t border-slate-200"/>
                    </div>
                </article>
            </div>,
            document.body,
        )}
    </>;
}
