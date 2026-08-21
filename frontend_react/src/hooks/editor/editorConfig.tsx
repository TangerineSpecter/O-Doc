import type {KeyboardEvent as ReactKeyboardEvent, ReactNode} from 'react';
import {
    BarChart2,
    CheckSquare,
    Code,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Highlighter,
    ImageIcon,
    List,
    Minus,
    Quote,
    Sigma,
    Table as TableIcon,
    Type,
    Underline,
    Video as VideoIcon,
    Workflow,
} from 'lucide-react';

import type {CommandItem} from '../../components/Editor/SlashMenu';
import type {Category} from '../../components/Editor/EditorMetaBar';

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

export const isPreviewShortcut = (event: KeyboardEvent | ReactKeyboardEvent) => {
    return (event.metaKey || event.ctrlKey) && event.code === 'KeyE';
};

export const getLineStartIndex = (text: string, position: number) => {
    return text.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
};

export const getLineEndIndex = (text: string, position: number) => {
    const nextLineIndex = text.indexOf('\n', position);
    return nextLineIndex === -1 ? text.length : nextLineIndex;
};

const escapeHtmlAttribute = (value: string) => {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
};

const getBilibiliEmbedUrl = (url: string) => {
    try {
        const parsedUrl = new URL(url);
        const host = parsedUrl.hostname.replace(/^www\./, '');
        if (!['bilibili.com', 'm.bilibili.com', 'player.bilibili.com'].includes(host)) return null;

        if (host === 'player.bilibili.com') return parsedUrl.toString();

        const bvid = parsedUrl.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1]
            || parsedUrl.searchParams.get('bvid');
        if (!bvid) return null;

        const page = parsedUrl.searchParams.get('p') || parsedUrl.searchParams.get('page') || '1';
        const embedUrl = new URL('https://player.bilibili.com/player.html');
        embedUrl.searchParams.set('bvid', bvid);
        embedUrl.searchParams.set('page', page);
        embedUrl.searchParams.set('high_quality', '1');
        return embedUrl.toString();
    } catch {
        return null;
    }
};

export const createVideoEmbedMarkup = (url: string) => {
    const bilibiliEmbedUrl = getBilibiliEmbedUrl(url);
    if (bilibiliEmbedUrl) {
        return `\n<iframe src="${escapeHtmlAttribute(bilibiliEmbedUrl)}" width="100%" height="480" frameborder="0" allowfullscreen></iframe>\n`;
    }

    return `\n<video src="${escapeHtmlAttribute(url)}" controls width="100%"></video>\n`;
};

const THEME_DOT_COLORS: Record<string, string> = {
    blue: 'bg-blue-600',
    emerald: 'bg-emerald-600',
    orange: 'bg-orange-600',
    pink: 'bg-pink-600',
    violet: 'bg-violet-600',
    cyan: 'bg-cyan-600',
    sky: 'bg-sky-600',
    amber: 'bg-amber-600',
    slate: 'bg-slate-500',
};

export const mapEditorCategory = (item: { categoryId: string; name: string; themeId?: string }): Category => {
    const themeId = item.themeId || 'blue';
    const dotColor = THEME_DOT_COLORS[themeId] || THEME_DOT_COLORS.blue;

    return {
        id: item.categoryId,
        name: item.name,
        color: item.categoryId === 'uncategorized' ? 'bg-slate-400' : dotColor,
    };
};

const COMMANDS_CONFIG: Omit<CommandItem, 'icon'>[] = [
    {id: 'image', label: '图片', value: '', desc: '上传并插入图片 (Max 5MB)'},
    {id: 'imageLink', label: '图片链接', value: '', desc: '通过URL插入图片'},
    {id: 'video', label: '视频', value: '', desc: '插入视频地址'},
    {
        id: 'chart',
        label: '简单图表',
        value: '\n```chart\n# 支持 type: bar / line / pie / wordcloud\n# 也可以写：柱状图 / 折线图 / 饼图 / 词云\n# 数据格式：名称,数值，每行一条数据\ntype: bar\ntitle: 月度阅读量\n月份,数值\n1月,120\n2月,180\n3月,150\n4月,230\n```\n',
        cursorOffset: 0,
        desc: '支持 bar/line/pie/wordcloud',
    },
    {
        id: 'mermaid',
        label: 'Mermaid 图表',
        value: '\n```mermaid\ngraph TD\n    A[Start] --> B{Is it?}\n    B -- Yes --> C[OK]\n    B -- No --> D[End]\n```\n',
        cursorOffset: 0,
        desc: '插入流程图/时序图等',
    },
    {id: 'text', label: '文本', value: '', desc: '开始像往常一样输入'},
    {id: 'h1', label: '标题 1', value: '# ', desc: '一级大标题'},
    {id: 'h2', label: '标题 2', value: '## ', desc: '二级中标题'},
    {id: 'h3', label: '标题 3', value: '### ', desc: '三级小标题'},
    {id: 'h4', label: '标题 4', value: '#### ', desc: '四级小标题'},
    {id: 'h5', label: '标题 5', value: '##### ', desc: '五级小标题'},
    {id: 'ul', label: '项目符号列表', value: '- ', desc: '创建一个简单的列表'},
    {id: 'ol', label: '有序列表', value: '1. ', desc: '创建一个带序号的列表'},
    {id: 'todo', label: '待办清单', value: '- [ ] ', desc: '跟踪任务完成情况'},
    {id: 'quote', label: '引用', value: '> ', desc: '引用一段话'},
    {id: 'quoteDanger', label: '红色引用', value: '>d ', desc: '插入红色提示引用'},
    {id: 'quoteWarning', label: '黄色引用', value: '>w ', desc: '插入黄色提示引用'},
    {id: 'quoteInfo', label: '灰色引用', value: '>i ', desc: '插入灰色提示引用'},
    {id: 'code', label: '代码块', value: '```\n\n```', cursorOffset: -4, desc: '插入代码片段'},
    {id: 'math', label: '数学公式', value: '$$\n\n$$', cursorOffset: -3, desc: '插入 KaTex 公式'},
    {id: 'divider', label: '分割线', value: '---\n', desc: '视觉分割线'},
    {
        id: 'table',
        label: '表格',
        value: '\n| 表头1 | 表头2 |\n| --- | --- |\n| 内容1 | 内容2 |\n',
        desc: '插入简单的表格',
    },
];

export const getCommandsWithIcons = (): CommandItem[] => {
    const icons: Record<string, ReactNode> = {
        image: <ImageIcon size={18}/>,
        imageLink: <ImageIcon size={18}/>,
        video: <VideoIcon size={18}/>,
        chart: <BarChart2 size={18}/>,
        mermaid: <Workflow size={18}/>,
        text: <Type size={18}/>,
        h1: <Heading1 size={18}/>,
        h2: <Heading2 size={18}/>,
        h3: <Heading3 size={18}/>,
        h4: <Heading4 size={18}/>,
        h5: <Heading5 size={18}/>,
        ul: <List size={18}/>,
        ol: <List size={18}/>,
        todo: <CheckSquare size={18}/>,
        quote: <Quote size={18}/>,
        quoteDanger: <Quote size={18}/>,
        quoteWarning: <Quote size={18}/>,
        quoteInfo: <Quote size={18}/>,
        code: <Code size={18}/>,
        math: <Sigma size={18}/>,
        divider: <Minus size={18}/>,
        table: <TableIcon size={18}/>,
        underline: <Underline size={18}/>,
        wave: <Sigma size={18}/>,
        watercolor: <Highlighter size={18}/>,
    };
    return COMMANDS_CONFIG.map(command => ({
        ...command,
        icon: icons[command.id] || <Type size={18}/>,
    }));
};
