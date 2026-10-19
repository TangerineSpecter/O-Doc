import {useCallback, useEffect, useRef, useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {useCombat} from '../../hooks/useCombat';
import {useCombatActions} from '../../hooks/useCombatActions';
import CombatProfilePanel from './CombatProfilePanel';
import CombatHistoryDialog from './CombatHistoryDialog';
import {Sparkles} from 'lucide-react';

export default function CombatDialog({
    residents,
    initialAgentId = '',
    onObserve,
    onClose,
}: {
    residents: {id: string; name: string; avatar?: string}[];
    initialAgentId?: string;
    onObserve: (id: string, actorId: string) => void;
    onClose: () => void;
}) {
    const [actor, setActor] = useState(
        residents.some(r => r.id === initialAgentId) ? initialAgentId : residents[0]?.id || ''
    );
    const [historyOpen, setHistoryOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const state = useCombat(actor);
    const setPage = state.setPage;
    const actions = useCombatActions(actor, state.reload);
    const data = state.data;
    const actorIndex = residents.findIndex(resident => resident.id === actor);
    const activeResident = residents[actorIndex];

    const changeResident = useCallback((index: number) => {
        const resident = residents[index];
        if (!resident) return;
        setActor(resident.id);
        setPage(1);
    }, [residents, setPage]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            if (residents.length <= 1) return;

            // 子弹窗开启时暂停切换
            if (historyOpen) return;

            // 忽略在输入框、文本域中的操作
            const target = event.target instanceof Element ? event.target : document.activeElement;
            if (target && (
                target.matches('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]') ||
                target.closest('input, textarea, select, [contenteditable="true"]')
            )) {
                return;
            }

            event.preventDefault();
            const delta = event.key === 'ArrowLeft' ? -1 : 1;
            const nextIndex = actorIndex + delta;
            if (nextIndex >= 0 && nextIndex < residents.length) {
                changeResident(nextIndex);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [actorIndex, residents, historyOpen, changeResident]);

    return (
        <WorldDialog
            title="冒险与战斗"
            description="准备出发，探索迷宫，见证居民的历练与成长。"
            size="extra-wide"
            onClose={onClose}
        >
            <div ref={contentRef} className="flex h-full min-h-0 flex-col gap-2.5">
                {/* 错误提示 */}
                {(state.error || actions.error) && (
                    <p role="alert" className="shrink-0 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                        {state.error || actions.error}
                    </p>
                )}

                {/* 成功反馈 */}
                {actions.message && (
                    <p role="status" className="shrink-0 rounded-xl bg-emerald-50 p-2 text-xs text-emerald-700 border border-emerald-200">
                        {actions.message}
                    </p>
                )}

                {/* 主展示区：沉浸式冒险档案面板 */}
                <div className="min-h-0 flex-1">
                    {data ? (
                        data.profile ? (
                            <CombatProfilePanel
                                profile={data.profile}
                                catalog={data.catalog}
                                actions={actions}
                                onObserve={id => onObserve(id, actor)}
                                recentExplorationId={data.history?.list[0]?.id}
                                activeResident={activeResident}
                                residents={residents}
                                actorIndex={actorIndex}
                                onChangeResident={changeResident}
                                onOpenHistory={() => setHistoryOpen(true)}
                                historyCount={data.history?.total ?? data.history?.list?.length ?? 0}
                            />
                        ) : (
                            <p className="p-6 text-sm text-slate-500">请选择居民以查看冒险档案。</p>
                        )
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-slate-400 gap-2">
                            <Sparkles className="h-4 w-4 animate-spin text-orange-500" />
                            <span>正在翻开冒险档案…</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 探索历练史册弹窗卡片 */}
            {historyOpen && (
                <CombatHistoryDialog
                    history={data?.history ?? undefined}
                    page={state.page}
                    onPageChange={setPage}
                    residentName={activeResident?.name || '居民'}
                    onObserve={id => onObserve(id, actor)}
                    onClose={() => setHistoryOpen(false)}
                />
            )}
        </WorldDialog>
    );
}
