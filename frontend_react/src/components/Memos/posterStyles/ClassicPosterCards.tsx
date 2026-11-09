import {Cloud, Sparkles, Sun} from 'lucide-react';
import {OrangeFruitIcon} from '../../common/OrangeFruitIcon';
import type {PosterCardProps, PosterStyleId} from './posterShared';
import {PosterMarkdown} from './posterShared';

interface ClassicPosterCardsProps extends PosterCardProps {
    styleId: Extract<PosterStyleId, 'stamp' | 'receipt' | 'polaroid' | 'magazine' | 'journal'>;
}

export function ClassicPosterCards({
    styleId,
    memo,
    author,
    dateInfo,
    isShort,
    contentLength,
}: ClassicPosterCardsProps) {
    const {dayNum, monthNum, yearNum, weekdayName, timeStr, monthEnShort} = dateInfo;
    const serialCode = (memo.memoId || 'ODOC2026').slice(0, 8).toUpperCase();

    /* =====================================================================
     * 样式 1: 纪念邮票 (Commemorative Postage Stamp - 纯白边透明齿孔 PNG + 钢版画票面)
     * ===================================================================== */
    if (styleId === 'stamp') {
        const paperColor = '#FFFEFA';
        const toothSize = 20;
        const holeRadius = 5.5;
        const edgeThickness = 11;

        return (
            <div className="relative mx-auto w-full max-w-[420px] p-2 drop-shadow-[0_14px_28px_rgba(15,23,42,0.15)]">
                {/* 纯邮票网格：四周使用径向渐变直接镂空出 100% 透明的半圆齿孔，无任何外层底板 */}
                <div
                    className="grid"
                    style={{
                        gridTemplateColumns: `${edgeThickness}px 1fr ${edgeThickness}px`,
                        gridTemplateRows: `${edgeThickness}px 1fr ${edgeThickness}px`,
                    }}
                >
                    {/* 左上角四分之一齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at 0px 0px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                        }}
                    />
                    {/* 顶边连续半圆齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at ${toothSize / 2}px 0px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                            backgroundSize: `${toothSize}px ${edgeThickness}px`,
                            backgroundRepeat: 'repeat-x',
                        }}
                    />
                    {/* 右上角四分之一齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at ${edgeThickness}px 0px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                        }}
                    />

                    {/* 左边连续半圆齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at 0px ${toothSize / 2}px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                            backgroundSize: `${edgeThickness}px ${toothSize}px`,
                            backgroundRepeat: 'repeat-y',
                        }}
                    />

                    {/* 邮票纯白纸芯主体 */}
                    <div
                        className="relative px-3.5 pt-3.5 pb-2.5 sm:px-4 sm:pt-4 sm:pb-3"
                        style={{backgroundColor: paperColor}}
                    >
                        {/* 邮票唯一主画心（告别多层套盒，采用传统钢版画单画幅构图） */}
                        <div
                            className="relative overflow-hidden border-[1.5px] border-[#9E2A22] p-[3px]"
                            style={{
                                background:
                                    'linear-gradient(180deg, #FDF6EC 0%, #FFFDF9 46%, #FBF0E1 100%)',
                            }}
                        >
                            {/* 画心内细线与雕版画幅 */}
                            <div className="relative border border-[#D48C78]/65 px-5 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6">
                                {/* 钢版画同心放射水波底纹 SVG */}
                                <svg
                                    viewBox="0 0 400 320"
                                    preserveAspectRatio="xMidYMid slice"
                                    className="pointer-events-none absolute inset-0 h-full w-full"
                                    fill="none"
                                >
                                    {/* 右上角日晷同心细线 */}
                                    {[28, 44, 60, 76, 92, 108, 124, 140].map((r) => (
                                        <circle
                                            key={r}
                                            cx="350"
                                            cy="40"
                                            r={r}
                                            stroke="#C85A32"
                                            strokeWidth="0.6"
                                            strokeDasharray={r % 32 === 0 ? '3 3' : undefined}
                                            opacity="0.12"
                                        />
                                    ))}

                                    {/* 底部钢版画远山、祥云与柑橘折枝暗纹 */}
                                    <path
                                        d="M-10 305 Q 65 268, 145 292 T 310 278 T 410 295 L 410 325 L -10 325 Z"
                                        fill="#E8CDB8"
                                        opacity="0.28"
                                    />
                                    <path
                                        d="M-10 305 Q 65 268, 145 292 T 310 278 T 410 295"
                                        stroke="#B84A39"
                                        strokeWidth="0.8"
                                        opacity="0.25"
                                    />
                                    <path
                                        d="M30 315 Q 115 282, 205 304 T 390 288"
                                        stroke="#C87A51"
                                        strokeWidth="0.7"
                                        strokeDasharray="2 2"
                                        opacity="0.3"
                                    />
                                    {/* 右下角微雕祥云 */}
                                    <path
                                        d="M275 272 C 285 262, 302 262, 308 272 C 318 265, 334 268, 336 279 C 346 279, 352 289, 342 295 L 270 295 C 260 289, 265 275, 275 272 Z"
                                        stroke="#B84A39"
                                        strokeWidth="0.8"
                                        fill="#FFFDF9"
                                        fillOpacity="0.5"
                                        opacity="0.28"
                                    />
                                </svg>

                                {/* 四角古典雕版直角花饰 */}
                                <div className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l-2 border-t-2 border-[#9E2A22]" />
                                <div className="pointer-events-none absolute right-1.5 top-1.5 h-2.5 w-2.5 border-r-2 border-t-2 border-[#9E2A22]" />
                                <div className="pointer-events-none absolute bottom-1.5 left-1.5 h-2.5 w-2.5 border-b-2 border-l-2 border-[#9E2A22]" />
                                <div className="pointer-events-none absolute bottom-1.5 right-1.5 h-2.5 w-2.5 border-b-2 border-r-2 border-[#9E2A22]" />

                                {/* 邮票铭记顶栏：中国小橘邮政 & 面值 1.20 */}
                                <div className="relative z-10 flex items-start justify-between border-b border-[#DFB9A8]/70 pb-3">
                                    <div className="flex items-center gap-2">
                                        <OrangeFruitIcon className="h-5 w-5 shrink-0" />
                                        <div className="flex flex-col">
                                            <span className="font-serif text-sm font-black tracking-[0.26em] text-[#6E1E14]">
                                                中国小橘邮政
                                            </span>
                                            <span className="font-mono text-[8.5px] font-bold tracking-[0.22em] text-[#9E5B4B]">
                                                CHINA · O-DOC POST
                                            </span>
                                        </div>
                                    </div>

                                    {/* 经典邮票大字面值 */}
                                    <div className="flex items-baseline text-[#9E2A22]">
                                        <span className="font-serif text-2xl font-black italic leading-none tracking-tight sm:text-[26px]">
                                            1.20
                                        </span>
                                        <span className="ml-1 font-serif text-xs font-bold">元</span>
                                    </div>
                                </div>

                                {/* 邮票核心诗意文字区 */}
                                <div className="relative z-10 py-7 sm:py-8">
                                    <div
                                        className={`break-words font-serif text-[#241915] ${
                                            isShort
                                                ? 'text-lg sm:text-xl font-semibold leading-relaxed sm:leading-loose text-center'
                                                : 'text-sm sm:text-base leading-relaxed'
                                        }`}
                                    >
                                        <PosterMarkdown
                                            content={memo.content}
                                            blockquoteClassName="my-2.5 border-l-2 border-[#9E2A22] pl-3 italic text-[#5C3A33]"
                                            codeClassName="rounded bg-[#F4E6D8] px-1.5 py-0.5 font-mono text-xs text-[#8C2D19]"
                                        />
                                    </div>

                                    {memo.tag && (
                                        <div
                                            className={`mt-5 flex items-center gap-2 font-serif text-xs font-semibold tracking-widest text-[#9E2A22] ${
                                                isShort ? 'justify-center' : 'justify-start'
                                            }`}
                                        >
                                            <span className="text-[9px] opacity-60">◆</span>
                                            <span>#{memo.tag}</span>
                                            <span className="text-[9px] opacity-60">◆</span>
                                        </div>
                                    )}
                                </div>

                                {/* 画心左下角：作者题款与朱砂小方印（避开右下角邮戳区，不再重叠） */}
                                <div className="relative z-10 flex items-center justify-between pt-1">
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-5 w-5 items-center justify-center rounded-2xs bg-[#9E2A22] font-serif text-[10px] font-black text-[#FFFDF9] shadow-2xs">
                                            印
                                        </span>
                                        <span className="font-serif text-xs font-bold tracking-wider text-[#4A2C24]">
                                            {author || '小橘'} · 谨识
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 邮票外白边底栏：真实邮票微缩志号与厂铭（位于画框外白边上） */}
                        <div className="mt-2 flex items-center justify-between px-0.5 font-mono text-[9.5px] tracking-wider text-[#6E5A4F]">
                            <span>
                                {yearNum}-{monthNum} &nbsp;(1-1) T
                            </span>
                            <span className="font-serif text-[10px] font-semibold text-[#5A463C]">
                                《闪念留存》
                            </span>
                            <span className="font-serif text-[9.5px]">小橘邮票厂</span>
                        </div>

                        {/* 右下角跨框骑缝邮政销票日戳 + 水波纹销票线（避开底部文字，干净透气） */}
                        <div className="pointer-events-none absolute right-3 bottom-6 z-20 flex -rotate-12 items-center opacity-75">
                            <svg
                                viewBox="0 0 60 32"
                                className="-mr-2.5 h-7 w-13 text-[#263859]"
                                fill="none"
                            >
                                {[5, 12, 19, 26].map((y) => (
                                    <path
                                        key={y}
                                        d={`M2 ${y} Q 9 ${y - 3.5}, 16 ${y} T 30 ${y} T 44 ${y} T 58 ${y}`}
                                        stroke="currentColor"
                                        strokeWidth="1.35"
                                        strokeLinecap="round"
                                    />
                                ))}
                            </svg>
                            <div className="flex h-15 w-15 flex-col items-center justify-center rounded-full border-[1.5px] border-[#263859] bg-white/35 p-0.5 text-center text-[#263859]">
                                <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-dashed border-[#263859]/70">
                                    <span className="text-[6.5px] font-black tracking-widest">
                                        小橘邮政
                                    </span>
                                    <span className="my-0.5 border-y border-[#263859]/50 px-1 font-mono text-[7.5px] font-black">
                                        {yearNum}.{monthNum}.{dayNum}
                                    </span>
                                    <span className="font-mono text-[5.5px] font-bold tracking-wider">
                                        POSTMARK
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 右边连续半圆齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at ${edgeThickness}px ${toothSize / 2}px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                            backgroundSize: `${edgeThickness}px ${toothSize}px`,
                            backgroundRepeat: 'repeat-y',
                        }}
                    />

                    {/* 左下角四分之一齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at 0px ${edgeThickness}px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                        }}
                    />
                    {/* 底边连续半圆齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at ${toothSize / 2}px ${edgeThickness}px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                            backgroundSize: `${toothSize}px ${edgeThickness}px`,
                            backgroundRepeat: 'repeat-x',
                        }}
                    />
                    {/* 右下角四分之一齿孔 */}
                    <div
                        style={{
                            backgroundImage: `radial-gradient(circle at ${edgeThickness}px ${edgeThickness}px, transparent ${holeRadius}px, ${paperColor} ${holeRadius + 0.6}px)`,
                        }}
                    />
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 2: 灵感小票 (Boutique Roastery Receipt - 纯透明底锯齿热敏单与特调配方)
     * ===================================================================== */
    if (styleId === 'receipt') {
        return (
            <div className="relative mx-auto w-full max-w-[420px] p-2 drop-shadow-[0_14px_26px_rgba(15,23,42,0.15)]">
                <div className="relative">
                    {/* 顶部真实 SVG 锯齿撕纸边缘（外侧全透明 PNG） */}
                    <svg
                        viewBox="0 0 400 12"
                        preserveAspectRatio="none"
                        className="block h-3 w-full text-[#FAF8F3]"
                    >
                        <path
                            d="M0,12 L0,8 L10,0 L20,8 L30,0 L40,8 L50,0 L60,8 L70,0 L80,8 L90,0 L100,8 L110,0 L120,8 L130,0 L140,8 L150,0 L160,8 L170,0 L180,8 L190,0 L200,8 L210,0 L220,8 L230,0 L240,8 L250,0 L260,8 L270,0 L280,8 L290,0 L300,8 L310,0 L320,8 L330,0 L340,8 L350,0 L360,8 L370,0 L380,8 L390,0 L400,8 L400,12 Z"
                            fill="currentColor"
                        />
                    </svg>

                    {/* 热敏纸主体 */}
                    <div
                        className="relative bg-[#FAF8F3] px-6 py-4 font-mono text-[#23211E] sm:px-7"
                        style={{
                            backgroundImage:
                                'repeating-linear-gradient(0deg, rgba(0,0,0,0.012) 0px, rgba(0,0,0,0.012) 1px, transparent 1px, transparent 3px)',
                        }}
                    >
                        {/* 店铺抬头 */}
                        <div className="border-b-2 border-[#23211E] pb-3 text-center">
                            <div className="mx-auto mb-1 inline-flex items-center gap-1.5 rounded-full border border-[#23211E] px-2.5 py-0.5 text-[10px] font-bold tracking-widest">
                                <OrangeFruitIcon className="h-3.5 w-3.5" />
                                <span>O-DOC ROASTERY & LAB</span>
                            </div>
                            <h3 className="mt-1 text-base font-black tracking-[0.2em] text-[#1A1816]">
                                小橘灵感烘焙工坊
                            </h3>
                            <p className="text-[10px] tracking-widest text-stone-500">
                                STORE #042 · FRESH THOUGHTS DAILY
                            </p>
                        </div>

                        {/* 叫号单框 + 账单信息 */}
                        <div className="my-3 flex items-stretch justify-between border border-[#23211E] bg-[#F2EFE8]">
                            <div className="flex flex-col justify-center bg-[#23211E] px-3 py-2 text-[#FAF8F3]">
                                <span className="text-[9px] tracking-widest opacity-75">PICKUP NO.</span>
                                <span className="text-xl font-black leading-none tracking-tight">
                                    #A{dayNum}
                                </span>
                            </div>
                            <div className="flex flex-1 flex-col justify-center space-y-0.5 px-3 py-1.5 text-[10px] text-stone-600">
                                <div className="flex justify-between">
                                    <span>ORD: {serialCode}</span>
                                    <span className="font-bold text-[#23211E]">{weekdayName}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>DATE: {yearNum}.{monthNum}.{dayNum}</span>
                                    <span>{timeStr}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>BARISTA (主理人):</span>
                                    <span className="font-bold text-[#23211E]">{author || '小橘'}</span>
                                </div>
                            </div>
                        </div>

                        {/* 点单项目表头 */}
                        <div className="flex items-center justify-between border-y border-dashed border-stone-400 py-1 text-[10px] font-bold text-stone-500">
                            <span>ITEM / 灵感特调单品</span>
                            <div className="flex gap-5">
                                <span>QTY</span>
                                <span>VAL</span>
                            </div>
                        </div>

                        {/* 主体内容（特调主项） */}
                        <div className="py-3">
                            <div className="mb-2 flex items-baseline justify-between text-xs font-bold text-[#1A1816]">
                                <span>01. 手冲闪念原萃 (Single Origin)</span>
                                <div className="flex gap-6 font-mono">
                                    <span>1</span>
                                    <span>0.00</span>
                                </div>
                            </div>

                            {/* 灵感正文打印框 */}
                            <div className="my-2.5 rounded-xs border-l-[3px] border-[#23211E] bg-[#F1EDE3] p-3.5 shadow-inner">
                                <div
                                    className={`break-words font-sans leading-relaxed text-[#1F1D1A] ${
                                        isShort
                                            ? 'text-base sm:text-lg font-semibold leading-relaxed'
                                            : 'text-sm leading-relaxed'
                                    }`}
                                >
                                    <PosterMarkdown
                                        content={memo.content}
                                        blockquoteClassName="my-2 border-l-2 border-stone-500 pl-2.5 italic text-stone-700"
                                        codeClassName="rounded bg-stone-200/90 px-1 py-0.5 font-mono text-xs"
                                    />
                                </div>
                            </div>

                            {/* 客制化风味参数 */}
                            <div className="mt-2.5 space-y-1 pl-2 text-[11px] text-stone-600">
                                <div className="flex justify-between">
                                    <span>├─ 风味标签 (FLAVOR):</span>
                                    <span className="font-bold text-[#23211E]">
                                        #{memo.tag || '原味随想'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span>├─ 字符烘焙度 (ROAST):</span>
                                    <span>{contentLength} Chars · 100% 萃取</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>└─ 赏味期限 (EXPIRY):</span>
                                    <span>PERMANENT / 永久留存</span>
                                </div>
                            </div>
                        </div>

                        {/* 结算栏与复古已出品印章 */}
                        <div className="relative border-t-2 border-[#23211E] pt-2.5 text-xs">
                            <div className="flex justify-between text-[11px] text-stone-500">
                                <span>SUBTOTAL (小计):</span>
                                <span>¥ 0.00</span>
                            </div>
                            <div className="mt-0.5 flex justify-between text-sm font-black text-[#1A1816]">
                                <span>TOTAL (灵感价值):</span>
                                <span>PRICELESS / 无价</span>
                            </div>

                            {/* 倾斜加盖的橘红方形出品章 */}
                            <div className="pointer-events-none absolute -top-2 right-16 -rotate-6 rounded-xs border-2 border-[#D94E28]/80 px-2 py-0.5 text-center text-[#D94E28] opacity-85">
                                <div className="text-[9px] font-black tracking-widest">
                                    BREWED · 已出品
                                </div>
                            </div>
                        </div>

                        {/* 虚线撕取副券与条形码 */}
                        <div className="mt-3 border-t border-dashed border-stone-400 pt-3 text-center">
                            <svg
                                viewBox="0 0 240 34"
                                className="mx-auto h-9 w-52 text-[#23211E]"
                                fill="currentColor"
                            >
                                {[
                                    0, 4, 10, 14, 22, 26, 30, 38, 44, 48, 56, 62, 66, 72, 80, 84,
                                    92, 98, 104, 108, 116, 122, 126, 134, 140, 144, 152, 158, 162,
                                    170, 174, 182, 188, 192, 200, 206, 210, 218, 224, 230, 236,
                                ].map((x, idx) => (
                                    <rect
                                        key={idx}
                                        x={x}
                                        y="0"
                                        width={idx % 3 === 0 ? '3' : idx % 2 === 0 ? '2' : '1'}
                                        height="34"
                                    />
                                ))}
                            </svg>
                            <span className="mt-1 block text-[10px] tracking-[0.28em] text-stone-500">
                                * {yearNum}
                                {monthNum}
                                {dayNum}-{serialCode.slice(0, 4)} *
                            </span>
                            <p className="mt-1.5 text-[10px] text-stone-400">
                                ✂ 凭此热敏单据可在未来任意时刻唤醒今日灵感
                            </p>
                        </div>
                    </div>

                    {/* 底部真实 SVG 锯齿撕纸边缘 */}
                    <svg
                        viewBox="0 0 400 12"
                        preserveAspectRatio="none"
                        className="block h-3 w-full text-[#FAF8F3]"
                    >
                        <path
                            d="M0,0 L0,4 L10,12 L20,4 L30,12 L40,4 L50,12 L60,4 L70,12 L80,4 L90,12 L100,4 L110,12 L120,4 L130,12 L140,4 L150,12 L160,4 L170,12 L180,4 L190,12 L200,4 L210,12 L220,4 L230,12 L240,4 L250,12 L260,4 L270,12 L280,4 L290,12 L300,4 L310,12 L320,4 L330,12 L340,4 L350,12 L360,4 L370,12 L380,4 L390,12 L400,4 L400,0 Z"
                            fill="currentColor"
                        />
                    </svg>
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 3: 拍立得 (Daylight Instant Film - 暖调日光胶片与格纹和纸胶带)
     * ===================================================================== */
    if (styleId === 'polaroid') {
        return (
            <div className="relative mx-auto w-full max-w-[432px] pt-3 pb-1 px-2">
                {/* 顶部斜贴格纹和纸胶带 (Washi Tape SVG) */}
                <div
                    className="pointer-events-none absolute top-0 left-1/2 z-20 h-7 w-32 -translate-x-1/2 -rotate-2 border-x border-dashed border-amber-600/30 shadow-xs"
                    style={{
                        backgroundColor: 'rgba(253, 224, 165, 0.88)',
                        backgroundImage:
                            'repeating-linear-gradient(45deg, rgba(234,88,12,0.14) 0px, rgba(234,88,12,0.14) 6px, transparent 6px, transparent 12px), repeating-linear-gradient(-45deg, rgba(217,119,6,0.12) 0px, rgba(217,119,6,0.12) 6px, transparent 6px, transparent 12px)',
                    }}
                />

                {/* 拍立得象牙白厚相纸外框 */}
                <div className="relative rounded-xl border border-[#E4DEC9] bg-[#FAF7F0] p-4 pb-6 shadow-2xl sm:p-5 sm:pb-7">
                    {/* 胶片齿孔编码顶栏 */}
                    <div className="mb-1.5 flex items-center justify-between px-1 font-mono text-[9px] font-bold tracking-widest text-[#B59B7D]">
                        <span>► O-DOC COLOR FILM 160</span>
                        <span>FRAME {dayNum}A</span>
                    </div>

                    {/* 拍立得暖调日光显影画心（明亮奶油晨光渐变，告别沉闷暗黑） */}
                    <div
                        className="relative flex min-h-[290px] flex-col justify-between overflow-hidden rounded-lg border border-[#E5D4BD] p-5 text-[#2E231D] shadow-[inset_0_2px_10px_rgba(166,118,74,0.12)] sm:p-6"
                        style={{
                            background:
                                'radial-gradient(circle at 85% 18%, rgba(251,146,60,0.22) 0%, transparent 45%), radial-gradient(circle at 12% 85%, rgba(244,114,182,0.14) 0%, transparent 50%), linear-gradient(145deg, #FFFDF9 0%, #FDF1E2 52%, #F7E3CE 100%)',
                        }}
                    >
                        {/* 取景器四角对焦框线 (Viewfinder Brackets) */}
                        <div className="pointer-events-none absolute inset-3.5">
                            <div className="absolute left-0 top-0 h-3.5 w-3.5 border-l-2 border-t-2 border-[#B08968]/50" />
                            <div className="absolute right-0 top-0 h-3.5 w-3.5 border-r-2 border-t-2 border-[#B08968]/50" />
                            <div className="absolute bottom-0 left-0 h-3.5 w-3.5 border-b-2 border-l-2 border-[#B08968]/50" />
                            <div className="absolute bottom-0 right-0 h-3.5 w-3.5 border-b-2 border-r-2 border-[#B08968]/50" />
                        </div>

                        {/* 相机光学参数顶栏 */}
                        <div className="relative z-10 flex items-center justify-between border-b border-[#E3CCB2]/70 pb-2.5 font-mono text-[10px] text-[#7D5E47]">
                            <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-orange-500" />
                                <span className="font-bold tracking-wider">DAYLIGHT · F2.8</span>
                            </div>
                            <span className="rounded-full bg-white/75 px-2 py-0.5 text-[9px] font-bold text-[#9A5B25] shadow-2xs">
                                1/500s · ISO 160
                            </span>
                        </div>

                        {/* 显影核心文字区域 */}
                        <div className="relative z-10 my-auto py-6 px-1">
                            <Sparkles className="mb-2 h-4 w-4 text-orange-400/80" />
                            <div
                                className={`break-words tracking-wide leading-relaxed text-[#2C211B] ${
                                    isShort
                                        ? 'text-lg sm:text-xl font-semibold sm:leading-loose'
                                        : 'text-sm sm:text-base leading-relaxed'
                                }`}
                            >
                                <PosterMarkdown
                                    content={memo.content}
                                    blockquoteClassName="my-2 border-l-2 border-orange-400 pl-3 italic text-[#694B38]"
                                    codeClassName="rounded bg-white/80 px-1.5 py-0.5 font-mono text-xs text-[#9A4E1C]"
                                />
                            </div>

                            {memo.tag && (
                                <div className="mt-4">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-orange-300/70 bg-white/85 px-3 py-0.5 text-xs font-semibold text-[#B45309] shadow-2xs">
                                        #{memo.tag}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* 胶片右下角经典石英橙色背光日期戳 (Quartz Date Stamp) */}
                        <div className="relative z-10 flex items-end justify-between border-t border-[#E3CCB2]/60 pt-2.5">
                            <span className="font-mono text-[9px] tracking-widest text-[#9C7A60]">
                                AUTO FOCUS · SUNLIT
                            </span>
                            <span
                                className="font-mono text-xs font-black tracking-[0.22em] text-[#EA580C]"
                                style={{textShadow: '0 0 6px rgba(234,88,12,0.3)'}}
                            >
                                &apos;{yearNum.slice(-2)} {monthNum} {dayNum}
                            </span>
                        </div>
                    </div>

                    {/* 拍立得经典宽白底边手写签名栏 */}
                    <div className="mt-4 flex items-end justify-between px-2 pt-1">
                        <div className="flex flex-col text-left">
                            <span className="font-mono text-[9px] uppercase tracking-widest text-stone-400">
                                SNAPSHOT BY // {weekdayName} {timeStr}
                            </span>
                            <div className="relative mt-0.5 inline-block">
                                <span className="font-serif text-sm font-bold text-[#2C221E]">
                                    ✍️ {author || '小橘记录者'}
                                </span>
                                {/* 手绘马克笔下划线 SVG */}
                                <svg
                                    viewBox="0 0 120 8"
                                    className="mt-0.5 h-1.5 w-28 text-orange-400/75"
                                    fill="none"
                                >
                                    <path
                                        d="M2 5.5 C 32 2, 78 6.5, 118 3"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>
                        </div>

                        {/* 拍立得复古四色光谱条标 */}
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex overflow-hidden rounded-xs shadow-2xs">
                                <span className="h-2.5 w-3 bg-[#E63946]" />
                                <span className="h-2.5 w-3 bg-[#F4A261]" />
                                <span className="h-2.5 w-3 bg-[#E9C46A]" />
                                <span className="h-2.5 w-3 bg-[#2A9D8F]" />
                            </div>
                            <span className="font-mono text-[10px] font-black tracking-tight text-stone-600">
                                INSTAX · {monthEnShort}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 4: 杂志大刊 (Editorial Magazine - 保持原有设计不变)
     * ===================================================================== */
    if (styleId === 'magazine') {
        return (
            <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0A0E17] p-7 text-white shadow-2xl sm:p-9 font-sans">
                {/* 杂志报头 */}
                <div className="border-b border-slate-800 pb-4">
                    <div className="flex items-baseline justify-between">
                        <div className="flex items-center gap-2">
                            <OrangeFruitIcon className="h-4 w-4" />
                            <span className="text-sm font-black tracking-[0.25em] text-white">
                                ODOC ESSAY
                            </span>
                        </div>
                        <div className="font-mono text-[11px] text-orange-500 font-semibold tracking-wider">
                            VOL. {yearNum} · NO. {monthNum}
                        </div>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-widest">
                        <span>COLLECTION OF THOUGHTS</span>
                        <span>
                            {yearNum}.{monthNum}.{dayNum} / {weekdayName}
                        </span>
                    </div>
                </div>

                {/* 杂志正文引言 */}
                <div className="py-8">
                    <span className="float-left mr-3 select-none font-serif text-5xl font-black leading-none text-orange-500">
                        “
                    </span>
                    <div
                        className={`break-words tracking-wide leading-relaxed text-slate-200 ${
                            isShort
                                ? 'text-lg sm:text-xl font-normal sm:leading-loose'
                                : 'text-sm sm:text-base leading-relaxed'
                        }`}
                    >
                        <PosterMarkdown
                            content={memo.content}
                            paragraphClassName="mb-4 last:mb-0 whitespace-pre-line"
                            blockquoteClassName="my-3 border-l-2 border-orange-500 pl-4 italic text-slate-300"
                            codeClassName="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs text-orange-300"
                        />
                    </div>

                    {memo.tag && (
                        <div className="mt-6 flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-orange-400">
                                SECTION // #{memo.tag}
                            </span>
                        </div>
                    )}
                </div>

                {/* 杂志尾注 */}
                <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-[11px] text-slate-400">
                    <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-wider text-slate-400">
                            WRITER
                        </span>
                        <span className="font-bold text-slate-200">
                            {author ? author.toUpperCase() : 'ODOC USER'}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-400">PAGE {dayNum}</span>
                        <div className="h-3 w-[1px] bg-slate-700" />
                        <span className="font-semibold text-slate-300">小橘深度文摘</span>
                    </div>
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 5: 手账便签 (Collage Ring Journal - 金属双线圈本、撕页日历与立体火漆印)
     * ===================================================================== */
    return (
        <div className="relative mx-auto w-full max-w-[436px] pr-2 pt-2">
            {/* 右侧莫兰迪色手账索引分栏贴 (Index Tabs) */}
            <div className="pointer-events-none absolute right-0 top-10 z-0 flex flex-col gap-2">
                <div className="rounded-r-md border border-l-0 border-[#D59B78] bg-[#F4C095] px-1.5 py-2.5 font-mono text-[9px] font-black tracking-widest text-[#6E3B1B] shadow-xs [writing-mode:vertical-rl]">
                    IDEA
                </div>
                <div className="rounded-r-md border border-l-0 border-[#9BB09D] bg-[#C8DBC8] px-1.5 py-2.5 font-mono text-[9px] font-black tracking-widest text-[#2D4732] shadow-xs [writing-mode:vertical-rl]">
                    {monthNum}月
                </div>
            </div>

            {/* 手账本主体纸张 */}
            <div
                className="relative z-10 overflow-hidden rounded-2xl border-2 border-[#DFD5C0] bg-[#FDFBF5] p-5 pl-12 text-[#2D2620] shadow-xl sm:p-6 sm:pl-14"
                style={{
                    backgroundImage:
                        'radial-gradient(#D3C7B2 1.15px, transparent 1.15px), linear-gradient(to bottom, transparent 27px, rgba(218,205,184,0.28) 28px)',
                    backgroundSize: '18px 18px, 100% 28px',
                }}
            >
                {/* 左侧仿真金属双线圈装订环 (Twin-Ring Brass Binder) */}
                <div className="pointer-events-none absolute inset-y-0 left-0 flex w-9 flex-col justify-between border-r border-[#E8DEC8] bg-[#F5EFE2]/90 py-5">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="relative flex items-center pl-1">
                            {/* 双金属线圈 */}
                            <div className="flex flex-col gap-1">
                                <span className="h-1.5 w-5 rounded-full bg-gradient-to-r from-[#8C6D46] via-[#DFC295] to-[#6E5231] shadow-2xs" />
                                <span className="h-1.5 w-5 rounded-full bg-gradient-to-r from-[#8C6D46] via-[#DFC295] to-[#6E5231] shadow-2xs" />
                            </div>
                            {/* 方型打孔槽 */}
                            <span className="-ml-1 h-4 w-3 rounded-xs border border-[#C9BEA9] bg-[#E5DEC9] shadow-inner" />
                        </div>
                    ))}
                </div>

                {/* 顶部和纸胶带装饰条 + 拼贴日历小卡 */}
                <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-[#E2D6C1] pb-4">
                    {/* 左侧：迷你单向撕页日历贴纸 */}
                    <div className="flex shrink-0 -rotate-2 flex-col items-center overflow-hidden rounded-lg border border-[#D8CBB5] bg-white shadow-sm">
                        <div className="w-full bg-[#E06D3B] px-2.5 py-0.5 text-center font-mono text-[9px] font-black tracking-wider text-white">
                            {monthEnShort} · {monthNum}月
                        </div>
                        <span className="px-3 pt-1 font-serif text-xl font-black leading-none text-[#2D2620]">
                            {dayNum}
                        </span>
                        <span className="pb-1 font-sans text-[9px] font-bold text-[#8C735B]">
                            {weekdayName}
                        </span>
                    </div>

                    {/* 右侧：手账标题栏与天气心情圈选 */}
                    <div className="flex flex-1 flex-col items-end">
                        <div className="flex items-center gap-1.5">
                            <span className="rounded-xs bg-[#F3E5AB] px-2 py-0.5 font-serif text-xs font-black tracking-wider text-[#5C4328]">
                                ✦ 日常灵感手账 ✦
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-[#8C7A68]">
                            <span className="font-mono text-[10px] font-semibold">WEATHER:</span>
                            {/* 手绘红圈选中晴天 */}
                            <span className="relative flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#D95338] bg-orange-50 text-[#D95338]">
                                <Sun className="h-3.5 w-3.5" />
                            </span>
                            <Cloud className="h-3.5 w-3.5 text-stone-300" />
                            <span className="font-mono text-[10px] text-[#9E8B76]">{timeStr}</span>
                        </div>
                    </div>
                </div>

                {/* 手账正文拼贴纸条区 */}
                <div className="relative my-5">
                    {/* 顶部斜贴小胶带 */}
                    <div className="pointer-events-none absolute -top-2.5 right-6 h-4 w-16 rotate-3 rounded-2xs bg-[#E8A598]/60" />

                    <div className="rounded-xl border border-[#E5DAC6] bg-[#FFFDF9]/90 p-4 shadow-2xs sm:p-5">
                        <div
                            className={`break-words tracking-wide leading-relaxed text-[#2D251E] ${
                                isShort
                                    ? 'text-lg sm:text-xl font-medium sm:leading-loose'
                                    : 'text-sm sm:text-base leading-relaxed'
                            }`}
                        >
                            <PosterMarkdown
                                content={memo.content}
                                blockquoteClassName="my-2.5 border-l-[3px] border-[#D97724] bg-[#FAF3E6] py-1 pl-3 italic text-[#5C4530]"
                                codeClassName="rounded bg-[#F2E9D8] px-1.5 py-0.5 font-mono text-xs text-[#8C5D35]"
                            />
                        </div>

                        {/* 牛皮纸打孔标签卡 */}
                        {memo.tag && (
                            <div className="mt-4 flex items-center">
                                <div className="inline-flex items-center gap-1.5 rounded-r-md border border-[#C6A477] bg-[#F2E3CA] py-1 pl-2 pr-3 text-xs font-bold text-[#6E4720] shadow-2xs">
                                    <span className="h-2 w-2 rounded-full border border-[#8C6239] bg-[#FDFBF5]" />
                                    <span>#{memo.tag}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 手账底部：钢笔署名 + 立体浮雕火漆印章 SVG */}
                <div className="flex items-end justify-between border-t border-[#E6DBC8] pt-3">
                    <div className="flex flex-col text-left">
                        <span className="font-mono text-[9px] tracking-wider text-[#9C8974]">
                            HANDWRITTEN NOTE // {yearNum}.{monthNum}.{dayNum}
                        </span>
                        <span className="mt-0.5 font-serif text-sm font-bold text-[#3C2F25]">
                            ✒️ {author || '小橘手账主理人'}
                        </span>
                    </div>

                    {/* 仿真复古火漆印章 (Wax Seal) */}
                    <div className="relative flex h-13 w-13 -rotate-6 items-center justify-center rounded-full bg-gradient-to-br from-[#B8332A] via-[#96211A] to-[#6E140E] p-1 text-[#FCEAD2] shadow-md ring-2 ring-[#C84B31]/40">
                        <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-dashed border-[#F5CBA7]/60 text-center">
                            <OrangeFruitIcon className="h-3.5 w-3.5" />
                            <span className="mt-0.5 font-serif text-[7px] font-black tracking-widest">
                                小橘手账
                            </span>
                            <span className="font-mono text-[6px] font-bold opacity-85">
                                SEALED
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
