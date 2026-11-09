import type {LucideIcon} from 'lucide-react';
import {
    BookOpen,
    Camera,
    Disc3,
    Feather,
    FileText,
    Landmark,
    Leaf,
    Mail,
    Plane,
    Receipt,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {MemoItem} from '../../../types/api/memo';

export type PosterStyleId =
    | 'stamp'
    | 'receipt'
    | 'polaroid'
    | 'magazine'
    | 'journal'
    | 'boarding'
    | 'museum'
    | 'vinyl'
    | 'shiori'
    | 'herbarium';

export interface PosterStyleMeta {
    id: PosterStyleId;
    name: string;
    tagline: string;
    icon: LucideIcon;
}

export const posterStyles: PosterStyleMeta[] = [
    {id: 'stamp', name: '纪念邮票', tagline: '雕版齿孔 · 志号与水波销戳', icon: Mail},
    {id: 'receipt', name: '灵感小票', tagline: '锯齿热敏单 · 灵感特调配方', icon: Receipt},
    {id: 'polaroid', name: '拍立得', tagline: '日光显影 · 暖调胶片与和纸贴', icon: Camera},
    {id: 'magazine', name: '杂志大刊', tagline: '独立文摘 · 极简黑曜石', icon: BookOpen},
    {id: 'journal', name: '手账便签', tagline: '双线圈本 · 日历拼贴与火漆印', icon: FileText},
    {id: 'boarding', name: '登机牌', tagline: '头等舱航线 · 撕线副券与登机码', icon: Plane},
    {id: 'museum', name: '展览画签', tagline: '策展画框 · 几何艺术与馆藏铭牌', icon: Landmark},
    {id: 'vinyl', name: '黑胶歌词', tagline: '日版侧标腰封 · 奶油黑胶内页', icon: Disc3},
    {id: 'shiori', name: '东方花笺', tagline: '海棠纹框 · 宣纸水墨与朱砂闲章', icon: Feather},
    {id: 'herbarium', name: '植物标本', tagline: '自然博物志 · 手绘柑橘与标本签', icon: Leaf},
];

export interface PosterDateInfo {
    dayNum: string;
    monthNum: string;
    yearNum: string;
    weekdayName: string;
    timeStr: string;
    monthEnShort: string;
}

export interface PosterCardProps {
    memo: MemoItem;
    author: string;
    dateInfo: PosterDateInfo;
    isShort: boolean;
    contentLength: number;
}

const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function formatPosterDate(createdAt: string): PosterDateInfo {
    const date = new Date(createdAt);
    const isValidDate = !Number.isNaN(date.getTime());
    const monthIdx = isValidDate ? date.getMonth() : 0;
    return {
        dayNum: isValidDate ? String(date.getDate()).padStart(2, '0') : '--',
        monthNum: isValidDate ? String(monthIdx + 1).padStart(2, '0') : '--',
        yearNum: isValidDate ? String(date.getFullYear()) : '----',
        weekdayName: isValidDate ? date.toLocaleDateString('zh-CN', {weekday: 'short'}) : '周日',
        timeStr: isValidDate
            ? date.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false})
            : '12:00',
        monthEnShort: isValidDate ? MONTH_EN[monthIdx] || 'JAN' : 'JAN',
    };
}

interface PosterMarkdownProps {
    content: string;
    blockquoteClassName?: string;
    codeClassName?: string;
    paragraphClassName?: string;
}

export function PosterMarkdown({
    content,
    blockquoteClassName = 'my-2.5 border-l-2 border-orange-500 pl-3 italic opacity-85',
    codeClassName = 'rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.88em]',
    paragraphClassName = 'mb-3.5 last:mb-0 whitespace-pre-line',
}: PosterMarkdownProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({children}) => <p className={paragraphClassName}>{children}</p>,
                blockquote: ({children}) => (
                    <blockquote className={blockquoteClassName}>{children}</blockquote>
                ),
                code: ({children}) => <code className={codeClassName}>{children}</code>,
                ul: ({children}) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                ol: ({children}) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
            }}
        >
            {content}
        </ReactMarkdown>
    );
}
