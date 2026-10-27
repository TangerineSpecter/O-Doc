import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {Menu} from 'lucide-react';
import {mt4Api} from '../api/mt4Archive';
import {useMT4Archive} from '../hooks/useMT4Archive';
import {useCollectionWorkspace} from '../hooks/useCollectionWorkspace';
import {getIconComponent} from '../constants/iconList';
import MT4Sidebar from '../components/MT4Archive/MT4Sidebar';
import OutlineContent from '../components/Outline/OutlineContent';
import {ExpertForm} from '../components/MT4Archive/ExpertForm';
import {TestForm} from '../components/MT4Archive/TestForm';
import {TestDetail} from '../components/MT4Archive/TestDetail';
import {EditTestForm} from '../components/MT4Archive/EditTestForm';
import {CompareTests} from '../components/MT4Archive/CompareTests';
import {ExpertDetail} from '../components/MT4Archive/ExpertDetail';
import ConfirmationModal from '../components/common/ConfirmationModal';
import StarLoader from '../components/common/StarLoader';
import type {ArticleNode} from '../api/article';
import type {MT4Test} from '../types/api/mt4Archive';
import './ArticleOutline.css';

export default function MT4ArchivePage() {
    const {collId = ''} = useParams();
    const navigate = useNavigate();
    const {anthologyInfo, loading: collectionLoading, reload: reloadAnthology} = useCollectionWorkspace(collId);
    const archive = useMT4Archive(collId);

    const [form, setForm] = useState<'create' | 'edit' | 'test' | 'edit-test' | 'compare' | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedIds, setExpandedIds] = useState<string[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [removing, setRemoving] = useState<'expert' | 'test' | null>(null);
    const [testsByExpert, setTestsByExpert] = useState<Record<string, MT4Test[]>>({});
    const selectionRevision = useRef(0);

    // 同步当前打开的 EA 档案下的回测记录到字典缓存中
    useEffect(() => {
        if (archive.detail?.expert?.id) {
            setTestsByExpert(prev => ({
                ...prev,
                [archive.detail!.expert.id]: archive.detail!.backtests || []
            }));
        }
    }, [archive.detail]);

    // 后台预加载专家列表的回测记录概览，用于展示目录树展开层级
    useEffect(() => {
        if (!archive.experts.length) return;
        let active = true;
        Promise.all(
            archive.experts.map(e => mt4Api.expert(collId, e.id).catch(() => null))
        ).then(results => {
            if (!active) return;
            const map: Record<string, MT4Test[]> = {};
            results.forEach(res => {
                if (res?.expert?.id) {
                    map[res.expert.id] = res.backtests || [];
                }
            });
            setTestsByExpert(prev => ({...prev, ...map}));
        });
        return () => {
            active = false;
        };
    }, [collId, archive.experts]);

    const toggleExpand = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    }, []);

    const handleSelectExpert = async (expertId: string) => {
        const revision = ++selectionRevision.current;
        archive.setTest(null);
        await archive.run(async () => {
            try {
                const expertDetail = await mt4Api.expert(collId, expertId);
                if (selectionRevision.current === revision) archive.setDetail(expertDetail);
            } catch (error) {
                if (selectionRevision.current === revision) throw error;
            }
        });
        setIsSidebarOpen(false);
    };

    const handleSelectTest = async (expertId: string, testId: string) => {
        const revision = ++selectionRevision.current;
        archive.setTest(null);
        await archive.run(async () => {
            try {
                const [expertDetail, testDetail] = await Promise.all([
                    archive.detail?.expert.id === expertId ? Promise.resolve(archive.detail) : mt4Api.expert(collId, expertId),
                    mt4Api.test(collId, expertId, testId),
                ]);
                if (selectionRevision.current !== revision) return;
                archive.setDetail(expertDetail);
                archive.setTest(testDetail);
            } catch (error) {
                if (selectionRevision.current === revision) throw error;
            }
        });
        setIsSidebarOpen(false);
    };

    const handleReset = () => {
        selectionRevision.current++;
        archive.setDetail(null);
        archive.setTest(null);
        setIsSidebarOpen(false);
    };

    const handleReload = () => {
        void archive.run(archive.reload);
        reloadAnthology();
    };

    if ((collectionLoading || archive.loading) && archive.experts.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F9FAFB] flex-col">
                <StarLoader/>
                <span className="text-xs text-slate-400 mt-2 font-medium">正在加载回测文集...</span>
            </div>
        );
    }

    const displayTitle = anthologyInfo?.title || 'MT4 回测文集';
    const displayDescription = anthologyInfo?.description || '管理 EA 档案、参数与历史回测报告';
    const anthologyIcon = anthologyInfo ? getIconComponent(anthologyInfo.iconId, "w-6 h-6 text-orange-500") : null;

    const trimmedQuery = searchQuery.trim().toLowerCase();
    const filteredExperts = archive.experts.filter(expert => {
        if (!trimmedQuery) return true;
        const tests = testsByExpert[expert.id] || [];
        return (
            expert.name.toLowerCase().includes(trimmedQuery) ||
            (expert.category || '').toLowerCase().includes(trimmedQuery) ||
            tests.some(t => t.title.toLowerCase().includes(trimmedQuery))
        );
    });

    const outlineDocs: ArticleNode[] = filteredExperts.map(expert => {
        const tests = testsByExpert[expert.id] || [];
        return {
            id: expert.id,
            articleId: expert.id,
            title: expert.name,
            type: 'doc',
            date: (expert.updatedAt || expert.createdAt || '').slice(0, 10),
            children: tests.map(t => ({
                id: t.id,
                articleId: `${expert.id}:${t.id}`,
                title: t.title,
                type: 'doc',
                date: (t.updatedAt || t.createdAt || '').slice(0, 10)
            }))
        };
    });

    const detail = archive.detail;

    return (
        <div className="article-outline-shell flex h-[calc(100vh-64px)] bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden">
            {/* 移动端遮罩 */}
            {isSidebarOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                    aria-label="关闭文集目录"
                />
            )}

            {/* 左侧目录侧边栏 */}
            <MT4Sidebar
                className={`
                    fixed inset-y-0 left-0 z-50 w-[min(82vw,20rem)] transform shadow-2xl transition-transform duration-300 ease-out
                    md:relative md:inset-auto md:z-auto md:w-72 md:translate-x-0 md:shadow-none
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
                title={displayTitle}
                icon={anthologyIcon}
                experts={archive.experts}
                testsByExpert={testsByExpert}
                activeExpertId={detail?.expert.id}
                activeTestId={archive.test?.backtest.id}
                expandedIds={expandedIds}
                searchQuery={searchQuery}
                isReloading={archive.busy}
                onSearchChange={setSearchQuery}
                onToggleExpand={toggleExpand}
                onSelectExpert={handleSelectExpert}
                onSelectTest={handleSelectTest}
                onCreateExpert={() => setForm('create')}
                onReset={handleReset}
                onReload={handleReload}
            />

            {/* 右侧主阅读/内容视窗 */}
            <main id="right-content-window" className="min-w-0 flex-1 bg-slate-50/40 relative overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-hide">
                {/* 移动端顶部标题栏 */}
                <div className="md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-3 h-12 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setIsSidebarOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    >
                        <Menu size={18}/>
                        <span>文集目录</span>
                    </button>
                    <span className="min-w-0 truncate px-2 text-sm font-bold text-slate-700">
                        {archive.test ? archive.test.backtest.title : detail ? detail.expert.name : '目录大纲'}
                    </span>
                    <span className="w-16" aria-hidden="true" />
                </div>

                {archive.error && (
                    <div role="alert" className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {archive.error}
                    </div>
                )}

                {archive.test && detail ? (
                    <div className="max-w-5xl mx-auto px-6 py-8 animate-in fade-in duration-200">
                        <TestDetail
                            key={archive.test.backtest.id}
                            collection={collId}
                            expertId={detail.expert.id}
                            detail={archive.test}
                            reload={archive.refreshTest}
                            back={() => {selectionRevision.current++; archive.setTest(null);}}
                            edit={() => setForm('edit-test')}
                            remove={() => setRemoving('test')}
                        />
                    </div>
                ) : detail ? (
                    <ExpertDetail
                        collection={collId}
                        detail={detail}
                        onBack={handleReset}
                        onOpenTest={(testId) => void handleSelectTest(detail.expert.id, testId)}
                        onAddTest={() => setForm('test')}
                        onCompare={() => setForm('compare')}
                        onEditExpert={() => setForm('edit')}
                        onDeleteExpert={() => setRemoving('expert')}
                        onReload={archive.refreshDetail}
                    />
                ) : (
                    <OutlineContent
                        title={displayTitle}
                        description={displayDescription}
                        icon={anthologyIcon}
                        docs={outlineDocs}
                        flatCount={archive.experts.length}
                        emptyText="还没有 EA 档案。点击左侧“+ 新建 EA”开始保存回测记录。"
                        onSelectDoc={(id) => {
                            if (id.includes(':')) {
                                const [expertId, testId] = id.split(':');
                                void handleSelectTest(expertId, testId);
                            } else {
                                void handleSelectExpert(id);
                            }
                        }}
                        onBackHome={() => navigate('/')}
                    />
                )}
            </main>

            {form === 'create' && (
                <ExpertForm
                    busy={archive.busy}
                    error={archive.error}
                    close={() => setForm(null)}
                    save={data => void archive.run(async () => {
                        const row = await mt4Api.createExpert(collId, data);
                        await archive.reload();
                        await archive.openExpert(row.id);
                        setForm(null);
                    })}
                />
            )}
            {form === 'edit' && detail && (
                <ExpertForm
                    initial={detail.expert}
                    busy={archive.busy}
                    error={archive.error}
                    close={() => setForm(null)}
                    save={data => void archive.run(async () => {
                        await mt4Api.updateExpert(collId, detail.expert.id, data);
                        await archive.refreshDetail();
                        setForm(null);
                    })}
                />
            )}
            {form === 'test' && detail && (
                <TestForm
                    collection={collId}
                    expert={detail.expert}
                    close={() => setForm(null)}
                    saved={async () => {
                        setForm(null);
                        await archive.run(archive.refreshDetail);
                    }}
                />
            )}
            {form === 'edit-test' && detail && archive.test && (
                <EditTestForm
                    test={archive.test.backtest}
                    busy={archive.busy}
                    error={archive.error}
                    close={() => setForm(null)}
                    save={data => void archive.run(async () => {
                        await mt4Api.updateTest(collId, detail.expert.id, archive.test!.backtest.id, data);
                        await archive.refreshTest();
                        await archive.refreshDetail();
                        setForm(null);
                    })}
                />
            )}
            {form === 'compare' && detail && (
                <CompareTests tests={detail.backtests} close={() => setForm(null)}/>
            )}
            <ConfirmationModal
                isOpen={Boolean(removing)}
                title={removing === 'expert' ? '删除 EA 档案？' : '删除回测记录？'}
                description={removing === 'expert' ? '该 EA 及其回测记录将从列表隐藏，附件仍保留在资源库。' : '该记录将从列表隐藏，原报告和附件仍保留。'}
                isLoading={archive.busy}
                onClose={() => setRemoving(null)}
                onConfirm={() => void archive.run(async () => {
                    if (!detail) return;
                    if (removing === 'expert') {
                        await mt4Api.deleteExpert(collId, detail.expert.id);
                        archive.setDetail(null);
                        await archive.reload();
                    } else if (archive.test) {
                        await mt4Api.deleteTest(collId, detail.expert.id, archive.test.backtest.id);
                        archive.setTest(null);
                        await archive.refreshDetail();
                    }
                    setRemoving(null);
                })}
            />
        </div>
    );
}
