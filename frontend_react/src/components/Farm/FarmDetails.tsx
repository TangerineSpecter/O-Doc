import {useEffect, useRef, useState} from 'react';
import {Clock, Droplets, Heart, Sparkles, Sprout, Home, Warehouse, Eye, Info, X} from 'lucide-react';
import type {FarmSelection, FarmState} from '../../types/api/farm';
import {FarmBonus} from './FarmBonus';
import LevelPlate from '../AgentWorld/LevelPlate';

const animalNames = {chicken: '母鸡', cow: '奶牛', sheep: '绵羊'};

export function FarmDetails({
    farm,
    selection,
    onSelect,
}: {
    farm: FarmState;
    selection: FarmSelection | null;
    onSelect: (value: FarmSelection) => void;
}) {
    const at = Date.parse(farm.serverTime) / 1000;
    const plot =
        selection?.kind === 'plot'
            ? farm.state.plots.find((p) => p.id === selection.id)
            : null;
    const animal =
        selection?.kind === 'animal'
            ? farm.state.animals.find((a) => a.id === selection.id)
            : null;
    const building =
        selection?.kind === 'building'
            ? farm.state.buildings[selection.id as 'coop' | 'barn']
            : null;
    const buildingAnimals =
        selection?.kind === 'building'
            ? farm.state.animals.filter((a) => a.building === selection.id)
            : [];

    const remaining = (seconds: number) =>
        seconds <= 0 ? '已成熟可收获' : `剩余约 ${Math.ceil(seconds / 60)} 分钟生长时间`;

    const [showQualityInfo, setShowQualityInfo] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const hasQualityInfo = Boolean(plot?.crop?.qualityVersion === 1);

    // 切换地块或对象时自动收起浮层
    useEffect(() => {
        setShowQualityInfo(false);
    }, [selection?.id, selection?.kind]);

    // 点击浮层与按钮之外的任意地方，或者按 Esc 键，均自动关闭浮层
    useEffect(() => {
        if (!showQualityInfo) return;

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            // 点击在浮层内部不关闭
            if (popoverRef.current && popoverRef.current.contains(target)) {
                return;
            }
            // 点击在触发按钮上交给按钮 onClick 处理
            if (buttonRef.current && buttonRef.current.contains(target)) {
                return;
            }
            // 点击其他任意地方（包括耕地卡片空白处、下方网格、页面背景等）自动关闭
            setShowQualityInfo(false);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowQualityInfo(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('touchstart', handleClickOutside, true);
        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
            document.removeEventListener('touchstart', handleClickOutside, true);
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [showQualityInfo]);

    return (
        <div className="space-y-3">
            <div className="rounded-xl border border-lime-200/90 bg-lime-50/80 p-3 text-xs text-lime-900 shadow-2xs">
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <Sprout className="h-4 w-4 text-lime-600" />
                        种植
                        <LevelPlate level={farm.planting?.level || 1} variant="lime" size="sm" />
                    </span>
                    <span className="font-bold tabular-nums text-slate-700">
                        {farm.planting?.experience || 0}
                        <span className="ml-1 text-[11px] font-normal text-slate-500">经验</span>
                    </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-lime-100">
                    <div
                        className="h-full rounded-full bg-lime-500 transition-all duration-300"
                        style={{width: `${Math.max(0, Math.min(100, (farm.planting?.progress || 0) * 100))}%`}}
                    />
                </div>
            </div>
            {/* 职业产量加成 */}
            <FarmBonus farm={farm} />

            {/* 观察焦点反馈区（固定高度 96px，统一工整三行结构，杜绝切换时导致下方卡片产生任何位移） */}
            <div className="relative">
                <div
                    aria-live="polite"
                    className="h-[96px] min-h-[96px] max-h-[96px] rounded-xl border border-lime-200/90 bg-gradient-to-b from-lime-50/70 to-emerald-50/20 p-2.5 sm:p-3 text-xs leading-relaxed text-slate-700 shadow-2xs flex flex-col justify-between overflow-hidden select-none"
                >
                    {plot ? (
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1.5">
                                <span className="flex items-center gap-1.5 font-bold text-slate-900 truncate min-w-0">
                                    <Sprout className="h-3.5 w-3.5 text-lime-600 shrink-0" />
                                    <span className="truncate">
                                        耕地 #{Number(plot.id) + 1} · {plot.crop?.rules.name || '空闲耕地'}
                                    </span>
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {hasQualityInfo && (
                                        <button
                                            ref={buttonRef}
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowQualityInfo((prev) => !prev);
                                            }}
                                            title={showQualityInfo ? '收起作物品质与概率详情' : '展开作物品质与概率详情'}
                                            aria-label="作物品质与概率详情"
                                            aria-expanded={showQualityInfo}
                                            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition-all cursor-pointer border shadow-2xs ${
                                                showQualityInfo
                                                    ? 'bg-lime-600 text-white border-lime-600 ring-2 ring-lime-500/30 shadow-xs'
                                                    : 'bg-white text-lime-800 border-lime-300 hover:bg-lime-50 hover:border-lime-400 hover:text-lime-900 active:scale-95'
                                            }`}
                                        >
                                            <Info className={`h-3 w-3 shrink-0 ${showQualityInfo ? 'text-white' : 'text-lime-600'}`} />
                                            <span>{showQualityInfo ? '收起品质' : '品质详情'}</span>
                                        </button>
                                    )}
                                    <span
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${
                                            plot.crop
                                                ? plot.crop.rules.growthSeconds <= plot.crop.grown
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : 'bg-lime-100 text-lime-800'
                                                : 'bg-slate-100 text-slate-500'
                                        }`}
                                    >
                                        {plot.crop ? (plot.crop.rules.growthSeconds <= plot.crop.grown ? '已成熟' : '生长中') : '待播种'}
                                    </span>
                                </div>
                            </div>

                        <div className="flex items-center gap-2 pt-0.5 text-slate-600">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">
                                {plot.crop
                                    ? remaining(plot.crop.rules.growthSeconds - plot.crop.grown)
                                    : '等待居民自主播种'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-600">
                            <Droplets className="h-3 w-3 text-blue-400 shrink-0" />
                            <span className="truncate">
                                {plot.wet ??
                                (plot.wateredUntil > at || farm.weather === 'rain')
                                    ? '土壤湿润（水分充足）'
                                    : '土壤干燥（缺水暂停生长）'}
                            </span>
                        </div>
                    </div>
                ) : animal ? (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 font-bold text-slate-900 truncate">
                                <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 shrink-0" />
                                <span className="truncate">{animalNames[animal.kind]}</span>
                            </span>
                            <span className="font-mono text-xs text-rose-500 font-bold shrink-0">
                                {animal.halfHearts / 2} / 5 心
                            </span>
                        </div>

                        <div className="flex items-center gap-2 pt-0.5 text-slate-600">
                            <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                            <span className="truncate">
                                {animal.cycle.result ? (
                                    <span className="font-semibold text-amber-700">
                                        待收取：
                                        {animal.cycle.result.quality === 'gold' ? '金色 ' : '普通 '}
                                        {animal.cycle.rules.product} × {animal.cycle.result.quantity}
                                    </span>
                                ) : (
                                    remaining(
                                        animal.cycle.rules.periodSeconds - animal.cycle.grown
                                    )
                                )}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">
                                {animal.fedUntil > at
                                    ? '饲料充足（生产正常）'
                                    : '等待喂养，生产暂停'}
                            </span>
                        </div>
                    </div>
                ) : selection?.kind === 'building' ? (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                                {selection.id === 'coop' ? (
                                    <Home className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                ) : (
                                    <Warehouse className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                )}
                                <span className="truncate">
                                    {selection.id === 'coop' ? '鸡舍 (家禽舍)' : '牛羊舍 (牲畜棚)'}
                                </span>
                            </span>
                            <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${
                                    building
                                        ? 'bg-lime-100 text-lime-800'
                                        : 'bg-slate-100 text-slate-500'
                                }`}
                            >
                                {building ? `Lv.${building.level} 建筑` : '尚未建造'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 pt-0.5 text-slate-600">
                            <Info className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">
                                {building
                                    ? `容纳上限：可饲养 ${building.capacity} 只${selection.id === 'coop' ? '母鸡' : '牲畜'}`
                                    : '尚未动工建设，暂无法饲养动物'}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-slate-600">
                            <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                            <span className="truncate">
                                {building
                                    ? `当前养殖：共 ${buildingAnimals.length} / ${building.capacity} 只`
                                    : '可在农场配置或自动规划中建设'}
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-bold text-slate-900">
                                <Sparkles className="h-3.5 w-3.5 text-lime-600 shrink-0" />
                                <span>农场观察哨</span>
                            </span>
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-lime-100 text-lime-800">
                                实时聚焦
                            </span>
                        </div>
                        <div className="flex items-center gap-2 pt-0.5 text-slate-600">
                            <Eye className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">点击画布或下方卡片查看地块、动物与建筑</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600">
                            <Sprout className="h-3 w-3 text-lime-600 shrink-0" />
                            <span className="truncate">居民将依据当前环境自主耕作、照料与收获</span>
                        </div>
                    </div>
                )}
                </div>

                {/* 作物品质与概率详情浮层（点击 i 展开，绝对定位杜绝下方地块列表产生任何位移） */}
                {hasQualityInfo && showQualityInfo && plot?.crop && (
                    <div
                        ref={popoverRef}
                        role="dialog"
                        aria-label="作物品质与概率详情"
                        className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl border border-lime-200/90 bg-white/95 p-3 text-xs text-slate-700 shadow-xl backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150 select-none"
                    >
                        <div className="flex items-center justify-between pb-1.5 border-b border-lime-100 font-bold text-slate-800">
                            <span className="flex items-center gap-1.5 text-lime-800">
                                <Sparkles className="h-3.5 w-3.5 text-lime-600 shrink-0" />
                                作物品质与概率详情
                            </span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowQualityInfo(false);
                                }}
                                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors cursor-pointer"
                                aria-label="关闭详情"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        <div className="mt-2 text-slate-600 text-[11px] leading-relaxed">
                            <p>
                                播种等级 Lv.{plot.crop.plantingLevel} · {plot.crop.fertilizer?.name || '未施肥'} · 整轮自动保湿
                            </p>
                        </div>

                        {plot.crop.result ? (
                            <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1.5 border border-amber-200/70 text-xs font-semibold text-amber-800">
                                <span>收获评估</span>
                                <span>★{plot.crop.result.stars} · {plot.crop.result.eventName}</span>
                            </div>
                        ) : (
                            <div className="mt-2 pt-1.5 border-t border-slate-100 text-[11px] text-slate-600">
                                <span className="text-slate-400 block mb-1">星级产出预估：</span>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono">
                                    {plot.crop.starProbabilities?.map((p, i) => (
                                        <span
                                            key={i}
                                            className={i >= 2 && p > 0 ? 'text-amber-700 font-bold' : 'text-slate-600'}
                                        >
                                            {i + 1}星 {(p * 100).toFixed(1)}%
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 耕地地块快速点选 */}
            <div>
                <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">
                        耕地状态 ({farm.state.plots.length} / 16)
                    </span>
                    <span className="text-[10px] text-slate-400">点击切换聚焦</span>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                    {farm.state.plots.map((p) => {
                        const isSelected = selection?.kind === 'plot' && selection.id === p.id;
                        const isMature =
                            p.crop && p.crop.rules.growthSeconds <= p.crop.grown;

                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => onSelect({kind: 'plot', id: p.id})}
                                className={`rounded-lg border p-1.5 text-center text-xs transition-all ${
                                    isSelected
                                        ? 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20 shadow-2xs'
                                        : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                                }`}
                            >
                                <span className="font-mono font-bold text-[11px] block">
                                    田 #{Number(p.id) + 1}
                                </span>
                                <span
                                    className={`mt-0.5 block truncate text-[10px] ${
                                        isMature
                                            ? 'font-bold text-amber-600'
                                            : p.crop
                                              ? 'text-lime-700 font-medium'
                                              : 'text-slate-400'
                                    }`}
                                >
                                    {p.crop?.rules.name || '空闲'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* 牧场与建筑 */}
            <div>
                <span className="font-bold text-xs text-slate-700 block">
                    牧场动物与建筑
                </span>

                <div className="mt-1.5 space-y-1.5">
                    {/* 建筑按钮 */}
                    <div className="grid grid-cols-2 gap-2">
                        {(['coop', 'barn'] as const).map((kind) => {
                            const isSelected =
                                selection?.kind === 'building' && selection.id === kind;
                            const b = farm.state.buildings[kind];

                            return (
                                <button
                                    key={kind}
                                    type="button"
                                    onClick={() => onSelect({kind: 'building', id: kind})}
                                    className={`rounded-lg border p-2 text-left text-xs transition-all ${
                                        isSelected
                                            ? 'border-orange-500 bg-orange-50 text-orange-800 ring-2 ring-orange-500/20'
                                            : 'border-slate-200/90 bg-white hover:bg-slate-50 text-slate-700'
                                    }`}
                                >
                                    <div className="font-bold">
                                        {kind === 'coop' ? '鸡舍' : '牛羊舍'}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-slate-400">
                                        {b?.level ? `${b.level} 级 (${b.capacity}只)` : '未建造'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* 动物列表 */}
                    {farm.state.animals.length > 0 && (
                        <div className="space-y-1 pt-1">
                            {farm.state.animals.map((a, i) => (
                                <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => onSelect({kind: 'animal', id: a.id})}
                                    className="flex w-full items-center justify-between rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    <span className="font-medium">
                                        {animalNames[a.kind]} #{i + 1}
                                    </span>
                                    <span className="text-rose-500 text-[11px] font-mono">
                                        {'♥'.repeat(Math.floor(a.halfHearts / 2))}
                                        {a.halfHearts % 2 ? '½' : ''}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
