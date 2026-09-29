import {useState} from 'react';
import {Pause, Play, StopCircle, AlertTriangle} from 'lucide-react';
import {useTravelDetail} from '../../hooks/useTravelDetail';
import type {TravelJourney, TravelOperation} from '../../types/api/travel';
import WorldDialog from './WorldDialog';
import ResourceImagePickerModal from '../Editor/ResourceImagePickerModal';
import {useToast} from '../common/ToastProvider';

import TravelHeaderCard from './TravelHeaderCard';
import TravelTimeline from './TravelTimeline';
import TravelJournalCard from './TravelJournalCard';
import TravelPhotoCard from './TravelPhotoCard';
import TravelLootCard from './TravelLootCard';
import TravelSourcesCard from './TravelSourcesCard';


interface TravelDetailDialogProps {
    journey: TravelJourney;
    onClose: () => void;
    onChanged: () => void;
}

export default function TravelDetailDialog({journey: initial, onClose, onChanged}: TravelDetailDialogProps) {
    const {journey, error, act: updateTravel} = useTravelDetail(initial);
    const [busy, setBusy] = useState(false);
    const [picker, setPicker] = useState(false);
    const [confirmation, setConfirmation] = useState<'end' | 'regenerate_image' | null>(null);
    const toast = useToast();
    const state = journey.snapshot;

    const act = async (action: TravelOperation, assetId?: string) => {
        setBusy(true);
        try {
            await updateTravel(action, {assetId, confirmCharge: action === 'regenerate_image'});
            onChanged();
            toast.success('操作已保存');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : '操作失败');
        } finally {
            setBusy(false);
            setConfirmation(null);
        }
    };

    const isOngoing = !['completed', 'skipped'].includes(journey.status);
    const isPaused = ['paused', 'manual', 'waiting'].includes(journey.status);
    const nodeErrors = journey.nodes?.filter(node => Boolean(node.error)) || [];

    const extraPhotos = (state as {photos?: Array<{imageUrl?: string} | string>}).photos;
    const hasPhotos = Boolean(state.photo || (extraPhotos && extraPhotos.length > 0));

    return (
        <WorldDialog
            title={`${state.agentName}的旅行`}
            description="Agent 模拟游历报告 · 旅行经历与画卷"
            onClose={onClose}
            size="wide"
        >
            <div className="space-y-5">
                {/* 错误提示条 */}
                {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>{error}，稍后自动重试。</span>
                    </div>
                )}

                {/* 节点异常排查 */}
                {nodeErrors.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-xs text-red-700 space-y-1">
                        <p className="font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                            <span>部分执行节点存在异常：</span>
                        </p>
                        {nodeErrors.map(node => (
                            <p key={node.id} className="pl-5 text-slate-600">
                                <strong>{node.kind}</strong>：{node.error}
                            </p>
                        ))}
                    </div>
                )}

                {/* 顶部旅行通行证卡片 */}
                <TravelHeaderCard journey={journey} />

                {/* 主体响应式双栏布局 */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                    {/* 左侧主阅读区 (8列)：足迹时光轴 + 日记长文 */}
                    <div className="space-y-5 lg:col-span-7 xl:col-span-8">
                        {/* 游历足迹与见闻 */}
                        <TravelTimeline snapshot={state} />

                        {/* 深度旅行日记手卷 */}
                        {state.draft && (
                            <TravelJournalCard
                                draft={state.draft}
                                articleId={journey.articleId}
                                collectionId={state.config?.collectionId}
                            />
                        )}
                    </div>

                    {/* 右侧边栏 (4列)：操作控制 + 场景照片 + 战利品背包 + 地方资料 */}
                    <div className="space-y-5 lg:col-span-5 xl:col-span-4">
                        {/* 进行中旅行操作面板 */}
                        {isOngoing && (
                            <div className="rounded-2xl border border-orange-200/80 bg-orange-50/40 p-4 shadow-xs">
                                <h4 className="text-xs font-bold text-orange-950 mb-2.5">
                                    旅途控制中枢
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void act(isPaused ? 'resume' : 'pause')}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 shadow-2xs hover:bg-orange-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                                    >
                                        {isPaused ? <Play className="h-3.5 w-3.5 text-orange-600" /> : <Pause className="h-3.5 w-3.5 text-orange-600" />}
                                        <span>{isPaused ? '恢复旅行' : '暂停旅行'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setConfirmation('end')}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow-2xs hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                                    >
                                        <StopCircle className="h-3.5 w-3.5 text-red-500" />
                                        <span>提前结束旅行</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 场景照掠影拍立得（支持 16:9 轮播与点击放大） */}
                        {hasPhotos && (
                            <TravelPhotoCard
                                photo={state.photo}
                                photos={extraPhotos}
                                busy={busy}
                                onRegenerate={() => setConfirmation('regenerate_image')}
                                onQuery={() => void act('query_image')}
                                onPick={() => setPicker(true)}
                                onAbandon={() => void act('abandon_image')}
                            />
                        )}

                        {/* 战利品与背包道具 */}
                        <TravelLootCard
                            debugPurchase={state.debugPurchase}
                            shopping={state.shopping}
                            goods={state.goods}
                        />

                        {/* 地方资料与参考来源 */}
                        <TravelSourcesCard sources={state.sources} />
                    </div>
                </div>
            </div>

            {/* 图库已有图片选择器 */}
            {picker && (
                <ResourceImagePickerModal
                    isOpen
                    onClose={() => setPicker(false)}
                    onSelect={id => {
                        setPicker(false);
                        void act('use_image', id);
                    }}
                />
            )}

            {/* 二次确认操作模态框 */}
            {confirmation && (
                <WorldDialog
                    title={confirmation === 'end' ? '结束这次旅行？' : '重新生成场景照？'}
                    onClose={() => setConfirmation(null)}
                >
                    <div className="space-y-4">
                        <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                            {confirmation === 'end'
                                ? '已出发的旅行费用不自动退还，已获得的物品与战利品保留，系统将根据已发生的足迹经历收尾并撰写旅行日记。'
                                : '重新请求场景插画可能会产生额外的 AI 绘图计费。生成成功后将替换旧图；若正文内容有变动将转为手动提示插入。是否确认重新生成？'}
                        </p>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmation(null)}
                                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void act(confirmation)}
                                className="rounded-lg bg-orange-500 px-4 py-1.5 text-xs font-medium text-white shadow-xs shadow-orange-500/20 transition-all hover:bg-orange-600 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                                确认执行
                            </button>
                        </div>
                    </div>
                </WorldDialog>
            )}
        </WorldDialog>
    );
}
