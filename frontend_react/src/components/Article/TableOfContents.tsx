import {AlertTriangle, CheckCircle2, Edit3, RefreshCw, Trash2} from 'lucide-react'; // [修改] 引入 RefreshCw
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
                                    lastSyncedTime
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
    const visibilityClass = isEmbedded ? 'hidden 2xl:block' : 'hidden xl:block';

    return (
        <div className={`${visibilityClass} absolute left-full top-0 ml-4 h-full w-64`}>
            <div className="sticky top-6">

                {/* 操作按钮组 */}
                {(onEdit || onDelete || onSync) && (
                    <div className="flex items-center gap-2 mb-4">
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
                        <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> 目录
                        </h5>
                        <ul className="space-y-1 relative border-l border-slate-200">
                            {headers.map((h, i) => (
                                <li key={i}>
                                    <a href={`#${h.slug}`}
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