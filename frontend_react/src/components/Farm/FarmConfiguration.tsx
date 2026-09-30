import {useEffect, useId, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import {farmAtlasUrl, farmItemIcon} from './assets';
import {
    X,
    Sparkles,
    User,
    Clock,
    Coins,
    TrendingUp,
    Warehouse,
    Home,
    Sprout,
    Wheat,
    Palette,
    Check,
    Loader2,
    AlertCircle,
    Sliders,
    HelpCircle,
    Info,
} from 'lucide-react';
import {getFarmRules, saveFarmAppearance, saveFarmRules} from '../../api/farm';
import type {FarmState, FarmRules} from '../../types/api/farm';

// 像素形象服装款式
const APPEARANCE_STYLES = [
    {id: 0, name: '草帽园丁', desc: '质朴田园，辛勤耕耘的代表'},
    {id: 1, name: '长发居民', desc: '随性优雅，带有悠闲的气质'},
    {id: 2, name: '绿帽居民', desc: '经典复古，充满探索的活力'},
    {id: 3, name: '短发居民', desc: '利落清爽，精神饱满的干劲'},
];

// 像素形象调色盘
const APPEARANCE_PALETTES = [
    {id: 0, name: '活力橘', desc: '橘子小镇暖阳色', hex: '#f97316', ringColor: 'ring-orange-400', bgClass: 'bg-orange-500'},
    {id: 1, name: '清爽蓝', desc: '澄澈晨溪天空色', hex: '#0284c7', ringColor: 'ring-sky-400', bgClass: 'bg-sky-500'},
    {id: 2, name: '田园绿', desc: '初春嫩草与新芽', hex: '#16a34a', ringColor: 'ring-emerald-400', bgClass: 'bg-emerald-600'},
    {id: 3, name: '梦幻紫', desc: '暮光薰衣草芬芳', hex: '#9333ea', ringColor: 'ring-purple-400', bgClass: 'bg-purple-600'},
];

// 人性化秒数格式化：将生硬的秒数转换为容易理解的天/小时/分
function formatHumanDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0 秒';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days >= 1) {
        const totalHours = Math.round((seconds / 3600) * 10) / 10;
        return hours > 0
            ? `${days}天 ${hours}小时 (共${totalHours}h)`
            : `${days}天整 (共${days * 24}h)`;
    }
    if (hours >= 1) {
        return minutes > 0 ? `${hours}小时 ${minutes}分` : `${hours}小时整`;
    }
    if (minutes >= 1) {
        return secs > 0 ? `${minutes}分 ${secs}秒` : `${minutes}分钟`;
    }
    return `${secs}秒`;
}

type TabKey = 'appearance' | 'animals' | 'buildings';

export function FarmConfiguration({
    farm,
    onClose,
    onSaved,
}: {
    farm: FarmState;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [appearance, setAppearance] = useState(farm.appearance);
    const [rules, setRules] = useState<FarmRules | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('appearance');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [loadingRules, setLoadingRules] = useState(true);

    const modal = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useEscapeDismissal(true, () => {
        if (!saving) onClose();
        return true;
    });

    useEffect(() => {
        let alive = true;
        setLoadingRules(true);
        getFarmRules()
            .then((r) => {
                if (alive) {
                    setRules(r);
                    setLoadingRules(false);
                }
            })
            .catch(() => {
                if (alive) {
                    setError('经营目录加载失败，请关闭后重试');
                    setLoadingRules(false);
                }
            });

        const previous = document.activeElement as HTMLElement | null;
        modal.current?.focus();

        const key = (e: KeyboardEvent) => {
            if (e.key === 'Tab') {
                const items = modal.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
                );
                if (items?.length) {
                    const first = items[0],
                        last = items[items.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        };

        document.addEventListener('keydown', key);
        return () => {
            alive = false;
            document.removeEventListener('keydown', key);
            previous?.focus();
        };
    }, [onClose]);

    async function handleSave() {
        if (!rules) return;
        setSaving(true);
        setError('');
        try {
            await saveFarmRules(rules);
            await saveFarmAppearance(farm.id, appearance);
            onSaved();
            onClose();
        } catch {
            setError('保存失败，请检查数值或重试；已经保存的目录仍然有效');
        } finally {
            setSaving(false);
        }
    }

    // 通用数字输入组件（紧凑规整，杜绝溢出与文字拥挤）
    const renderNumberField = ({
        label,
        value,
        onChange,
        unit,
        icon: FieldIcon,
        min = 1,
        max = 1000000,
    }: {
        label: string;
        value: number;
        onChange: (n: number) => void;
        unit?: string;
        icon?: React.ComponentType<{className?: string}>;
        min?: number;
        max?: number;
    }) => (
        <div className="space-y-1.5 min-w-0">
            <div className="flex items-center text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-700 truncate">
                    {FieldIcon && <FieldIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                    <span className="truncate">{label}</span>
                </span>
            </div>
            <div className="relative flex items-center rounded-lg border border-slate-200 bg-white transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 hover:border-slate-300">
                <input
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="w-full bg-transparent px-3 py-1.5 text-sm font-medium text-slate-800 placeholder-slate-400 outline-none min-w-0"
                />
                {unit && (
                    <span className="pointer-events-none pr-3 text-xs font-medium text-slate-400 shrink-0 select-none">
                        {unit}
                    </span>
                )}
            </div>
        </div>
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-200"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !saving) onClose();
            }}
        >
            <div
                ref={modal}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
            >
                {/* 1. Header 头部设计 */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-gradient-to-r from-orange-50/50 via-white to-lime-50/40">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100/80 text-orange-600 shadow-2xs border border-orange-200/50">
                            <Sliders className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 id={titleId} className="text-base font-bold text-slate-800">
                                农场经营与形象配置
                            </h2>
                            <p className="text-xs text-slate-500">
                                装扮 {farm.actorName} 的像素形象，调优全农场经营法则
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="关闭配置"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* 2. 胶囊分段控制器 (Segmented Tab Bar) */}
                <div className="border-b border-slate-100 px-6 pt-3 pb-2.5 bg-slate-50/50">
                    <div className="flex rounded-xl bg-slate-200/60 p-1 border border-slate-200/40">
                        <button
                            type="button"
                            onClick={() => setActiveTab('appearance')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                                activeTab === 'appearance'
                                    ? 'bg-white text-orange-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                            }`}
                        >
                            <User className="h-3.5 w-3.5 shrink-0" />
                            <span>居民像素形象</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('animals')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                                activeTab === 'animals'
                                    ? 'bg-white text-orange-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                            }`}
                        >
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span>动物养殖法则</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('buildings')}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
                                activeTab === 'buildings'
                                    ? 'bg-white text-orange-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                            }`}
                        >
                            <Warehouse className="h-3.5 w-3.5 shrink-0" />
                            <span>建筑与地皮</span>
                        </button>
                    </div>
                </div>

                {/* 3. 弹窗主内容区域 (禁止原生滚动条，统一 scrollbar-hide) */}
                <div className="flex-1 overflow-y-auto scrollbar-hide p-6 space-y-6">
                    {/* TAB 1: 居民像素形象 */}
                    {activeTab === 'appearance' && (
                        <div className="space-y-6 animate-in fade-in duration-150">
                            {/* 像素角色展示舞台 */}
                            <div className="relative flex flex-col items-center justify-center rounded-2xl border border-lime-200/80 bg-gradient-to-b from-sky-50/60 via-amber-50/40 to-lime-100/70 p-6 shadow-inner overflow-hidden">
                                {/* 装饰云朵/光晕质感 */}
                                <div className="absolute top-2 right-4 flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 shadow-2xs backdrop-blur-xs">
                                    <Sparkles className="h-3 w-3 text-amber-500" />
                                    <span>像素角色 32×32</span>
                                </div>

                                {/* 角色头顶铭牌 */}
                                <div className="mb-2 flex items-center gap-1.5 rounded-full border border-lime-300/80 bg-white/95 px-3 py-1 text-xs font-bold text-slate-800 shadow-xs backdrop-blur-xs">
                                    <Sprout className="h-3.5 w-3.5 text-lime-600" />
                                    <span>农场主人 · {farm.actorName}</span>
                                </div>

                                {/* 像素角色精灵图渲染 */}
                                <div className="relative my-1 flex items-center justify-center">
                                    <div
                                        role="img"
                                        aria-label="像素角色预览"
                                        style={{
                                            width: 96,
                                            height: 96,
                                            imageRendering: 'pixelated',
                                            backgroundImage: `url(${farmAtlasUrl})`,
                                            backgroundSize: '3072px auto',
                                            backgroundPosition: `0px -${(appearance.style * 8 + appearance.palette * 2) * 192}px`,
                                        }}
                                    />
                                </div>

                                {/* 脚下草地阴影 */}
                                <div className="h-3.5 w-16 rounded-[100%] bg-emerald-900/10 blur-[2px]" />

                                {/* 当前形象搭配描述 */}
                                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-600 bg-white/80 px-3 py-1 rounded-full border border-lime-200/50 shadow-2xs">
                                    <span>装扮：{APPEARANCE_STYLES[appearance.style]?.name || '默认服装'}</span>
                                    <span className="text-slate-300">·</span>
                                    <span>配色：{APPEARANCE_PALETTES[appearance.palette]?.name || '默认色彩'}</span>
                                </div>
                            </div>

                            {/* 形象款式选择器 */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                                        <User className="h-4 w-4 text-orange-500" />
                                        <span>服饰造型风格</span>
                                    </h3>
                                    <span className="text-xs text-slate-400">点击下方款式即刻试穿</span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {APPEARANCE_STYLES.map((style) => {
                                        const isSelected = appearance.style === style.id;
                                        return (
                                            <button
                                                key={style.id}
                                                type="button"
                                                onClick={() => setAppearance({...appearance, style: style.id})}
                                                className={`group relative flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                                                    isSelected
                                                        ? 'border-orange-500 bg-orange-50/70 shadow-xs ring-2 ring-orange-500/20'
                                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                                                }`}
                                            >
                                                <div className="flex w-full items-center justify-between">
                                                    <span className={`text-xs font-bold ${isSelected ? 'text-orange-950' : 'text-slate-800'}`}>
                                                        {style.name}
                                                    </span>
                                                    {isSelected && (
                                                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white">
                                                            <Check className="h-2.5 w-2.5 stroke-[3]" />
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="mt-1 text-[11px] leading-tight text-slate-500">
                                                    {style.desc}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 配色调色板选择器 */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                                        <Palette className="h-4 w-4 text-orange-500" />
                                        <span>服饰调色盘系</span>
                                    </h3>
                                    <span className="text-xs text-slate-400">选择心仪的农场主主题色</span>
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {APPEARANCE_PALETTES.map((pal) => {
                                        const isSelected = appearance.palette === pal.id;
                                        return (
                                            <button
                                                key={pal.id}
                                                type="button"
                                                onClick={() => setAppearance({...appearance, palette: pal.id})}
                                                className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                                                    isSelected
                                                        ? 'border-orange-500 bg-orange-50/70 shadow-xs ring-2 ring-orange-500/20'
                                                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                                                }`}
                                            >
                                                <div
                                                    className={`h-5 w-5 shrink-0 rounded-full shadow-inner ${pal.bgClass} flex items-center justify-center text-white ring-2 ring-white`}
                                                >
                                                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className={`text-xs font-bold truncate ${isSelected ? 'text-orange-950' : 'text-slate-800'}`}>
                                                        {pal.name}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 truncate">
                                                        {pal.desc}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: 动物养殖法则 */}
                    {activeTab === 'animals' && (
                        <div className="space-y-5 animate-in fade-in duration-150">
                            {/* 温馨提示条 */}
                            <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 to-orange-50/50 p-3.5 text-xs text-amber-900 shadow-2xs">
                                <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <div className="leading-relaxed">
                                    <span className="font-bold">世界全局经营法则：</span>
                                    此规则全农场共享。数值变更仅对后续新购买的幼崽以及新启动的生产周期生效；当前正在成长中的动物与作物将保留原周期直至收获。作物规则请在物品图鉴中进行调整。
                                </div>
                            </div>

                            {loadingRules && (
                                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                                    <span className="text-sm font-medium">正在读取世界经营参数…</span>
                                </div>
                            )}

                            {rules && (
                                <div className="space-y-4">
                                    {Object.entries(rules.animals).map(([id, animal]) => {
                                        const animalIcon = farmItemIcon(`animal.${id}`);
                                        const productIcon = farmItemIcon(`product.${id}.normal`);
                                        const buildingName = animal.building === 'barn' ? '牛羊舍' : '鸡舍';

                                        return (
                                            <div
                                                key={id}
                                                className="group relative rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs transition-all hover:border-orange-200 hover:shadow-xs"
                                            >
                                                {/* 动物卡片 Header */}
                                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 p-1 shadow-inner">
                                                            {animalIcon ? (
                                                                <img
                                                                    src={animalIcon}
                                                                    alt={animal.name}
                                                                    className="h-8 w-8 object-contain"
                                                                    style={{imageRendering: 'pixelated'}}
                                                                />
                                                            ) : (
                                                                <Sparkles className="h-5 w-5 text-orange-500" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-base font-bold text-slate-900">
                                                                    {animal.name}
                                                                </span>
                                                                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200/70">
                                                                    居所: {buildingName}
                                                                </span>
                                                                {/* 等效周期微圆角徽章（移至左侧，使用微圆角 rounded-md） */}
                                                                <span className="inline-flex items-center gap-1 rounded-md bg-lime-50 border border-lime-200/80 px-2 py-0.5 text-xs font-semibold text-lime-800">
                                                                    <Clock className="h-3 w-3 text-lime-600 shrink-0" />
                                                                    <span>等效周期: {formatHumanDuration(animal.periodSeconds)}</span>
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                                                {productIcon && (
                                                                    <img
                                                                        src={productIcon}
                                                                        alt={animal.product}
                                                                        className="h-3.5 w-3.5 object-contain"
                                                                        style={{imageRendering: 'pixelated'}}
                                                                    />
                                                                )}
                                                                <span>常态产出: {animal.product}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 3 个参数输入网格（去掉多余冗余hint，清爽无挤压感） */}
                                                <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                                                    {renderNumberField({
                                                        label: '单次生产周期',
                                                        value: animal.periodSeconds,
                                                        onChange: (n) =>
                                                            setRules({
                                                                ...rules,
                                                                animals: {
                                                                    ...rules.animals,
                                                                    [id]: {...animal, periodSeconds: n},
                                                                },
                                                            }),
                                                        unit: '秒',
                                                        icon: Clock,
                                                    })}

                                                    {renderNumberField({
                                                        label: '购买幼崽单价',
                                                        value: animal.price,
                                                        onChange: (n) =>
                                                            setRules({
                                                                ...rules,
                                                                animals: {
                                                                    ...rules.animals,
                                                                    [id]: {...animal, price: n},
                                                                },
                                                            }),
                                                        unit: '金币',
                                                        icon: Coins,
                                                    })}

                                                    {renderNumberField({
                                                        label: '产物回收单价',
                                                        value: animal.salePrice,
                                                        onChange: (n) =>
                                                            setRules({
                                                                ...rules,
                                                                animals: {
                                                                    ...rules.animals,
                                                                    [id]: {...animal, salePrice: n},
                                                                },
                                                            }),
                                                        unit: '金币',
                                                        icon: TrendingUp,
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: 建筑与地皮 */}
                    {activeTab === 'buildings' && (
                        <div className="space-y-6 animate-in fade-in duration-150">
                            {/* 温馨提示条 */}
                            <div className="flex items-start gap-3 rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-50/80 to-indigo-50/40 p-3.5 text-xs text-sky-900 shadow-2xs">
                                <Home className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
                                <div className="leading-relaxed">
                                    <span className="font-bold">农场资产扩建：</span>
                                    规划鸡舍、牛羊舍的等级梯度容纳上限，以及扩充农场耕地地块、采购精制饲料的基础成本。
                                </div>
                            </div>

                            {loadingRules && (
                                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                                    <span className="text-sm font-medium">正在读取建筑与地块数据…</span>
                                </div>
                            )}

                            {rules && (
                                <div className="space-y-6">
                                    {/* 建筑升级配置 */}
                                    <div className="space-y-4">
                                        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                            <Warehouse className="h-4 w-4 text-orange-500" />
                                            <span>养殖建筑阶梯升级</span>
                                        </h3>

                                        <div className="space-y-4">
                                            {Object.entries(rules.buildings).map(([id, building]) => (
                                                <div
                                                    key={id}
                                                    className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs"
                                                >
                                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-100">
                                                                <Home className="h-4 w-4" />
                                                            </div>
                                                            <div>
                                                                <span className="font-bold text-slate-800 text-sm">
                                                                    {building.name}
                                                                </span>
                                                                <span className="ml-2 text-xs text-slate-400">
                                                                    共 {building.prices.length} 个建筑等级
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                        {building.prices.map((price, i) => (
                                                            <div
                                                                key={i}
                                                                className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 space-y-2.5"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="inline-flex items-center rounded-md bg-white border border-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700 shadow-2xs">
                                                                        Lv.{i + 1} 级别
                                                                    </span>
                                                                    <span className="text-[11px] text-slate-400">
                                                                        阶梯 {i + 1}
                                                                    </span>
                                                                </div>

                                                                {renderNumberField({
                                                                    label: '升级建造费用',
                                                                    value: price,
                                                                    onChange: (n) =>
                                                                        setRules({
                                                                            ...rules,
                                                                            buildings: {
                                                                                ...rules.buildings,
                                                                                [id]: {
                                                                                    ...building,
                                                                                    prices: building.prices.map((v, j) =>
                                                                                        j === i ? n : v
                                                                                    ),
                                                                                },
                                                                            },
                                                                        }),
                                                                    unit: '金币',
                                                                    icon: Coins,
                                                                })}

                                                                {renderNumberField({
                                                                    label: '容纳养殖上限',
                                                                    value: building.capacities[i],
                                                                    onChange: (n) =>
                                                                        setRules({
                                                                            ...rules,
                                                                            buildings: {
                                                                                ...rules.buildings,
                                                                                [id]: {
                                                                                    ...building,
                                                                                    capacities: building.capacities.map(
                                                                                        (v, j) => (j === i ? n : v)
                                                                                    ),
                                                                                },
                                                                            },
                                                                        }),
                                                                    unit: '只',
                                                                    icon: Sparkles,
                                                                })}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 饲料单价与土地开垦定价 */}
                                    <div className="space-y-3 pt-2">
                                        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                            <Sprout className="h-4 w-4 text-lime-600" />
                                            <span>补给饲料与土地拓荒定价</span>
                                        </h3>

                                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                            {/* 饲料卡片 */}
                                            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 p-1 border border-amber-100">
                                                        <img
                                                            src={farmItemIcon('feed')}
                                                            alt="饲料"
                                                            className="h-5 w-5 object-contain"
                                                            style={{imageRendering: 'pixelated'}}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-800">
                                                        通用饲料
                                                    </span>
                                                </div>
                                                {renderNumberField({
                                                    label: '每份采购价',
                                                    value: rules.feedPrice,
                                                    onChange: (n) => setRules({...rules, feedPrice: n}),
                                                    unit: '金币',
                                                    icon: Wheat,
                                                })}
                                            </div>

                                            {/* 各组土地开垦定价 */}
                                            {rules.landPrices.map((price, i) => (
                                                <div
                                                    key={i}
                                                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs space-y-2"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-lime-50 text-lime-700 border border-lime-200/60">
                                                            <Sprout className="h-4 w-4" />
                                                        </div>
                                                        <span className="text-xs font-bold text-slate-800">
                                                            第 {i + 2} 组土地
                                                        </span>
                                                    </div>
                                                    {renderNumberField({
                                                        label: '开垦拓展费用',
                                                        value: price,
                                                        onChange: (n) =>
                                                            setRules({
                                                                ...rules,
                                                                landPrices: rules.landPrices.map((v, j) =>
                                                                    j === i ? n : v
                                                                ),
                                                            }),
                                                        unit: '金币',
                                                        icon: Coins,
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 错误提示栏 */}
                    {error && (
                        <div
                            role="alert"
                            className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 shadow-2xs animate-in fade-in"
                        >
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* 4. Footer 底部操作栏 */}
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-6 py-4">
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
                        <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                        <span>数值修改将即时作用于当前世界的模拟机制</span>
                    </div>

                    <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
                        <button
                            type="button"
                            disabled={saving}
                            onClick={onClose}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            disabled={saving || !rules}
                            onClick={() => void handleSave()}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-medium text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 active:scale-95 active:bg-orange-700 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                                    <span>正在保存…</span>
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 shrink-0" />
                                    <span>保存配置</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
