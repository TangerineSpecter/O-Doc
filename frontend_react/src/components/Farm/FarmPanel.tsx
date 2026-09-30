import {useCallback, useState} from 'react';
import {
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
import {Select} from '../common/Select';
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
                className="h-6 w-6 shrink-0 rounded-lg object-cover border border-orange-100/90 shadow-2xs"
            />
        );
    }
    if (avatar && avatar.trim()) {
        return (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-xs shadow-2xs">
                {avatar}
            </span>
        );
    }
    if (appearance) {
        return (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-lime-200/90 bg-lime-50 shadow-2xs">
                <div
                    style={{
                        width: 32,
                        height: 32,
                        transform: 'scale(0.65) translateY(1px)',
                        transformOrigin: 'center center',
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
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-orange-100 bg-orange-50 text-orange-600 shadow-2xs">
            <Bot className="h-3.5 w-3.5" />
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

    const close = useCallback(() => setConfigure(false), []);

    // 当用户在画布上点选时，自动切换回观察面板
    const handleSelect = (value: FarmSelection) => {
        setSelection(value);
        setActiveTab('details');
    };

    return (
        <div className="space-y-3">
            {/* 顶部单行一体化控制栏 */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-2 text-xs">
                {/* 左侧：居民、天气、余额、行动 */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {!!farms.length && (
                        <div className="w-52 sm:w-60">
                            <Select
                                menuPortal
                                value={agentId}
                                options={farms.map((f) => ({
                                    value: f.id,
                                    label: (
                                        <span className="flex min-w-0 items-center gap-1.5">
                                            <span className="truncate font-medium">{f.actorName}</span>
                                            {f.professionName && (
                                                <ProfessionBadge professionName={f.professionName} size="xs" />
                                            )}
                                        </span>
                                    ),
                                    icon: (
                                        <FarmResidentAvatar
                                            name={f.actorName}
                                            avatar={f.avatar}
                                            appearance={f.appearance}
                                        />
                                    ),
                                }))}
                                onChange={(id) => {
                                    setAgentId(id);
                                    setSelection(null);
                                    setConfigure(false);
                                    setInventory(false);
                                }}
                                buttonClassName="!min-h-[34px] !py-1 !px-2.5 text-xs shadow-2xs rounded-xl border-slate-200/90"
                                menuClassName="w-56 sm:w-64"
                            />
                        </div>
                    )}

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
                <div className="flex items-center gap-2">
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
                /* 主体左右等高分栏：左侧画布，右侧 Tab 观察与记录（消除弹窗纵向滚动） */
                <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_360px] h-[calc(88vh-145px)] min-h-[480px]">
                    {/* 左侧：像素画布与成长说明 */}
                    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs">
                        <div className="flex-1 flex items-center justify-center min-h-0">
                            <FarmCanvas farm={farm} onSelect={handleSelect} />
                        </div>
                        <p className="mt-2 text-center text-[11px] text-slate-400">
                            现实时间成长 · 缺水或缺饲料暂停 · 动物满心50%双产、10%金色产物
                        </p>
                    </div>

                    {/* 右侧：一体化观察与记录面板 */}
                    <div className="flex flex-col rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
                        {/* 顶部 Tab 切换控制器 */}
                        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-2">
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
                        <div className="flex-1 min-h-0 overflow-y-auto p-3">
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
                                                                ? 'text-lime-600'
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
                                                        {p.name} ×{p.quantity}（基础
                                                        {p.baseQuantity}，额外
                                                        {p.extraQuantity}）
                                                    </p>
                                                ))}

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
