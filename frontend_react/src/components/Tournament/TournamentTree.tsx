import {useEffect, useRef, useState} from 'react';
import {Bot, Crown, Eye, Maximize2, Minimize2, Swords, Target, Trophy} from 'lucide-react';
import type {TournamentDetail} from '../../types/api/tournament';
import {layoutTournamentTree} from './tournamentTreeLayout';
import {TournamentTrophy} from './TournamentTrophy';
import {Select} from '../common/Select';
import './tournamentTree.css';

function ContenderAvatar({
    avatar,
    name,
    isWinner,
    isBye,
}: {
    avatar?: string;
    name: string;
    isWinner: boolean;
    isBye: boolean;
}) {
    const [imgFailed, setImgFailed] = useState(false);
    if (isBye) {
        return <span className="tournament-avatar font-mono text-[10px] text-slate-400">—</span>;
    }
    const isImage = Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));
    const showImage = isImage && !imgFailed;

    return (
        <span className="tournament-avatar" aria-hidden="true">
            {showImage ? (
                <img
                    src={avatar}
                    alt={name}
                    onError={() => setImgFailed(true)}
                    className="h-full w-full object-cover"
                />
            ) : avatar && !isImage ? (
                <span className="text-[10px] leading-none">{avatar}</span>
            ) : (
                <Bot className={`h-2.5 w-2.5 ${isWinner ? 'text-white' : 'text-slate-400'}`} />
            )}
        </span>
    );
}

export function TournamentTree({
    event,
    onMatch,
    residents,
    backgroundImage,
    onPreview,
}: {
    backgroundImage?: string;
    onPreview?: () => void;
    event: TournamentDetail;
    onMatch: (id: string) => void;
    residents?: {id: string; name: string; avatar?: string}[];
}) {
    const [all, setAll] = useState(false);
    const [active, setActive] = useState<string | null>(null);
    const [fitMode, setFitMode] = useState<'fit' | 'expanded'>('fit');
    const [containerWidth, setContainerWidth] = useState<number>(1140);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 监听外层容器真实宽度，驱动自适应无滚动排版
    useEffect(() => {
        if (!scrollRef.current) return;
        const el = scrollRef.current;
        const handleResize = () => {
            const measured = el.clientWidth - 28;
            if (measured > 0) {
                setContainerWidth(measured);
            }
        };
        handleResize();
        const observer = new ResizeObserver(handleResize);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const rounds = event.rounds.filter(r => r.phase !== 'preliminary' && (all || r.entrantCount <= 32));
    const {
        nodes,
        edges,
        width,
        height,
        cardWidth,
        marginX,
        stepX,
        finalWidth,
        isFit,
    } = layoutTournamentTree(rounds, {
        targetWidth: containerWidth,
        fitMode,
    });

    const names = Object.fromEntries([
        ...(residents || []).map(r => [r.id, r.name] as const),
        ...event.roster.map(r => [r.id, r.name] as const),
    ]);
    const avatars = Object.fromEntries([
        ...(residents || []).map(r => [r.id, r.avatar || ''] as const),
        ...event.roster.map(r => [r.id, r.avatar || ''] as const),
    ]);
    const champion = event.result?.podium?.['1'];
    const final = nodes.find(n => n.side === 'center');
    const hasEarlier = event.rounds.some(r => r.phase !== 'preliminary' && r.entrantCount > 32);

    // 大图模式下自动平滑对齐到中央决战擂台
    useEffect(() => {
        if (!isFit && scrollRef.current) {
            const container = scrollRef.current;
            container.scrollLeft = Math.max(0, (width - container.clientWidth) / 2);
        }
    }, [isFit, width]);

    const handleCenterView = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                left: Math.max(0, (width - scrollRef.current.clientWidth) / 2),
                behavior: 'smooth',
            });
        }
    };

    const rosterOptions = [
        {value: '', label: '追踪选手全路径…'},
        ...event.roster.map(r => {
            const av = avatars[r.id];
            const isImage = Boolean(av && /^(https?:|data:|\/)/.test(av));
            return {
                value: r.id,
                label: r.name,
                icon: champion === r.id ? (
                    <Crown className="h-3 w-3 text-amber-500 fill-amber-400" />
                ) : av ? (
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center overflow-hidden rounded-[3px] border border-slate-200">
                        {isImage ? (
                            <img src={av} alt="" className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-[9px] leading-none">{av}</span>
                        )}
                    </span>
                ) : undefined,
            };
        }),
    ];

    return (
        <section className="tournament-arena" aria-label="武道大会晋级对阵图">
            <header className="tournament-arena-header">
                <div className="tournament-arena-title-row">
                    <div className="tournament-arena-title-icon">
                        <Trophy size={18} />
                    </div>
                    <div>
                        <h3>晋级之路</h3>
                        <p className="tournament-subtitle">
                            {all ? '全部正赛对决' : '后段正赛淘汰树'} · {rounds.length} 个赛段 · {isFit ? '整屏一览模式' : '大图展开模式'}
                        </p>
                    </div>
                </div>

                <div className="tournament-arena-actions">
                    <div className="hidden sm:block">
                        <Select
                            value={active || ''}
                            options={rosterOptions}
                            onChange={(val) => setActive(val || null)}
                            placeholder="追踪选手全路径…"
                            menuPortal={true}
                            buttonClassName="!py-1.5 !px-3 !text-xs !rounded-lg !border-slate-200 !bg-white hover:!border-orange-300"
                        />
                    </div>

                    {onPreview && <button type="button" onClick={onPreview} className="tournament-action-btn"><Eye size={13}/><span>查看决赛图</span></button>}

                    {/* 一屏全览（无横向滚动）与大图模式切换 */}
                    <button
                        type="button"
                        onClick={() => setFitMode(fitMode === 'fit' ? 'expanded' : 'fit')}
                        className={`tournament-action-btn ${fitMode === 'fit' ? 'is-active' : ''}`}
                        title={fitMode === 'fit' ? '当前自动适配，空间不足时可横向滚动；点击切换为固定大图' : '切换为自动适配，空间充足时整屏显示'}
                    >
                        {fitMode === 'fit' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                        <span>{fitMode === 'fit' ? '自动适配' : '大图滚动'}</span>
                    </button>

                    {!isFit && (
                        <button
                            type="button"
                            onClick={handleCenterView}
                            className="tournament-action-btn"
                            title="视野快速居中至决战擂台"
                        >
                            <Target size={13} className="text-orange-600" />
                            <span className="hidden md:inline">居中决战</span>
                        </button>
                    )}

                    {hasEarlier && (
                        <button
                            type="button"
                            onClick={() => setAll(!all)}
                            className={`tournament-action-btn ${all ? 'is-active' : ''}`}
                        >
                            {all ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                            {all ? '聚焦 32 强' : '展开全部对阵'}
                        </button>
                    )}

                    <span className={`tournament-status-badge ${event.status !== 'completed' ? 'is-live' : ''}`}>
                        <span className="tournament-live-dot" />
                        {event.status === 'completed' ? '已圆满落幕' : '比赛进行中'}
                    </span>
                </div>
            </header>

            <div ref={scrollRef} className={`tournament-tree-scroll ${isFit ? 'is-fit' : ''} scrollbar-hide`}>
                <div className="tournament-tree-canvas" style={{width, height}} aria-label="晋级淘汰赛树">
                    {backgroundImage && <img src={backgroundImage} alt="" aria-hidden="true" className="tournament-tree-background"/>}
                    {/* SVG 平滑贝塞尔连线 */}
                    <svg width={width} height={height} className="tournament-tree-lines" aria-hidden="true">
                        <defs>
                            <linearGradient id="winner-gold" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#f59e0b" />
                                <stop offset="100%" stopColor="#ea580c" />
                            </linearGradient>
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="2.5" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {edges.map(({source, target, actorId}) => {
                            const right = source.side === 'right';
                            const srcWidth = source.side === 'center' ? finalWidth : cardWidth;
                            const targetWidth = target.side === 'center' ? finalWidth : cardWidth;

                            const x1 = source.x + (right ? 0 : srcWidth);
                            const y1 = source.y + 30;
                            const x2 = target.x + (right ? targetWidth : 0);
                            const y2 = target.y + 30;

                            const dx = Math.abs(x2 - x1);
                            const cx1 = right ? x1 - dx * 0.5 : x1 + dx * 0.5;
                            const cx2 = right ? x2 + dx * 0.5 : x2 - dx * 0.5;
                            const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;

                            const isActorWinner = source.match.result?.winnerId === actorId;
                            const isHighlighted = active ? active === actorId : champion === actorId;

                            return (
                                <g key={`${source.match.id}->${target.match.id}`}>
                                    <path d={d} className="tournament-connector-bg" />
                                    {isActorWinner && (
                                        <path
                                            d={d}
                                            className={`tournament-connector-winner ${isHighlighted ? 'tournament-connector-highlight' : ''}`}
                                        />
                                    )}
                                </g>
                            );
                        })}

                        {/* 从决赛卡片胜者通往冠军金杯底座的荣耀光弧 */}
                        {champion && final && (
                            <path
                                d={`M ${width / 2} ${final.y} C ${width / 2} ${final.y - 35}, ${width / 2} ${height / 2 - 40}, ${width / 2} ${height / 2 - 58}`}
                                className="tournament-connector-highlight"
                                strokeDasharray="3 3"
                            />
                        )}
                    </svg>

                    {/* 轮次里程碑徽章 */}
                    {rounds.map((round, index) => {
                        if (round.phase === 'final') return null;
                        const offset = marginX + index * stepX;
                        const title = round.entrantCount === 4 ? '半决赛' : `${round.entrantCount} 强赛`;

                        return [false, true].map(right => {
                            const centerX = right ? width - offset - cardWidth / 2 : offset + cardWidth / 2;
                            return (
                                <div
                                    key={`${round.id}-${right ? 'r' : 'l'}`}
                                    className="tournament-round-heading"
                                    style={{left: centerX}}
                                >
                                    <div className="tournament-round-pill">
                                        <span className="tournament-round-pill-number">R{round.number}</span>
                                        <span className="tournament-round-pill-name">{title}</span>
                                    </div>
                                    <div className="tournament-round-guide-dot" />
                                </div>
                            );
                        });
                    })}

                    {/* 中央冠军加冕殿堂 */}
                    <div
                        style={{top: height / 2 - 188}}
                        className="tournament-champion"
                        onClick={() => champion && setActive(active === champion ? null : champion)}
                        onMouseEnter={() => champion && setActive(champion)}
                        onMouseLeave={() => setActive(null)}
                        role="button"
                        tabIndex={0}
                        aria-label={`本届冠军：${champion ? names[champion] || champion : '静候加冕'}`}
                    >
                        <div className="tournament-champion-halo" />
                        <span className="tournament-champion-tag">
                            <Trophy size={11} className="text-amber-600" />
                            {champion ? '本届武道魁首' : '决胜巅峰席位'}
                        </span>
                        <TournamentTrophy />
                        <strong className="tournament-champion-name" title={champion ? names[champion] || champion : ''}>
                            {champion ? names[champion] || champion : '静候加冕'}
                        </strong>
                        <span className="tournament-champion-subtitle">
                            {champion ? '傲视群雄 · 金榜题名' : '双雄决战 · 蓄势待发'}
                        </span>
                    </div>

                    {/* 决赛卡片顶部标语 */}
                    {final && (
                        <div style={{top: final.y - 26}} className="tournament-final-label">
                            <span>⚡ 巅峰决战 · 2 强</span>
                        </div>
                    )}

                    {/* 所有对阵节点 */}
                    {nodes.map(({match, x, y, side}) => {
                        const isFinal = side === 'center';
                        const currentCardWidth = isFinal ? finalWidth : cardWidth;
                        const hasParticipants = Boolean(match.leftId && match.rightId);
                        const canViewReport = match.status === 'done' && hasParticipants;

                        return (
                            <div
                                key={match.id}
                                className="tournament-node"
                                style={{left: x, top: y, width: currentCardWidth}}
                            >
                                <button
                                    type="button"
                                    disabled={!canViewReport}
                                    onClick={() => onMatch(match.id)}
                                    onFocus={() => setActive(match.result?.winnerId || match.leftId)}
                                    onBlur={() => setActive(null)}
                                    aria-label={`${names[match.leftId] || match.leftId} 对 ${match.rightId ? names[match.rightId] || match.rightId : '轮空'}${!match.rightId ? '，轮空晋级' : canViewReport ? '，点击查看战报' : '，等待对决'}`}
                                    className={`tournament-duel ${isFinal ? 'is-final' : ''}`}
                                    title={canViewReport ? '点击查看本场对决战报' : undefined}
                                >
                                    {[match.leftId, match.rightId].map((id, i) => {
                                        const isWinner = Boolean(id && match.result?.winnerId === id);
                                        const isLoser = Boolean(id && match.status === 'done' && match.result?.loserId === id);
                                        const isBye = !id;
                                        const isTracked = Boolean(active && id && id === active);
                                        const nameStr = id ? names[id] || id : '轮空';
                                        const avatarUrl = id ? avatars[id] : undefined;

                                        return (
                                            <span
                                                key={i}
                                                onMouseEnter={() => id && setActive(id)}
                                                onMouseLeave={() => setActive(null)}
                                                className={`tournament-contender ${isWinner ? 'is-winner' : ''} ${isLoser ? 'is-loser' : ''} ${isBye ? 'is-bye' : ''} ${isTracked ? 'is-active' : ''}`}
                                            >
                                                <ContenderAvatar
                                                    key={`${id || 'bye'}-${avatarUrl || 'none'}`}
                                                    avatar={avatarUrl}
                                                    name={nameStr}
                                                    isWinner={isWinner}
                                                    isBye={isBye}
                                                />
                                                <span className="tournament-contender-name">{nameStr}</span>
                                                {isWinner ? (
                                                    <Crown size={11} className="shrink-0" />
                                                ) : isBye ? (
                                                    <span className="tournament-bye-tag">免战</span>
                                                ) : (
                                                    <span className="tournament-contender-mark">
                                                        {match.status === 'done' ? '·' : '–'}
                                                    </span>
                                                )}
                                            </span>
                                        );
                                    })}
                                </button>
                            </div>
                        );
                    })}

                    {!nodes.length && (
                        <p className="tournament-empty">该赛段暂未抽签完成，可点击上方展开全部对阵</p>
                    )}
                </div>
            </div>

            <footer className="tournament-arena-footer">
                <div className="tournament-arena-legend">
                    <span className="tournament-legend-item">
                        <span className="tournament-legend-line" />
                        <span>冠军问鼎路径</span>
                    </span>
                    <span className="tournament-legend-item">
                        <Crown size={12} className="text-amber-500 fill-amber-400" />
                        <span>轮次胜出晋级</span>
                    </span>
                    <span className="tournament-legend-item">
                        <Eye size={12} className="text-slate-400" />
                        <span>点击卡片查看对决战报</span>
                    </span>
                </div>
                <span>{isFit ? '按弹窗宽度整屏排布 · 悬停选手追踪全赛程' : '左右滚动查看完整对阵 · 悬停选手追踪全赛程'}</span>
            </footer>

            {/* 季军争夺战独立荣耀卡片 */}
            {event.rounds
                .flatMap(r => r.matches)
                .filter(m => m.kind === 'bronze')
                .map(m => (
                    <div key={m.id} className="tournament-bronze-bar">
                        <span className="tournament-bronze-desc">
                            🥉 季军荣誉争夺战 · {names[m.leftId]} 对决 {names[m.rightId]}
                        </span>
                        <button
                            type="button"
                            disabled={m.status !== 'done'}
                            onClick={() => onMatch(m.id)}
                            className="tournament-bronze-btn"
                        >
                            <Swords size={13} className="text-amber-600" />
                            {m.status === 'done' ? '查看季军战报' : '等待决战'}
                        </button>
                    </div>
                ))}
        </section>
    );
}
