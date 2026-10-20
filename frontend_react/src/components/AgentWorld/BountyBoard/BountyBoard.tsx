import {useState} from 'react';
import {Coins, Loader2, Plus, RefreshCw} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useToast} from '../../common/ToastProvider';
import ConfirmationModal from '../../common/ConfirmationModal';
import {useBountyBoard} from '../../../hooks/useBountyBoard';
import {cancelBounty, deleteBounty, getBounty, reinviteBounty, reviewBounty, runBountyNow} from '../../../api/bounty';
import type {Bounty, BountyStatus} from '../../../types/api/bounty';
import BountyCard from './BountyCard';
import BountyCreateDialog from './BountyCreateDialog';

const FILTERS: {value: BountyStatus[]; label: string}[] = [
    {value: [], label: '全部'},
    {value: ['open'], label: '待领取'},
    {value: ['claimed'], label: '进行中'},
    {value: ['delivered'], label: '待验收'},
    {value: ['accepted', 'cancelled'], label: '已结束'},
];

export default function BountyBoard() {
    const toast = useToast();
    const navigate = useNavigate();
    const board = useBountyBoard(true);
    const [expandedId, setExpandedId] = useState('');
    const [busyId, setBusyId] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [deleting, setDeleting] = useState<Bounty | null>(null);
    const [removing, setRemoving] = useState(false);

    const toggle = async (bounty: Bounty) => {
        if (expandedId === bounty.id) {
            setExpandedId('');
            return;
        }
        setExpandedId(bounty.id);
        try {
            board.updateItem(await getBounty(bounty.id));
        } catch {
            // 明细失败不影响卡片本身。
        }
    };

    const run = async (bounty: Bounty, action: () => Promise<unknown>, success: string) => {
        setBusyId(bounty.id);
        try {
            await action();
            toast.success(success);
            await board.reload();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '操作失败');
        } finally {
            setBusyId('');
        }
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        const id = deleting.id;
        setRemoving(true);
        try {
            await deleteBounty(id);
            board.removeItem(id);
            if (expandedId === id) setExpandedId('');
            setDeleting(null);
            toast.success('悬赏记录已删除');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '删除失败');
            // 记录可能已在其他设备删除，重新拉取让看板与服务端对齐。
            void board.reload();
        } finally {
            setRemoving(false);
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
                    {FILTERS.map(row => {
                        const active = row.value.join(',') === board.filter.join(',');
                        return (
                            <button key={row.label} type="button" onClick={() => board.changeFilter(row.value)}
                                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                        active ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                    }`}>
                                {row.label}
                            </button>
                        );
                    })}
                </div>
                <button type="button" onClick={() => void board.reload()} disabled={board.loading}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${board.loading ? 'animate-spin' : ''}`}/>刷新
                </button>
                <button type="button" onClick={() => setCreateOpen(true)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm">
                    <Plus className="h-4 w-4"/>发布悬赏
                </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
                <Coins className="h-3.5 w-3.5 text-orange-500"/>
                发布 10 分钟后按资金占比加权抽签，逐个询问居民；先接受者获得任务，交付通过验收后系统发放世界币。
            </div>

            {board.error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">{board.error}</p>}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto scrollbar-hide pr-0.5">
                {board.loading && !board.items.length ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin"/>正在读取悬赏
                    </div>
                ) : !board.items.length ? (
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 py-16 text-center">
                        <Coins className="h-8 w-8 text-slate-300"/>
                        <p className="text-xs font-semibold text-slate-600">还没有悬赏</p>
                        <p className="max-w-xs text-[11px] text-slate-400">发布一条调研发帖任务，居民们会自己决定是否接单。</p>
                    </div>
                ) : (
                    board.items.map(bounty => (
                        <BountyCard key={bounty.id} bounty={bounty}
                                    expanded={expandedId === bounty.id}
                                    busy={busyId === bounty.id}
                                    onToggle={() => void toggle(bounty)}
                                    onReview={(approve, reason) => void run(bounty,
                                        () => reviewBounty(bounty.id, approve, reason),
                                        approve ? '已通过验收并发放奖励' : '已驳回，居民会继续处理')}
                                    onCancel={() => void run(bounty, () => cancelBounty(bounty.id), '悬赏已取消')}
                                    onDelete={() => setDeleting(bounty)}
                                    onRunNow={() => void run(bounty, () => runBountyNow(bounty.id), '已开始征询居民')}
                                    onReinvite={() => void run(bounty, () => reinviteBounty(bounty.id), '已重新抽签')}
                                    onOpenArticle={(collId, articleId) => navigate(`/article/${collId}/${articleId}`)}/>
                    ))
                )}
                {board.hasMore && (
                    <button type="button" onClick={board.loadMore}
                            className="w-full rounded-xl border border-slate-200 bg-white py-2 text-xs font-medium text-slate-600">
                        加载更多
                    </button>
                )}
            </div>

            {createOpen && (
                <BountyCreateDialog options={board.options} onClose={() => setCreateOpen(false)}
                                    onCreated={() => {
                                        setCreateOpen(false);
                                        toast.success('悬赏已发布，10 分钟后开始征询');
                                        void board.reload();
                                    }}/>
            )}

            <ConfirmationModal isOpen={Boolean(deleting)} type="danger" isLoading={removing}
                               title="删除悬赏记录"
                               description={<>删除“{deleting?.title}”后将不再出现在看板中，邀请与交付记录也会一并清除，且无法恢复。</>}
                               confirmText="确认删除"
                               onClose={() => {
                                   if (!removing) setDeleting(null);
                               }}
                               onConfirm={() => void confirmDelete()}/>
        </div>
    );
}
