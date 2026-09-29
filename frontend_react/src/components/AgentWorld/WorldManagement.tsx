import { useState } from 'react';
import { Globe, Loader2, Plus } from 'lucide-react';
import { saveWorldCategory, saveWorldProfession, saveWorldIncome } from '../../api/agentWorld';
import type { WorldCategory, WorldProfession } from '../../types/api/agentWorld';
import { useAgentWorldManagement } from '../../hooks/useAgentWorldManagement';
import { useToast } from '../common/ToastProvider';
import { WorldCategoryTab } from './WorldCategoryTab';
import { WorldCategoryModal } from './WorldCategoryModal';
import { WorldProfessionTab } from './WorldProfessionTab';
import { WorldProfessionModal } from './WorldProfessionModal';
import { WorldIncomeTab } from './WorldIncomeTab';

import {MarketSettings} from '../Market/MarketSettings';
type WorldTab = 'categories' | 'professions' | 'income' | 'market';

export function WorldManagement() {
    const state = useAgentWorldManagement();
    const toast = useToast();

    const [tab, setTab] = useState<WorldTab>('categories');

    // 模态弹窗状态
    const [categoryModalOpen, setCategoryModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Partial<WorldCategory> | undefined>();

    const [professionModalOpen, setProfessionModalOpen] = useState(false);
    const [editingProfession, setEditingProfession] = useState<Partial<WorldProfession> | undefined>();

    const [busy, setBusy] = useState(false);

    // 打开分类模态
    const openCreateCategory = () => {
        setEditingCategory({ name: '', description: '', sort: 0, enabled: true });
        setCategoryModalOpen(true);
    };

    const openEditCategory = (c: WorldCategory) => {
        setEditingCategory(c);
        setCategoryModalOpen(true);
    };

    // 打开职业模态
    const openCreateProfession = () => {
        setEditingProfession({ name: '', description: '', enabled: true, bonuses: [] });
        setProfessionModalOpen(true);
    };

    const openEditProfession = (p: WorldProfession) => {
        setEditingProfession({
            ...p,
            bonuses: p.bonuses ? p.bonuses.map(b => ({ ...b })) : [],
        });
        setProfessionModalOpen(true);
    };

    // 保存分类
    const handleSaveCategory = async (categoryData: Partial<WorldCategory>) => {
        setBusy(true);
        state.setError('');
        try {
            await saveWorldCategory(categoryData);
            setCategoryModalOpen(false);
            setEditingCategory(undefined);
            await state.reload();
            toast.success(categoryData.id ? '分类修改已保存' : '分类创建成功');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '保存分类失败';
            state.setError(msg);
            toast.error(msg);
        } finally {
            setBusy(false);
        }
    };

    // 保存职业
    const handleSaveProfession = async (professionData: Partial<WorldProfession>) => {
        setBusy(true);
        state.setError('');
        try {
            await saveWorldProfession(professionData);
            setProfessionModalOpen(false);
            setEditingProfession(undefined);
            await state.reload();
            toast.success(professionData.id ? '职业修改已保存' : '职业创建成功');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '保存职业失败';
            state.setError(msg);
            toast.error(msg);
        } finally {
            setBusy(false);
        }
    };

    // 保存收益规则
    const handleSaveIncome = async () => {
        setBusy(true);
        state.setError('');
        try {
            await saveWorldIncome(state.income);
            await state.reload();
            toast.success('收益配置已保存');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '保存收益配置失败';
            state.setError(msg);
            toast.error(msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* 顶层头部卡片 - 对齐 AgentSettings 紧凑单行风格 */}
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3.5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                            <Globe className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-800 text-sm">Agent 世界</h3>
                            <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md lg:max-w-lg xl:max-w-xl">
                                管理 Agent 世界的分类、职业、收益与市场规则。
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                        {/* 胶囊分段控制器 */}
                        <div className="flex rounded-lg bg-slate-100 p-0.5 shrink-0">
                            <button
                                type="button"
                                onClick={() => setTab('categories')}
                                className={`whitespace-nowrap px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                    tab === 'categories'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                分类管理
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab('professions')}
                                className={`whitespace-nowrap px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                    tab === 'professions'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                职业管理
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab('income')}
                                className={`whitespace-nowrap px-3 py-1 text-xs font-medium rounded-md transition-all ${
                                    tab === 'income'
                                        ? 'bg-white text-slate-900 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                收益管理
                            </button>
                            <button type="button" onClick={() => setTab('market')} className={`whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-all ${tab === 'market' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>市场管理</button>
                        </div>

                        {/* 始终预留操作位，避免无新增按钮的页签切换时移动。 */}
                        <div className="flex h-[30px] w-[62px] shrink-0 items-center justify-end">
                            {tab === 'categories' && (
                                <button
                                    type="button"
                                    onClick={openCreateCategory}
                                    title="新增分类"
                                    className="flex w-full items-center justify-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-xs shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95 active:bg-orange-700 whitespace-nowrap shrink-0"
                                >
                                    <Plus className="w-3.5 h-3.5 shrink-0" />
                                    新增
                                </button>
                            )}

                            {tab === 'professions' && (
                                <button
                                    type="button"
                                    onClick={openCreateProfession}
                                    title="新增职业"
                                    className="flex w-full items-center justify-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-xs font-medium text-white shadow-xs shadow-orange-500/20 transition-all hover:bg-orange-600 active:scale-95 active:bg-orange-700 whitespace-nowrap shrink-0"
                                >
                                    <Plus className="w-3.5 h-3.5 shrink-0" />
                                    新增
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 错误提示条 */}
            {state.error && (
                <div
                    role="alert"
                    className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between"
                >
                    <span>{state.error}</span>
                    <button
                        type="button"
                        onClick={() => state.setError('')}
                        className="text-red-500 hover:text-red-700 text-xs font-medium ml-2"
                    >
                        关闭
                    </button>
                </div>
            )}

            {/* 内容区域 */}
            {state.loading ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center shadow-sm">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-3" />
                    <p className="text-xs text-slate-400">正在加载数据…</p>
                </div>
            ) : (
                <>
                    {tab === 'categories' && (
                        <WorldCategoryTab
                            categories={state.categories}
                            onEdit={openEditCategory}
                        />
                    )}

                    {tab === 'professions' && (
                        <WorldProfessionTab
                            professions={state.professions}
                            categories={state.categories}
                            onEdit={openEditProfession}
                        />
                    )}

                    {tab === 'market' && <MarketSettings/>}
                    {tab === 'income' && (
                        <WorldIncomeTab
                            income={state.income}
                            setIncome={state.setIncome}
                            settlements={state.settlements}
                            pendingIncome={state.pendingIncome}
                            ledger={state.ledger}
                            busy={busy}
                            onSave={handleSaveIncome}
                        />
                    )}
                </>
            )}

            {/* 分类新增/编辑模态弹窗 */}
            {categoryModalOpen && (
                <WorldCategoryModal
                    key={editingCategory?.id || 'new'}
                    category={editingCategory}
                    saving={busy}
                    onClose={() => {
                        if (!busy) {
                            setCategoryModalOpen(false);
                            setEditingCategory(undefined);
                        }
                    }}
                    onSave={handleSaveCategory}
                />
            )}

            {/* 职业新增/编辑模态弹窗 */}
            {professionModalOpen && (
                <WorldProfessionModal
                    key={editingProfession?.id || 'new'}
                    profession={editingProfession}
                    categories={state.categories}
                    saving={busy}
                    onClose={() => {
                        if (!busy) {
                            setProfessionModalOpen(false);
                            setEditingProfession(undefined);
                        }
                    }}
                    onSave={handleSaveProfession}
                />
            )}
        </div>
    );
}
