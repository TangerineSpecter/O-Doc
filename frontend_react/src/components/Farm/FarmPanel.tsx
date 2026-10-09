import {useCallback, useEffect, useRef, useState} from 'react';
import {
    ChevronLeft,
    ChevronRight,
    CloudRain,
    ExternalLink,
    Eye,
    History,
    Package,
    Settings2,
    Sun,
    Warehouse,
    Coins,
    Bot,
} from 'lucide-react';
import {Link} from 'react-router-dom';
import {ProfessionBadge} from '../AgentWorld/ProfessionBadge';
import {AgentInventoryDialog} from '../AgentWorld/AgentInventoryDialog';
import {FarmCanvas} from './FarmCanvas';
import {FarmDetails} from './FarmDetails';
import {FarmConfiguration} from './FarmConfiguration';
import {useFarm} from '../../hooks/useFarm';
import {farmAtlasUrl} from './assets';
import type {FarmSelection} from '../../types/api/farm';

// 居民专属头像（优先智能体自定义头像/Emoji，无则优雅降级为农场像素小人切片）
function FarmResidentAvatar({
    name,
    avatar,
    appearance,
}: {
    name: string;
    avatar?: string;
    appearance?: {style: number; palette: number};
}) {
    const isImage = Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));
    if (isImage) {
        return (
            <img
                src={avatar}
                alt={name}
                className="h-9 w-9 shrink-0 rounded-lg object-cover border border-orange-100/90 shadow-2xs"
            />
        );
    }
    if (avatar && avatar.trim()) {
        return (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-base shadow-2xs">
                {avatar}
            </span>
        );
    }
    if (appearance) {
        return (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-lime-200/90 bg-lime-50 shadow-2xs">
                <div
                    style={{
                        width: 32,
                        height: 32,
                        imageRendering: 'pixelated',
                        backgroundImage: `url(${farmAtlasUrl})`,
                        backgroundSize: '1024px auto',
                        backgroundPosition: `0px -${(appearance.style * 8 + appearance.palette * 2) * 64}px`,
                    }}
                />
            </span>
        );
    }
    return (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-orange-600 shadow-2xs">
            <Bot className="h-4 w-4" />
        </span>
    );
}

export default function FarmPanel({initialAgentId}: {initialAgentId: string}) {
    const {farms, agentId, setAgentId, farm, history, loading, error, refresh} =
        useFarm(initialAgentId);
    const [selection, setSelection] = useState<FarmSelection | null>(null);
    const [configure, setConfigure] = useState(false);
    const [inventory, setInventory] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');

    const residentListRef = useRef<HTMLDivElement>(null);
    const residentItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    const close = useCallback(() => setConfigure(false), []);

    // 切换居民
    const handleSwitchAgent = useCallback(
        (id: string) => {
            if (id === agentId) return;
            setAgentId(id);
            setSelection(null);
            setConfigure(false);
            setInventory(false);
        },
        [agentId, setAgentId]
    );

    // 快捷切换至上一个居民
    const handlePrevAgent = useCallback(() => {
        if (farms.length <= 1) return;
        const currentIndex = farms.findIndex((f) => f.id === agentId);
        if (currentIndex === -1) return;
        const prevIndex = (currentIndex - 1 + farms.length) % farms.length;
        handleSwitchAgent(farms[prevIndex].id);
    }, [farms, agentId, handleSwitchAgent]);

    // 快捷切换至下一个居民
    const handleNextAgent = useCallback(() => {
        if (farms.length <= 1) return;
        const currentIndex = farms.findIndex((f) => f.id === agentId);
        if (currentIndex === -1) return;
        const nextIndex = (currentIndex + 1) % farms.length;
        handleSwitchAgent(farms[nextIndex].id);
    }, [farms, agentId, handleSwitchAgent]);

    // 监听键盘左右方向键切换居民
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 如果打开了背包或配置弹窗，不响应左右键切换
            if (configure || inventory) return;
            if (farms.length <= 1) return;

            // 如果当前在输入框、文本域等交互输入元素内，不拦截
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable)
            ) {
                return;
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                handlePrevAgent();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                handleNextAgent();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [configure, inventory, farms.length, handlePrevAgent, handleNextAgent]);

    // 选中的居民项平滑居中滚动至视野（仅在水平方向平滑滚动列表容器，避免移动端意外触发上下全局位移）
    useEffect(() => {
        if (agentId) {
            const el = residentItemRefs.current.get(agentId);
            const container = residentListRef.current;
            if (el && container) {
                const containerBounds = container.getBoundingClientRect();
                const elementBounds = el.getBoundingClientRect();
                const elLeft = elementBounds.left - containerBounds.left - container.clientLeft + container.scrollLeft;
                const elRight = elLeft + elementBounds.width;
                const containerLeft = container.scrollLeft;
                const containerRight = containerLeft + container.clientWidth;
                if (elLeft < containerLeft) {
                    container.scrollTo({left: Math.max(0, elLeft - 12), behavior: 'smooth'});
                } else if (elRight > containerRight) {
                    container.scrollTo({
                        left: elRight - container.clientWidth + 12,
                        behavior: 'smooth',
                    });
                }
            }
        }
    }, [agentId]);

    // 当用户在画布上点选时，自动切换回观察面板
    const handleSelect = (value: FarmSelection) => {
        setSelection(value);
        setActiveTab('details');
    };

    return (
        <div className="w-full min-w-0 flex-1 flex flex-col min-h-0 gap-3">
            {/* 顶部单行一体化控制栏 */}
            <div className="w-full min-w-0 shrink-0 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-2 text-xs">
                {/* 左侧：天气、余额、行动 */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {farm && (
                        <>
                            {/* 天气徽标 */}
                            <span
                                className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-semibold ${
                                    farm.weather === 'rain'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                            >
                                {farm.weather === 'rain' ? (
                                    <CloudRain className="h-3.5 w-3.5" />
                                ) : (
                                    <Sun className="h-3.5 w-3.5" />
                                )}
                                <span>{farm.weather === 'rain' ? '雨天 · 自动浇水' : '晴天'}</span>
                            </span>

                            {/* 余额 */}
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono font-medium text-slate-700 shadow-2xs">
                                <Coins className="h-3 w-3 text-amber-500" />
                                <span>余额 ¥{farm.balance ?? '0.00'}</span>
                            </span>

                            {/* 行动状态 */}
                            <span className="hidden truncate text-slate-500 sm:inline max-w-[200px] xl:max-w-xs">
                                {farm.currentAction || '按自己的节奏生活'}
                            </span>
                        </>
                    )}
                </div>

                {/* 右侧：操作按钮群 */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <Link
                        to="/settings?tab=agent"
                        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 shadow-2xs hover:bg-slate-50"
                    >
                        <span>任务设置</span>
                        <ExternalLink className="h-3 w-3" />
                    </Link>

                    {farm && (
                        <>
                            <button
                                type="button"
                                onClick={() => setInventory(true)}
                                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 shadow-2xs transition-colors hover:bg-slate-50"
                            >
                                <Package className="h-3.5 w-3.5" />
                                <span>打开背包</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setConfigure(true)}
                                className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 font-medium text-white shadow-2xs transition-all hover:bg-orange-600 active:scale-95"
                            >
                                <Settings2 className="h-3.5 w-3.5" />
                                <span>农场配置</span>
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div
                    role="alert"
                    className="flex items-center justify-between rounded-xl bg-orange-50 p-3 text-xs text-orange-700"
                >
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={refresh}
                        className="ml-3 shrink-0 font-medium underline"
                    >
                        重试
                    </button>
                </div>
            )}

            {loading && !farm ? (
                <div className="rounded-2xl bg-white p-12 text-center text-xs text-slate-400">
                    正在铺开农场与像素地块…
                </div>
            ) : !farm ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
                    <Warehouse className="mx-auto h-12 w-12 text-lime-400" />
                    <h2 className="mt-4 font-semibold text-slate-700 text-sm">
                        农场还在等待第一位居民
                    </h2>
                    <p className="mt-2 text-xs text-slate-500">
                        在 Agent 任务中配置并启用“农场经营”，绑定居民后获得四块初始耕地。
                    </p>
                    <Link
                        to="/settings?tab=agent"
                        className="mt-4 inline-block rounded-lg bg-orange-500 px-3.5 py-1.5 text-xs text-white shadow-xs"
                    >
                        配置农场任务
                    </Link>
                </section>
            ) : (
                /* 主体分栏：移动端自适应流动，PC 端左右等高分栏（消除弹窗纵向滚动） */
                <div className="w-full min-w-0 flex-1 min-h-0 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px]">
                    {/* 左侧：像素画布与居民切换展示 */}
                    <div className="w-full min-w-0 flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs min-h-0">
                        <div className="w-full min-w-0 flex-1 flex items-center justify-center min-h-0">
                            <FarmCanvas farm={farm} onSelect={handleSelect} />
                        </div>

                        {/* 底部居民头像+名字快速切换栏 */}
                        <div className="w-full min-w-0 shrink-0 mt-2.5 flex flex-col gap-2 pt-2 border-t border-slate-100">
                            <div className="w-full min-w-0 flex items-center gap-1.5">
                                {farms.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={handlePrevAgent}
                                        title="切换至上一个居民 (←)"
                                        aria-label="上一个居民"
                                        className="flex h-10 w-7 sm:w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-500 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95 cursor-pointer"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                )}

                                <div
                                    ref={residentListRef}
                                    className="flex flex-1 min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide py-1 px-0.5"
                                >
                                    {farms.map((f) => {
                                        const isActive = f.id === agentId;
                                        return (
                                            <button
                                                key={f.id}
                                                type="button"
                                                ref={(el) => {
                                                    if (el) residentItemRefs.current.set(f.id, el);
                                                    else residentItemRefs.current.delete(f.id);
                                                }}
                                                onClick={() => handleSwitchAgent(f.id)}
                                                className={`group flex shrink-0 items-center gap-2 rounded-xl border p-1.5 pr-2.5 text-xs transition-all cursor-pointer ${
                                                    isActive
                                                        ? 'border-orange-400 bg-orange-50/90 text-orange-950 font-medium shadow-xs ring-2 ring-orange-300/40'
                                                        : 'border-slate-200/90 bg-white text-slate-600 shadow-2xs hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                                                }`}
                                            >
                                                <FarmResidentAvatar
                                                    name={f.actorName}
                                                    avatar={f.avatar}
                                                    appearance={f.appearance}
                                                />
                                                <div className="flex flex-col min-w-0 text-left">
                                                    <span
                                                        className={`truncate max-w-[76px] sm:max-w-[92px] font-bold text-xs leading-tight ${
                                                            isActive ? 'text-orange-950' : 'text-slate-800'
                                                        }`}
                                                        title={f.actorName}
                                                    >
                                                        {f.actorName}
                                                    </span>
                                                    <div className="mt-0.5 flex items-center">
                                                        {f.professionName ? (
                                                            <ProfessionBadge professionName={f.professionName} size="xs" />
                                                        ) : (
                                                            <span className="text-[10px] text-slate-400 leading-tight">普通居民</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {farms.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={handleNextAgent}
                                        title="切换至下一个居民 (→)"
                                        aria-label="下一个居民"
                                        className="flex h-10 w-7 sm:w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-500 shadow-2xs transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95 cursor-pointer"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
                                <span>现实时间成长 · 缺水或缺饲料暂停 · 动物满心50%双产、10%金色产物</span>
                                {farms.length > 1 && (
                                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400">
                                        按 <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[9px] shadow-2xs text-slate-500">←</kbd>
                                        <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[9px] shadow-2xs text-slate-500">→</kbd> 快捷切换居民
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 右侧：一体化观察与记录面板 */}
                    <div className="w-full min-w-0 flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden min-h-0">
                        {/* 顶部 Tab 切换控制器 */}
                        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 p-2">
                            <div className="flex rounded-lg bg-slate-200/60 p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('details')}
                                    className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all ${
                                        activeTab === 'details'
                                            ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                            : 'font-medium text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <Eye className="h-3 w-3" />
                                    <span>农场观察</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('history')}
                                    className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-all ${
                                        activeTab === 'history'
                                            ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                            : 'font-medium text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <History className="h-3 w-3" />
                                    <span>经营记录</span>
                                    {history.length > 0 && (
                                        <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[9px] font-mono text-slate-500">
                                            {history.length}
                                        </span>
                                    )}
                                </button>
                            </div>

                            <span className="text-[10px] text-slate-400 pr-1 font-mono">
                                居民: {farm.actorName}
                            </span>
                        </div>

                        {/* 内容区：独立内部平滑滚动 */}
                        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3">
                            {activeTab === 'details' ? (
                                <FarmDetails
                                    farm={farm}
                                    selection={selection}
                                    onSelect={setSelection}
                                />
                            ) : (
                                <div className="space-y-2">
                                    {!history.length ? (
                                        <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-slate-400">
                                            <History className="h-6 w-6 text-slate-300 mb-1" />
                                            <span>尚无经营记录，等待居民的第一次行动。</span>
                                        </div>
                                    ) : (
                                        history.map((o) => (
                                            <article
                                                key={o.id}
                                                className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-xs transition-colors hover:bg-slate-50"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-slate-800">
                                                        {o.result.label}
                                                    </span>
                                                    <span
                                                        className={`font-mono font-medium ${
                                                            Number(o.result.amount) > 0
                                                                ? 'text-emerald-600'
                                                                : Number(o.result.amount) < 0
                                                                    ? 'text-red-600'
                                                                    : 'text-slate-500'
                                                        }`}
                                                    >
                                                        {Number(o.result.amount) !== 0
                                                            ? `${Number(o.result.amount) > 0 ? '+' : ''}${o.result.amount}`
                                                            : '体力 −2'}
                                                    </span>
                                                </div>

                                                {o.reason && (
                                                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                                                        {o.reason}
                                                    </p>
                                                )}

                                                {o.result.products && (
                                                    <p className="mt-1 text-[11px] font-medium text-amber-700">
                                                        产物：
                                                        {o.result.products
                                                            .map((p) => `${p.name} ×${p.quantity}`)
                                                            .join('、')}
                                                    </p>
                                                )}

                                                {o.result.productionBonus?.map((p, i) => (
                                                    <p
                                                        key={`${p.sku}:${i}`}
                                                        className="text-[10px] text-lime-700"
                                                    >
                                                        {p.name} {p.sku.startsWith('crop.') ? `★${p.stars || 1}` : ''} ×{p.quantity}（基础
                                                        {p.baseQuantity}，额外
                                                        {p.extraQuantity}）{p.event === 'pests' ? ' · 轻微虫害' : p.event === 'cold' ? ' · 低温降星' : ''}
                                                    </p>
                                                ))}

                                                {o.result.experienceGained !== undefined && <p className="mt-1 text-[10px] text-lime-700">种植经验 +{o.result.experienceGained} · 累计 {o.result.experienceAfter}</p>}
                                                <time className="mt-1 block font-mono text-[9px] text-slate-400">
                                                    {new Date(o.createdAt).toLocaleString(
                                                        'zh-CN',
                                                        {
                                                            month: 'numeric',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        }
                                                    )}
                                                </time>
                                            </article>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {configure && farm && (
                <FarmConfiguration farm={farm} onClose={close} onSaved={refresh} />
            )}
            {inventory && farm && (
                <AgentInventoryDialog
                    agentId={farm.id}
                    name={farm.actorName}
                    onClose={() => setInventory(false)}
                />
            )}
        </div>
    );
}
