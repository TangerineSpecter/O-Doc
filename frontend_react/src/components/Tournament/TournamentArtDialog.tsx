import {useRef, useState} from 'react';
import {
    AlertCircle,
    Check,
    CheckCircle2,
    Crown,
    ExternalLink,
    Flame,
    ImagePlus,
    Info,
    LoaderCircle,
    Sparkles,
    Swords,
    Upload,
    Wand2,
    X,
} from 'lucide-react';
import {Select} from '@/components/common/Select';
import WorldDialog from '@/components/AgentWorld/WorldDialog';
import {usePortraitImage} from '@/components/Combat/useLoadoutPortrait';
import {usePortraitReference} from '@/components/Combat/usePortraitReference';
import {usePortraitUpload} from '@/components/Combat/usePortraitUpload';
import {collectDroppedFiles} from '@/utils/imageUpload';
import type {TournamentDetail} from '@/types/api/tournament';
import {TournamentAvatar} from './TournamentAvatar';
import {useTournamentArt} from './useTournamentArt';

const QUICK_PROMPT_TAGS = [
    '史诗决战氛围',
    '刀光剑影',
    '雷霆剑气',
    '火花四溅',
    '擂台全场欢呼',
    '终结一击',
    '黄昏夕阳',
    '特写慢动作',
];

export function TournamentArtDialog({event, onClose}: {event: TournamentDetail; onClose: () => void}) {
    const [activeTab, setActiveTab] = useState<'generate' | 'upload'>('generate');
    const [model, setModel] = useState('');
    const [moment, setMoment] = useState('');
    const [extra, setExtra] = useState('');
    const [preview, setPreview] = useState<'saved' | 'generated' | 'uploaded'>('saved');

    // Drag-and-drop state
    const [styleDragging, setStyleDragging] = useState(false);
    const [uploadDragging, setUploadDragging] = useState(false);
    const styleInputRef = useRef<HTMLInputElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const art = useTournamentArt(event.id, model);
    const upload = usePortraitUpload();
    const style = usePortraitReference();

    const generated = art.data?.task?.status === 'succeeded' ? art.data.task : null;
    const names = Object.fromEntries(event.roster.map(row => [row.id, row.name]));

    // Check availability of each image source
    const hasSaved = Boolean(art.data?.assetId);
    const hasGenerated = Boolean(generated?.assetId);
    const hasUploaded = Boolean(upload.uploaded?.assetId);

    // Resolve which preview should be visible
    const resolvedPreview =
        preview === 'uploaded' && hasUploaded
            ? 'uploaded'
            : preview === 'generated' && hasGenerated
            ? 'generated'
            : preview === 'saved' && hasSaved
            ? 'saved'
            : hasGenerated
            ? 'generated'
            : hasUploaded
            ? 'uploaded'
            : hasSaved
            ? 'saved'
            : 'saved';

    const activeAssetId =
        resolvedPreview === 'uploaded'
            ? upload.uploaded?.assetId
            : resolvedPreview === 'generated'
            ? generated?.assetId
            : art.data?.assetId;

    const image = usePortraitImage(activeAssetId);
    const locked = art.busy || art.active || upload.busy || style.busy;

    // Final match participants & podium winners
    const finalMatch = event.rounds.find(row => row.phase === 'final')?.matches.find(row => row.kind === 'main');
    const champId = event.result.podium?.['1'] || finalMatch?.result.winnerId;
    const runnerUpId = event.result.podium?.['2'] || finalMatch?.result.loserId;
    const champ = event.roster.find(r => r.id === champId);
    const runnerUp = event.roster.find(r => r.id === runnerUpId);

    // Moments options & selection
    const moments = art.data?.moments || [];
    const momentOptions = [
        {value: '', label: '✨ 自动选择全场最高伤害瞬间'},
        ...moments.map(item => ({
            value: item.id,
            label: `第 ${item.round} 回合 · ${names[item.actor] || item.actor} → ${names[item.target] || item.target} · ${item.action} (${item.damage} 伤害${item.critical ? ' · 暴击' : ''})`,
        })),
    ];
    const selectedMoment = moments.find(m => m.id === moment);

    // Version choices
    const previewChoices: Array<{source: 'saved' | 'generated' | 'uploaded'; label: string}> = [
        ...(hasSaved ? [{source: 'saved' as const, label: '当前配图'}] : []),
        ...(hasGenerated ? [{source: 'generated' as const, label: 'AI 生成结果'}] : []),
        ...(hasUploaded ? [{source: 'uploaded' as const, label: '本地上传'}] : []),
    ];

    const addQuickTag = (tag: string) => {
        if (extra.includes(tag)) return;
        setExtra(prev => (prev.trim() ? `${prev.trim()}，${tag}` : tag));
    };

    const handleGenerate = async () => {
        if (locked || !art.data?.canGenerate) return;
        setPreview('generated');
        await art.generate(moment, extra.trim(), style.reference?.id);
    };

    const handleApplyGenerated = async () => {
        if (!generated?.taskId || locked) return;
        await art.apply({taskId: generated.taskId});
        setPreview('saved');
    };

    const handleApplyUploaded = async () => {
        if (!upload.uploaded?.assetId || locked) return;
        await art.apply({assetId: upload.uploaded.assetId});
        setPreview('saved');
    };

    const handleLocalUploadFile = async (file: File) => {
        if (locked) return;
        const result = await upload.upload(file);
        if (result) {
            setPreview('uploaded');
            setActiveTab('upload');
        }
    };

    const errorMessage = art.error || upload.error || style.error || image.error;

    return (
        <WorldDialog
            title="决战纪念图"
            description={event.week ? `${event.week} · 用决赛战报记录擂台巅峰对决` : '用决赛战报记录擂台上的一刻'}
            size="wide"
            onClose={onClose}
        >
            <div className="grid gap-5 p-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
                {/* 左栏：16:9 纪念图展台与效果预览 */}
                <div className="flex min-w-0 flex-col gap-3">
                    {/* 展台工具栏 */}
                    {/* 展台工具栏 */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                            <span>擂台名画展台 (16:9)</span>
                        </div>

                        {previewChoices.length > 1 && (
                            <div
                                role="group"
                                aria-label="预览配图版本"
                                className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-medium"
                            >
                                {previewChoices.map(choice => {
                                    const active = resolvedPreview === choice.source;
                                    return (
                                        <button
                                            key={choice.source}
                                            type="button"
                                            aria-pressed={active}
                                            onClick={() => setPreview(choice.source)}
                                            className={`rounded-lg px-2.5 py-1 transition-all ${
                                                active
                                                    ? 'bg-white text-orange-600 shadow-xs'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            {choice.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* 16:9 画卷展台（明亮清爽白底与暖橙微调） */}
                    <div className="relative flex aspect-[16/9] w-full select-none items-center justify-center overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/80 via-white to-orange-50/20 text-slate-800 shadow-xs">
                        {/* 4 角金橙几何包角装饰 */}
                        <div className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 rounded-tl-sm border-l-2 border-t-2 border-orange-300/70" />
                        <div className="pointer-events-none absolute right-3 top-3 h-3.5 w-3.5 rounded-tr-sm border-r-2 border-t-2 border-orange-300/70" />
                        <div className="pointer-events-none absolute bottom-3 left-3 h-3.5 w-3.5 rounded-bl-sm border-b-2 border-l-2 border-orange-300/70" />
                        <div className="pointer-events-none absolute bottom-3 right-3 h-3.5 w-3.5 rounded-br-sm border-b-2 border-r-2 border-orange-300/70" />

                        {art.active ? (
                            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                                <div className="relative">
                                    <div className="h-12 w-12 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin" />
                                    <Wand2 className="absolute inset-0 m-auto h-5 w-5 text-orange-500 animate-pulse" />
                                </div>
                                <div>
                                    <p className="font-semibold text-sm text-slate-800">AI 正在绘制决战纪念图…</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {art.data?.task?.message || '正在根据战报精彩回合还原擂台对决，请稍候'}
                                    </p>
                                </div>
                            </div>
                        ) : image.url ? (
                            <>
                                <img
                                    src={image.url}
                                    alt="决战纪念图预览"
                                    className="h-full w-full object-contain"
                                />
                                {/* 状态标记 */}
                                <div className="absolute left-3 bottom-3 flex items-center gap-1.5">
                                    <span className="rounded-lg bg-white/95 backdrop-blur-sm border border-slate-200/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-700 shadow-xs">
                                        {resolvedPreview === 'saved'
                                            ? '当前已应用配图'
                                            : resolvedPreview === 'generated'
                                            ? 'AI 绘制效果'
                                            : '本地上传图片'}
                                    </span>
                                </div>
                                <div className="absolute right-3 top-3">
                                    <a
                                        href={image.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1 rounded-lg bg-white/95 backdrop-blur-sm border border-slate-200/90 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-orange-600 hover:border-orange-300 transition-colors shadow-xs"
                                        title="在新窗口查看大图"
                                    >
                                        <ExternalLink className="h-3 w-3" />
                                        <span>原图</span>
                                    </a>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 border border-orange-200/80 shadow-2xs">
                                    <Swords className="h-7 w-7" />
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-slate-800">暂无决战配图</p>
                                    <p className="mt-1 text-xs text-slate-500 max-w-xs">
                                        选择右侧战报的高光瞬间由 AI 灵感绘制，或直接上传自定义图片
                                    </p>
                                </div>
                                <div className="mt-1 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('generate')}
                                        className="rounded-xl border border-orange-200 bg-orange-50/90 px-3.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 transition-colors shadow-2xs flex items-center gap-1.5"
                                    >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        AI 战报生图
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('upload')}
                                        className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs flex items-center gap-1.5"
                                    >
                                        <Upload className="h-3.5 w-3.5" />
                                        本地上传
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 底部操作与生效状态 */}
                    {resolvedPreview === 'generated' && generated?.taskId && (
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-3">
                            <div className="min-w-0">
                                <p className="font-semibold text-xs text-orange-950 flex items-center gap-1">
                                    <Sparkles className="h-3.5 w-3.5 text-orange-600" />
                                    已生成新配图预览
                                </p>
                                <p className="text-[11px] text-orange-800/80 mt-0.5">确认满意后，可点击应用为本届武道大会纪念图</p>
                            </div>
                            <button
                                type="button"
                                disabled={locked}
                                onClick={() => void handleApplyGenerated()}
                                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
                            >
                                <Check className="h-3.5 w-3.5" />
                                应用此生成图
                            </button>
                        </div>
                    )}

                    {resolvedPreview === 'uploaded' && upload.uploaded && (
                        <div className="flex items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-3">
                            <div className="min-w-0">
                                <p className="font-semibold text-xs text-orange-950 flex items-center gap-1">
                                    <Upload className="h-3.5 w-3.5 text-orange-600" />
                                    已上传本地新图
                                </p>
                                <p className="text-[11px] text-orange-800/80 mt-0.5">确认满意后，可点击应用为本届武道大会纪念图</p>
                            </div>
                            <button
                                type="button"
                                disabled={locked}
                                onClick={() => void handleApplyUploaded()}
                                className="shrink-0 flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all disabled:opacity-50"
                            >
                                <Check className="h-3.5 w-3.5" />
                                应用此上传图
                            </button>
                        </div>
                    )}

                    {resolvedPreview === 'saved' && hasSaved && (
                        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-800">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <div className="min-w-0">
                                <p className="font-semibold">当前已是生效的决战纪念图</p>
                                <p className="text-[11px] text-emerald-700/80 mt-0.5">已作为本届赛事的正式画卷在武道大会主面板中呈现</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 右栏：双模式配置工作台 */}
                <div className="flex min-w-0 flex-col gap-3.5">
                    {/* 胶囊分段控制器：AI 绘制 vs 自定义上传 */}
                    <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setActiveTab('generate')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
                                activeTab === 'generate'
                                    ? 'bg-white text-orange-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            <span>✨ AI 战报生图</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('upload')}
                            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
                                activeTab === 'upload'
                                    ? 'bg-white text-orange-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Upload className="h-3.5 w-3.5 shrink-0" />
                            <span>📤 自定义上传</span>
                            {upload.uploaded && <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />}
                        </button>
                    </div>

                    {/* Tab 1: AI 战报生图 */}
                    {activeTab === 'generate' && (
                        <div className="flex flex-col gap-3.5">
                            {/* 决赛巅峰对阵微卡片 */}
                            {(champ || runnerUp) && (
                                <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-gradient-to-r from-amber-50/50 via-white to-blue-50/50 p-2.5 text-xs">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {champ && <TournamentAvatar name={champ.name} avatar={champ.avatar} place={1} size="sm" />}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1">
                                                <span className="font-bold text-slate-800 truncate">{champ?.name || '冠军选手'}</span>
                                                <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800 flex items-center gap-0.5">
                                                    <Crown className="h-2.5 w-2.5 text-amber-600" />
                                                    冠军
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 text-slate-400 font-bold px-2">
                                        <Swords className="h-3.5 w-3.5 text-orange-500" />
                                        <span className="text-[10px] font-mono tracking-wider text-slate-500">VS</span>
                                    </div>
                                    <div className="flex items-center gap-2 min-w-0 justify-end">
                                        <div className="min-w-0 text-right">
                                            <div className="flex items-center gap-1 justify-end">
                                                <span className="rounded bg-blue-100 px-1 py-0.2 text-[9px] font-bold text-blue-800">亚军</span>
                                                <span className="font-bold text-slate-800 truncate">{runnerUp?.name || '亚军选手'}</span>
                                            </div>
                                        </div>
                                        {runnerUp && <TournamentAvatar name={runnerUp.name} avatar={runnerUp.avatar} place={2} size="sm" />}
                                    </div>
                                </div>
                            )}

                            {/* 生图模型选择 */}
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-slate-700">生图模型</label>
                                <Select
                                    value={model || art.data?.options.modelId || ''}
                                    options={art.data?.options.models || []}
                                    onChange={setModel}
                                    menuPortal
                                    placeholder="请选择生图模型"
                                />
                            </div>

                            {/* 战斗瞬间选择与高光卡片 */}
                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-700">战斗高光瞬间</label>
                                    {selectedMoment?.critical && (
                                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                                            暴击瞬间
                                        </span>
                                    )}
                                </div>
                                <Select
                                    value={moment}
                                    options={momentOptions}
                                    onChange={setMoment}
                                    menuPortal
                                />
                                {selectedMoment ? (
                                    <div className="mt-2 rounded-xl border border-orange-200/80 bg-orange-50/50 p-2.5 text-xs">
                                        <div className="flex items-center justify-between text-slate-700">
                                            <span className="font-semibold text-slate-900">{names[selectedMoment.actor] || selectedMoment.actor}</span>
                                            <span className="text-slate-400">发动</span>
                                            <span className="font-bold text-orange-700">{selectedMoment.action}</span>
                                            <span className="text-slate-400">击中</span>
                                            <span className="font-semibold text-slate-900">{names[selectedMoment.target] || selectedMoment.target}</span>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                                            <span>第 {selectedMoment.round} 回合</span>
                                            <span className="font-bold text-red-600 flex items-center gap-0.5">
                                                <Flame className="h-3 w-3 text-red-500" />
                                                {selectedMoment.damage} 伤害
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
                                        <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                                        <span>自动分析决赛战报，挑选最高单次伤害与最具张力的回合</span>
                                    </div>
                                )}
                            </div>

                            {/* 画风参考图（可选） */}
                            <div>
                                <label className="mb-1.5 block text-xs font-semibold text-slate-700">画风参考图（可选）</label>
                                <input
                                    ref={styleInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    disabled={locked}
                                    className="hidden"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) void style.upload(file);
                                        e.currentTarget.value = '';
                                    }}
                                />
                                {style.reference ? (
                                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <img
                                                src={style.reference.url}
                                                alt="参考图预览"
                                                className="h-9 w-9 rounded-lg object-cover border border-slate-200 shrink-0"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-slate-800 text-xs">{style.reference.name}</p>
                                                <p className="text-[10px] text-slate-400">已设定为画风参考依据</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={locked}
                                            onClick={style.clear}
                                            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                            title="移除参考图"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => styleInputRef.current?.click()}
                                        onDragOver={e => {e.preventDefault(); setStyleDragging(true);}}
                                        onDragLeave={() => setStyleDragging(false)}
                                        onDrop={e => {
                                            e.preventDefault();
                                            setStyleDragging(false);
                                            if (locked) return;
                                            const file = collectDroppedFiles(e.dataTransfer)[0];
                                            if (file) void style.upload(file);
                                        }}
                                        className={`group flex items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 px-3 text-xs transition-all cursor-pointer ${
                                            styleDragging
                                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                                : 'border-slate-300 bg-slate-50/70 text-slate-600 hover:border-orange-400 hover:bg-orange-50/20'
                                        }`}
                                    >
                                        <ImagePlus className="h-4 w-4 text-slate-400 group-hover:text-orange-500 shrink-0" />
                                        <span>点击或拖拽上传参考图 (PNG / JPG / WebP)</span>
                                    </div>
                                )}
                            </div>

                            {/* 补充画面要求与灵感快捷标签 */}
                            <div>
                                <div className="mb-1.5 flex items-center justify-between">
                                    <label className="text-xs font-semibold text-slate-700">补充画面要求（可选）</label>
                                    <span className="text-[10px] text-slate-400">{extra.length} / 1000</span>
                                </div>
                                <textarea
                                    value={extra}
                                    onChange={e => setExtra(e.target.value)}
                                    maxLength={1000}
                                    rows={3}
                                    placeholder="描述场景细节氛围，例如：雷霆剑气环绕、火花与烟尘激荡、擂台下观众欢呼..."
                                    className="w-full resize-none rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                                />
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {QUICK_PROMPT_TAGS.map(tag => (
                                        <button
                                            key={tag}
                                            type="button"
                                            disabled={locked}
                                            onClick={() => addQuickTag(tag)}
                                            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 active:scale-95 disabled:opacity-50"
                                        >
                                            + {tag}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 规范提示 */}
                            <div className="flex items-start gap-2 rounded-xl border border-orange-100 bg-orange-50/60 p-2.5 text-xs leading-5 text-orange-950">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-600" />
                                <span>画面基于比赛真实职业、武器与行动。人物参考使用当前全身立绘，历史外貌可能已变化。</span>
                            </div>

                            {!art.data?.canGenerate && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                    本届没有可用的决赛战报，无法由战报生成，请切换至右侧「自定义上传」直接添加图片。
                                </div>
                            )}

                            {art.data?.options.message && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                    {art.data.options.message}
                                </div>
                            )}

                            {art.data?.task?.status === 'submission_unknown' && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                                    <p>服务商可能已经收到生图请求。若长时间未响应，可放弃等待后重新提交。</p>
                                    <button
                                        type="button"
                                        disabled={locked}
                                        onClick={() => void art.release()}
                                        className="mt-2 font-semibold text-orange-700 underline"
                                    >
                                        放弃本次等待
                                    </button>
                                </div>
                            )}

                            {/* 生成按钮 */}
                            <button
                                type="button"
                                disabled={
                                    locked ||
                                    art.data?.task?.status === 'submission_unknown' ||
                                    !art.data?.canGenerate ||
                                    !art.data?.options.supportsReferenceImages
                                }
                                onClick={() => void handleGenerate()}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 active:scale-[0.99] text-white font-semibold py-2.5 text-sm shadow-sm shadow-orange-500/25 transition-all disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {art.active ? (
                                    <>
                                        <LoaderCircle className="h-4 w-4 animate-spin" />
                                        <span>AI 正在绘制决战图…</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        <span>生成决战纪念图</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Tab 2: 自定义上传 */}
                    {activeTab === 'upload' && (
                        <div className="flex flex-col gap-3.5">
                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                disabled={locked}
                                className="hidden"
                                onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) void handleLocalUploadFile(file);
                                    e.currentTarget.value = '';
                                }}
                            />

                            {upload.uploaded ? (
                                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
                                            <CheckCircle2 className="h-6 w-6" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-900 text-sm truncate">{upload.uploaded.name}</span>
                                                <span className="rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-semibold text-lime-800 shrink-0">已就绪</span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5">图片已就绪，可在左侧预览效果并点击应用</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            type="button"
                                            disabled={locked}
                                            onClick={() => uploadInputRef.current?.click()}
                                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            更换图片
                                        </button>
                                        <button
                                            type="button"
                                            disabled={locked}
                                            onClick={upload.clear}
                                            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            移除
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={locked}
                                        onClick={() => void handleApplyUploaded()}
                                        className="w-full mt-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold py-2.5 text-sm shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                                    >
                                        <Check className="h-4 w-4" />
                                        应用此图片为决战纪念图
                                    </button>
                                </div>
                            ) : (
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => uploadInputRef.current?.click()}
                                    onDragOver={e => {e.preventDefault(); setUploadDragging(true);}}
                                    onDragLeave={() => setUploadDragging(false)}
                                    onDrop={e => {
                                        e.preventDefault();
                                        setUploadDragging(false);
                                        if (locked) return;
                                        const file = collectDroppedFiles(e.dataTransfer)[0];
                                        if (file) void handleLocalUploadFile(file);
                                    }}
                                    className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                                        uploadDragging
                                            ? 'border-orange-500 bg-orange-50 text-orange-950'
                                            : 'border-slate-300 bg-slate-50/50 hover:border-orange-400 hover:bg-orange-50/20'
                                    }`}
                                >
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-600 mb-3 shadow-xs">
                                        <Upload className="h-6 w-6" />
                                    </div>
                                    <p className="font-semibold text-slate-800 text-sm">点击选择图片 或 拖拽至此处</p>
                                    <p className="text-xs text-slate-400 mt-1">支持 PNG、JPEG、WebP 格式（最大 20MB）</p>
                                    <div className="mt-3 inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 border border-orange-200/60">
                                        <span>推荐画幅：16 : 9 横屏比例（如 1920×1080）</span>
                                    </div>
                                </div>
                            )}

                            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs leading-5 text-slate-500">
                                上传的图片将作为本届赛事的最终决战纪念图永久保存，并展示在赛事主面板中。
                            </div>
                        </div>
                    )}

                    {/* 错误提示横幅 */}
                    {errorMessage && (
                        <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                            <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                            <div className="min-w-0">
                                <p className="font-semibold">操作遇到问题</p>
                                <p className="mt-0.5">{errorMessage}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </WorldDialog>
    );
}
