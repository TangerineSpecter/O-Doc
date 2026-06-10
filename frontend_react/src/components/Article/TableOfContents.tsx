import {AlertTriangle, CheckCircle2, Edit3, RefreshCw, Trash2, X} from 'lucide-react'; // [修改] 引入 RefreshCw
import {HeaderItem} from '@/hooks/useArticle.ts';

// 定义三种状态类型
export type SyncStatusType = 'synced' | 'outdated' | 'not_synced';

interface TableOfContentsProps {
    headers: HeaderItem[];
    activeId: string;
    isEmbedded: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
    onSync?: () => void;
    isSyncing?: boolean;
    syncStatus?: SyncStatusType;
    lastSyncedTime?: string;
    layout?: 'absolute' | 'inline' | 'mobile';
    onClose?: () => void;
}

export const TableOfContents = ({
                                    headers,
                                    activeId,
                                    isEmbedded,
                                    onEdit,
                                    onDelete,
                                    onSync,
                                    isSyncing = false,
                                    syncStatus = 'not_synced', // 默认为未同步
                                    lastSyncedTime,
                                    layout = 'absolute',
                                    onClose
                                }: TableOfContentsProps) => {
    // 根据状态计算按钮样式和提示文案
    const getSyncButtonState = () => {
        if (isSyncing) return {
            color: 'text-blue-500',
            bg: 'bg-blue-50',
            icon: RefreshCw,
            spin: true,
            title: '正在同步...'
        };

        switch (syncStatus) {
            case 'synced':
                return {
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50 hover:bg-emerald-100',
                    border: 'border-emerald-200',
                    icon: CheckCircle2,
                    title: `已同步 (上次: ${lastSyncedTime ? new Date(lastSyncedTime).toLocaleString() : '刚刚'})`
                };
            case 'outdated':
                return {
                    color: 'text-orange-600',
                    bg: 'bg-orange-50 hover:bg-orange-100',
                    border: 'border-orange-200',
                    icon: AlertTriangle,
                    title: '内容已更新，点击同步'
                };
            case 'not_synced':
            default:
                return {
                    color: 'text-slate-400',
                    bg: 'bg-white hover:text-indigo-600 hover:bg-indigo-50',
                    border: 'border-slate-200',
                    icon: RefreshCw,
                    title: '同步至知识库'
                };
        }
    };

    // if (!headers?.length) return null;

    const btnState = getSyncButtonState();
    const Icon = btnState.icon;
    const isMobileLayout = layout === 'mobile';
    const visibilityClass = isMobileLayout ? 'block' : isEmbedded ? 'hidden 2xl:block' : 'hidden xl:block';
    const layoutClass = isMobileLayout
        ? 'h-full w-full'
        : layout === 'inline'
            ? 'relative h-full w-64 shrink-0'
            : 'absolute left-full top-0 ml-4 h-full w-64';

    return (
        <div className={`${visibilityClass} ${layoutClass}`}>
            <div className={isMobileLayout ? 'flex h-full flex-col' : 'sticky top-6'}>

                {/* 操作按钮组 */}
                {(onEdit || onDelete || onSync) && (
                    <div className={`${isMobileLayout ? 'px-4 pb-3' : 'mb-4'} flex items-center gap-2`}>
                        {onEdit && (
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-600 shadow-sm hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 hover:shadow transition-all duration-200"
                            >
                                <Edit3 className="w-3.5 h-3.5"/>
                                <span>编辑文档</span>
                            </button>
                        )}

                        {onSync && (
                            <button
                                onClick={onSync}
                                disabled={isSyncing}
                                className={`flex items-center justify-center p-1.5 border rounded-md shadow-sm transition-all duration-200 
                    ${btnState.bg} ${btnState.color} ${btnState.border || 'border-slate-200'} 
                    ${isSyncing ? 'cursor-not-allowed' : ''}`}
                                title={btnState.title}
                            >
                                <Icon className={`w-3.5 h-3.5 ${btnState.spin ? 'animate-spin' : ''}`}/>
                            </button>
                        )}

                        {onDelete && (
                            <button
                                onClick={onDelete}
                                className="flex items-center justify-center p-1.5 bg-white border border-slate-200 rounded-md text-slate-400 shadow-sm hover:text-red-600 hover:border-red-200 hover:bg-red-50 hover:shadow transition-all duration-200"
                                title="删除文档"
                            >
                                <Trash2 className="w-3.5 h-3.5"/>
                            </button>
                        )}
                    </div>
                )}

                {headers && headers.length > 0 && (
                    <>
                        <div className={`${isMobileLayout ? 'px-4 py-3 border-b border-slate-100' : 'mb-4'} flex items-center justify-between`}>
                            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> 目录
                            </h5>
                            {isMobileLayout && onClose && (
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                    title="关闭目录"
                                >
                                    <X className="h-4 w-4"/>
                                </button>
                            )}
                        </div>
                        <ul className={`${isMobileLayout ? 'flex-1 overflow-y-auto px-4 py-3 custom-scrollbar' : 'max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 custom-scrollbar'} space-y-1 relative border-l border-slate-200`}>
                            {headers.map((h, i) => (
                                <li key={i}>
                                    <a href={`#${h.slug}`}
                                       onClick={onClose}
                                       className={`block text-sm py-1.5 border-l-2 transition-all truncate ${h.level > 2 ? 'pl-6 text-xs' : 'pl-4'} ${activeId === h.slug ? 'border-[#0ea5e9] text-[#0ea5e9] font-medium bg-sky-50/30' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
                                        {h.text}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
};
