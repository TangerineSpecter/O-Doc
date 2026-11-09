import {Headphones, Plane} from 'lucide-react';
import {OrangeFruitIcon} from '../../common/OrangeFruitIcon';
import type {PosterCardProps, PosterStyleId} from './posterShared';
import {PosterMarkdown} from './posterShared';

interface ExtendedPosterCardsProps extends PosterCardProps {
    styleId: Extract<PosterStyleId, 'boarding' | 'museum' | 'vinyl' | 'shiori' | 'herbarium'>;
}

export function ExtendedPosterCards({
    styleId,
    memo,
    author,
    dateInfo,
    isShort,
    contentLength,
}: ExtendedPosterCardsProps) {
    const {dayNum, monthNum, yearNum, weekdayName, timeStr, monthEnShort} = dateInfo;
    const serialCode = (memo.memoId || 'ODOC2026').slice(0, 8).toUpperCase();

    /* =====================================================================
     * 样式 6: 登机牌 (First-Class Boarding Pass - 头等舱航线与透明半圆撕口副券)
     * ===================================================================== */
    if (styleId === 'boarding') {
        return (
            <div className="relative mx-auto w-full max-w-[430px] p-2 drop-shadow-[0_14px_28px_rgba(15,23,42,0.15)]">
                <div className="relative overflow-hidden rounded-2xl text-slate-800">
                    {/* 上半联：主登机牌 */}
                    <div className="bg-white">
                        {/* 顶部航空蓝与活力橙头等舱横幅 */}
                        <div className="flex items-center justify-between bg-gradient-to-r from-[#1D4ED8] via-[#2563EB] to-[#1E40AF] px-5 py-3 text-white">
                            <div className="flex items-center gap-2">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                                    <Plane className="h-3.5 w-3.5 -rotate-45 text-white" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-mono text-xs font-black tracking-[0.2em]">
                                        O-DOC AIRWAYS
                                    </span>
                                    <span className="text-[9px] tracking-widest text-blue-200">
                                        小橘思想航线 · BOARDING PASS
                                    </span>
                                </div>
                            </div>
                            <span className="rounded-full bg-[#EA580C] px-2.5 py-0.5 font-mono text-[10px] font-black tracking-wider text-white shadow-2xs">
                                FIRST CLASS · 头等舱
                            </span>
                        </div>

                        {/* 航线起降大字报头 (NOW -> MEMO) */}
                        <div className="border-b border-slate-200 bg-[#F8FAFC] px-5 py-3.5">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="font-mono text-[9px] font-bold tracking-widest text-slate-400">
                                        ORIGIN / 出发地
                                    </span>
                                    <span className="font-mono text-2xl font-black leading-tight tracking-tight text-[#1E3A8A]">
                                        NOW
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-600">
                                        此刻思绪 · 闪念港
                                    </span>
                                </div>

                                {/* 航线轨迹 SVG */}
                                <div className="flex flex-1 flex-col items-center px-3">
                                    <span className="font-mono text-[10px] font-bold text-[#EA580C]">
                                        FLIGHT OD-{monthNum}
                                        {dayNum}
                                    </span>
                                    <div className="my-1 flex w-full items-center">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#1D4ED8]" />
                                        <div className="h-[1.5px] flex-1 border-b border-dashed border-blue-400" />
                                        <Plane className="mx-1.5 h-4 w-4 text-[#EA580C]" />
                                        <div className="h-[1.5px] flex-1 border-b border-dashed border-blue-400" />
                                        <span className="h-1.5 w-1.5 rounded-full bg-[#EA580C]" />
                                    </div>
                                    <span className="font-mono text-[9px] text-slate-400">
                                        NON-STOP · 直达留存
                                    </span>
                                </div>

                                <div className="flex flex-col items-end">
                                    <span className="font-mono text-[9px] font-bold tracking-widest text-slate-400">
                                        DESTINATION / 目的地
                                    </span>
                                    <span className="font-mono text-2xl font-black leading-tight tracking-tight text-[#1E3A8A]">
                                        MEMO
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-600">
                                        永恒记忆 · 灵感岛
                                    </span>
                                </div>
                            </div>

                            {/* 四宫格航班参数 */}
                            <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-2 font-mono">
                                <div>
                                    <div className="text-[8px] font-bold text-slate-400">PASSENGER</div>
                                    <div className="truncate font-sans text-xs font-bold text-slate-900">
                                        {author || '小橘机长'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[8px] font-bold text-slate-400">DATE</div>
                                    <div className="text-xs font-black text-slate-900">
                                        {dayNum} {monthEnShort}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[8px] font-bold text-slate-400">GATE</div>
                                    <div className="text-xs font-black text-[#EA580C]">G-{monthNum}</div>
                                </div>
                                <div>
                                    <div className="text-[8px] font-bold text-slate-400">SEAT</div>
                                    <div className="text-xs font-black text-[#1D4ED8]">01A · 靠窗</div>
                                </div>
                            </div>
                        </div>

                        {/* 机舱灵感申报正文区 */}
                        <div className="relative px-5 py-5 sm:px-6">
                            {/* 经纬线地球暗纹 SVG */}
                            <svg
                                viewBox="0 0 200 100"
                                className="pointer-events-none absolute right-3 top-3 h-24 w-44 text-blue-900/[0.04]"
                                fill="none"
                            >
                                <circle cx="140" cy="50" r="42" stroke="currentColor" strokeWidth="1.5" />
                                <ellipse cx="140" cy="50" rx="22" ry="42" stroke="currentColor" strokeWidth="1.2" />
                                <line x1="98" y1="35" x2="182" y2="35" stroke="currentColor" strokeWidth="1" />
                                <line x1="98" y1="50" x2="182" y2="50" stroke="currentColor" strokeWidth="1.2" />
                                <line x1="98" y1="65" x2="182" y2="65" stroke="currentColor" strokeWidth="1" />
                            </svg>

                            <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] font-bold text-blue-700/80">
                                <span>CABIN MANIFEST // 随身灵感记录</span>
                                <span>{contentLength} KG (CHARS)</span>
                            </div>

                            <div
                                className={`relative z-10 break-words leading-relaxed text-slate-800 ${
                                    isShort
                                        ? 'text-lg sm:text-xl font-semibold sm:leading-loose'
                                        : 'text-sm sm:text-base leading-relaxed'
                                }`}
                            >
                                <PosterMarkdown
                                    content={memo.content}
                                    blockquoteClassName="my-2 border-l-[3px] border-[#2563EB] bg-blue-50/70 py-1 pl-3 italic text-slate-700"
                                    codeClassName="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-blue-800"
                                />
                            </div>

                            {memo.tag && (
                                <div className="mt-4 flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-0.5 font-mono text-xs font-bold text-[#EA580C]">
                                        <span>PRIORITY TAG //</span>
                                        <span>#{memo.tag}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 登机牌左右真实透明半圆缺口与虚线分割线 */}
                    <div
                        className=" flex h-5 items-center px-4"
                        style={{
                            backgroundImage:
                                'radial-gradient(circle at 0px 50%, transparent 10px, #F8FAFC 10.6px), radial-gradient(circle at 100% 50%, transparent 10px, #F8FAFC 10.6px)',
                            backgroundSize: '51% 100%, 51% 100%',
                            backgroundPosition: 'left center, right center',
                            backgroundRepeat: 'no-repeat',
                        }}
                    >
                        <div className="w-full border-t-2 border-dashed border-slate-300" />
                    </div>

                    {/* 底部登机副券 (Boarding Stub) */}
                    <div className="flex items-center justify-between bg-[#F8FAFC] px-5 pt-2 pb-4">
                        <div className="flex flex-col space-y-0.5 font-mono">
                            <div className="flex items-center gap-2">
                                <span className="rounded-xs bg-emerald-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                                    CLEARED
                                </span>
                                <span className="text-[11px] font-bold text-slate-800">
                                    BOARDING AT {timeStr}
                                </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                                ETKT #{yearNum}
                                {monthNum}
                                {dayNum}-{serialCode}
                            </span>
                        </div>

                        {/* 航空登机一维/二维矩阵码 */}
                        <div className="flex flex-col items-end">
                            <svg
                                viewBox="0 0 110 26"
                                className="h-6 w-28 text-slate-900"
                                fill="currentColor"
                            >
                                {[
                                    0, 3, 7, 10, 15, 19, 22, 27, 31, 34, 40, 44, 47, 52, 56, 61, 65,
                                    69, 74, 78, 83, 86, 91, 95, 99, 104, 107,
                                ].map((x, idx) => (
                                    <rect
                                        key={idx}
                                        x={x}
                                        y="0"
                                        width={idx % 3 === 0 ? '2.5' : '1.2'}
                                        height="26"
                                    />
                                ))}
                            </svg>
                            <span className="mt-0.5 font-mono text-[8px] tracking-widest text-slate-400">
                                GATE CLOSES ON DELAY
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 7: 展览画签 (Art Gallery Placard - 现代美术馆几何画框与策展铭牌)
     * ===================================================================== */
    if (styleId === 'museum') {
        return (
            <div className="relative mx-auto w-full max-w-[436px] rounded-xl border-2 border-[#D5CBB8] bg-[#F4F0E6] p-4 text-[#23201C] shadow-2xl sm:p-5">
                {/* 装饰卡纸内衬框 (Passe-Partout Gallery Mat) */}
                <div className="relative border border-[#DED6C6] bg-[#FCFBF8] p-4 shadow-[inset_0_1px_6px_rgba(120,105,85,0.08)] sm:p-5">
                    {/* 展览馆顶部导览栏 */}
                    <div className="flex items-center justify-between border-b border-[#E6DFD1] pb-2.5 font-mono text-[10px] text-[#7D7465]">
                        <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 bg-[#C84B31]" />
                            <span className="font-bold tracking-[0.18em] text-[#2B2620]">
                                MOMA · O-DOC GALLERY
                            </span>
                        </div>
                        <span>EXHIBITION NO. {monthNum}</span>
                    </div>

                    {/* 包豪斯/马蒂斯风格几何抽象艺术画幅横条 (Bauhaus SVG Art Header) */}
                    <div className="relative my-3.5 overflow-hidden rounded-xs border border-[#E5DEC9] bg-[#F3ECE0] p-3">
                        <svg viewBox="0 0 360 68" className="h-16 w-full" fill="none">
                            {/* 暖沙底色块 */}
                            <rect x="0" y="0" width="115" height="68" fill="#EAE0D0" />
                            {/* 陶土红半圆 */}
                            <path d="M22 68 A 36 36 0 0 1 94 68 Z" fill="#C84B31" opacity="0.9" />
                            {/* 芥末黄圆日 */}
                            <circle cx="156" cy="34" r="22" fill="#E09F3E" opacity="0.9" />
                            {/* 鼠尾草绿几何阶梯 */}
                            <path d="M196 12 H256 V68 H196 Z" fill="#4A6B5D" opacity="0.85" />
                            <circle cx="226" cy="40" r="14" fill="#FCFBF8" />
                            {/* 极简建筑构成线条 */}
                            <line x1="275" y1="8" x2="345" y2="60" stroke="#23201C" strokeWidth="2" />
                            <circle cx="315" cy="24" r="9" stroke="#C84B31" strokeWidth="2.5" />
                            <rect x="282" y="42" width="28" height="14" fill="#D5B895" />
                        </svg>
                        <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] tracking-widest text-[#8C7E6A]">
                            <span>FIG. {dayNum} // ABSTRACT COMPOSITION OF THOUGHT</span>
                            <span>{yearNum} COLLECTION</span>
                        </div>
                    </div>

                    {/* 艺术展品核心引文画心 */}
                    <div className="relative py-5 px-2 sm:py-6">
                        <div className="mb-2 font-serif text-xs italic text-[#9C8E7B]">
                            “Untitled Thought #{serialCode.slice(0, 4)}”
                        </div>

                        <div
                            className={`break-words font-serif leading-relaxed text-[#1F1C18] ${
                                isShort
                                    ? 'text-lg sm:text-xl font-medium sm:leading-loose'
                                    : 'text-sm sm:text-base leading-relaxed'
                            }`}
                        >
                            <PosterMarkdown
                                content={memo.content}
                                blockquoteClassName="my-2.5 border-l-2 border-[#C84B31] pl-3.5 italic text-[#5A5044]"
                                codeClassName="rounded bg-[#EFECE4] px-1.5 py-0.5 font-mono text-xs text-[#8C3B2B]"
                            />
                        </div>
                    </div>

                    {/* 美术馆标准展签铭牌 (Curatorial Wall Placard) */}
                    <div className="mt-2 border-t-2 border-[#23201C] bg-[#F5F1E8] p-3.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1 text-left">
                                <div className="font-serif text-xs font-black text-[#1F1C18]">
                                    {author || '小橘艺术家'}{' '}
                                    <span className="font-normal text-[#7A7062]">
                                        (Born O-Doc Studio)
                                    </span>
                                </div>
                                <div className="font-serif text-xs italic font-semibold text-[#C84B31]">
                                    《 {memo.tag ? `#${memo.tag}` : '瞬时闪念切片'} 》, {yearNum}
                                </div>
                                <div className="font-sans text-[10px] text-[#6E6558]">
                                    媒材：数字手稿 · 纸本设色 | 尺寸：{contentLength} 字符 ·{' '}
                                    {monthNum}月{dayNum}日 ({weekdayName})
                                </div>
                            </div>

                            {/* 语音导览编号角标 */}
                            <div className="flex shrink-0 flex-col items-end justify-between">
                                <div className="inline-flex items-center gap-1 rounded-full border border-[#23201C] bg-white px-2 py-0.5 font-mono text-[10px] font-black text-[#23201C]">
                                    <Headphones className="h-3 w-3 text-[#C84B31]" />
                                    <span>#{dayNum}</span>
                                </div>
                                <span className="mt-3 font-mono text-[8px] font-bold uppercase tracking-widest text-[#8C8273]">
                                    PERMANENT ARCHIVE
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 8: 黑胶歌词 (Indie Vinyl Sleeve - 日版侧标腰封与奶油黑胶内页，亮色系)
     * ===================================================================== */
    if (styleId === 'vinyl') {
        return (
            <div className="relative mx-auto w-full max-w-[438px] overflow-hidden rounded-2xl border border-[#DFD6C5] bg-[#FAF6EC] shadow-2xl">
                <div className="flex min-h-[360px] items-stretch">
                    {/* 左侧：日版黑胶唱片经典侧标腰封 (OBI Strip - 珊瑚朱红配奶油白) */}
                    <div className="flex w-13 shrink-0 flex-col items-center justify-between border-r-2 border-[#B83B24] bg-[#D94E34] px-1.5 py-4 text-[#FFFDF9]">
                        {/* 顶部立体声标识框 */}
                        <div className="w-full rounded-2xs bg-[#FFFDF9] py-1 text-center font-mono text-[8px] font-black leading-tight text-[#D94E34]">
                            <div>STEREO</div>
                            <div>33⅓</div>
                        </div>

                        {/* 竖排唱片腰封主文案 */}
                        <div className="my-3 flex items-center gap-1 font-serif text-xs font-black tracking-[0.28em] text-[#FFFDF9] [writing-mode:vertical-rl]">
                            <span>小橘唱片 · 灵感限定盘</span>
                        </div>

                        {/* 底部唱片编号与定价 */}
                        <div className="w-full border-t border-white/30 pt-2 text-center font-mono text-[8px] leading-tight text-orange-100">
                            <div className="font-bold text-white">ODLP</div>
                            <div>{monthNum}{dayNum}</div>
                            <div className="mt-1 rounded-2xs bg-black/20 py-0.5 font-bold text-white">
                                ¥2,800
                            </div>
                        </div>
                    </div>

                    {/* 右侧：奶油色黑胶唱片封套与歌词内页 */}
                    <div className="relative flex flex-1 flex-col justify-between p-5 sm:p-6">
                        {/* 右上角探出的半枚仿真黑胶唱片盘面 SVG */}
                        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 opacity-95">
                            <svg viewBox="0 0 120 120" className="h-full w-full">
                                <circle cx="60" cy="60" r="56" fill="#23201E" />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="48"
                                    fill="none"
                                    stroke="#3D3834"
                                    strokeWidth="1"
                                />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="40"
                                    fill="none"
                                    stroke="#332E2A"
                                    strokeWidth="1"
                                />
                                <circle
                                    cx="60"
                                    cy="60"
                                    r="32"
                                    fill="none"
                                    stroke="#3D3834"
                                    strokeWidth="1"
                                />
                                {/* 唱片中心暖橘盘芯 */}
                                <circle cx="60" cy="60" r="20" fill="#EA580C" />
                                <circle cx="60" cy="60" r="16" fill="#FDF8EE" />
                                <circle cx="60" cy="60" r="4" fill="#FAF6EC" />
                            </svg>
                        </div>

                        {/* 唱片曲目顶栏 */}
                        <div className="relative z-10 border-b border-[#E5DCCB] pb-3 pr-16">
                            <div className="flex items-center gap-1.5 font-mono text-[10px] font-black tracking-widest text-[#D94E34]">
                                <span>SIDE A · TRACK 01</span>
                                <span>//</span>
                                <span>HI-FI ANALOG</span>
                            </div>
                            <div className="mt-1 font-serif text-xs font-bold text-[#5C4E41]">
                                {yearNum}.{monthNum}.{dayNum} · {weekdayName} 录音室母带
                            </div>
                        </div>

                        {/* 歌词本引文核心区 */}
                        <div className="relative z-10 my-auto py-5">
                            {/* 声波装饰条 */}
                            <div className="mb-3 flex items-center gap-1">
                                {[3, 7, 12, 6, 14, 9, 4, 11, 15, 8, 5, 10, 6, 3].map((h, i) => (
                                    <span
                                        key={i}
                                        className="w-1 rounded-full bg-[#D94E34]/65"
                                        style={{height: `${h}px`}}
                                    />
                                ))}
                                <span className="ml-2 font-mono text-[9px] font-bold tracking-widest text-[#9C8B7A]">
                                    LYRICS & LINER NOTES
                                </span>
                            </div>

                            <div
                                className={`break-words font-serif leading-relaxed text-[#28211B] ${
                                    isShort
                                        ? 'text-lg sm:text-xl font-semibold sm:leading-loose'
                                        : 'text-sm sm:text-base leading-relaxed'
                                }`}
                            >
                                <PosterMarkdown
                                    content={memo.content}
                                    blockquoteClassName="my-2 border-l-2 border-[#D94E34] pl-3 italic text-[#695645]"
                                    codeClassName="rounded bg-[#EFE8D8] px-1.5 py-0.5 font-mono text-xs text-[#B83B24]"
                                />
                            </div>

                            {memo.tag && (
                                <div className="mt-4">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-[#D94E34]/35 bg-[#FDF1EC] px-3 py-0.5 font-mono text-xs font-bold text-[#C8432B]">
                                        ♪ #{memo.tag}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* 底部黑胶播放进度条与制作人铭牌 */}
                        <div className="relative z-10 border-t border-[#E5DCCB] pt-3">
                            {/* 模拟播放器进度 */}
                            <div className="mb-2 flex items-center gap-2 font-mono text-[9px] text-[#8C7A68]">
                                <span>01:{dayNum}</span>
                                <div className="relative h-1 flex-1 rounded-full bg-[#E5DCCB]">
                                    <div className="h-full w-2/5 rounded-full bg-[#D94E34]" />
                                    <span className="absolute top-1/2 left-[40%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#D94E34] shadow-2xs" />
                                </div>
                                <span>03:45</span>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-[#6E5E4F]">
                                <span>
                                    PRODUCED BY <strong className="text-[#28211B]">{author || '小橘'}</strong>
                                </span>
                                <span className="font-mono text-[9px] text-[#9C8B7A]">
                                    ℗ {yearNum} O-DOC RECORDS
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 9: 东方花笺 (Oriental Bookplate - 宋锦海棠纹框、宣纸水墨与朱砂闲章)
     * ===================================================================== */
    if (styleId === 'shiori') {
        return (
            <div className="relative mx-auto w-full max-w-[426px] p-2 drop-shadow-[0_14px_28px_rgba(15,23,42,0.15)]">
                {/* 宣纸藏书票主体（无外层底图，纯宣纸笺本） */}
                <div
                    className="relative overflow-hidden rounded-xl border-2 border-[#4A706B] bg-[#FAF5E8] p-2"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 85% 82%, rgba(74,112,107,0.08) 0%, transparent 55%), linear-gradient(180deg, #FBF7EC 0%, #F4ECDA 100%)',
                    }}
                >
                    {/* 顶部藏书签黄铜穿孔与朱红流苏结装饰 */}
                    <div className="pointer-events-none absolute top-3 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center">
                        <div className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#B08D57] bg-[#FAF5E8] shadow-inner">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#B8332A]" />
                        </div>
                    </div>

                    {/* 内层宋锦海棠角花纹框 */}
                    <div className="relative border border-[#B09B7C] p-5 pt-7 sm:p-6 sm:pt-8">
                        {/* 四角中式回纹/海棠角花 SVG */}
                        {[
                            'top-1 left-1 rotate-0',
                            'top-1 right-1 rotate-90',
                            'bottom-1 right-1 rotate-180',
                            'bottom-1 left-1 -rotate-90',
                        ].map((pos, idx) => (
                            <svg
                                key={idx}
                                viewBox="0 0 24 24"
                                className={`pointer-events-none absolute h-5 w-5 text-[#4A706B] ${pos}`}
                                fill="none"
                            >
                                <path
                                    d="M1 1H15V4H4V15H1V1ZM6 6H12V8H8V12H6V6Z"
                                    fill="currentColor"
                                    opacity="0.75"
                                />
                            </svg>
                        ))}

                        {/* 远山水墨意境背景暗纹 SVG */}
                        <svg
                            viewBox="0 0 320 90"
                            className="pointer-events-none absolute inset-x-0 bottom-8 h-24 w-full text-[#4A706B]/[0.07]"
                            fill="currentColor"
                        >
                            <path d="M0 90 L0 58 Q45 25 95 52 T195 40 T280 55 L320 38 L320 90 Z" />
                            <path
                                d="M40 90 Q110 42 175 66 T320 50 L320 90 Z"
                                opacity="0.6"
                            />
                        </svg>

                        {/* 花笺天头：藏书票铭文 */}
                        <div className="relative z-10 flex items-center justify-between border-b border-[#D5C7B2] pb-3">
                            <div className="flex items-center gap-2">
                                <span className="rounded-xs bg-[#4A706B] px-1.5 py-0.5 font-serif text-[10px] font-bold tracking-widest text-[#FAF5E8]">
                                    浮生手札
                                </span>
                                <span className="font-serif text-xs font-bold tracking-[0.2em] text-[#2F3E3B]">
                                    小橘花笺藏书票
                                </span>
                            </div>
                            <span className="font-serif text-[11px] text-[#7A6B56]">
                                岁次 {yearNum} · {monthNum}月{dayNum}日
                            </span>
                        </div>

                        {/* 花笺正文区 */}
                        <div className="relative z-10 my-5 py-2">
                            {/* 古籍引首朱砂括号装饰 */}
                            <div className="mb-2 font-serif text-xs font-bold tracking-widest text-[#B8332A]">
                                「 卷目 · {memo.tag ? `#${memo.tag}` : '闲情偶寄'} 」
                            </div>

                            <div
                                className={`break-words font-serif leading-relaxed text-[#26201A] ${
                                    isShort
                                        ? 'text-lg sm:text-xl font-semibold sm:leading-loose'
                                        : 'text-sm sm:text-base leading-relaxed'
                                }`}
                            >
                                <PosterMarkdown
                                    content={memo.content}
                                    blockquoteClassName="my-2.5 border-l-2 border-[#4A706B] pl-3.5 italic text-[#4F4439]"
                                    codeClassName="rounded bg-[#EDE3CE] px-1.5 py-0.5 font-mono text-xs text-[#3B5E5A]"
                                />
                            </div>
                        </div>

                        {/* 花笺地脚：题跋署名与双朱砂闲章 */}
                        <div className="relative z-10 flex items-end justify-between border-t border-[#D5C7B2] pt-3.5">
                            <div className="flex flex-col text-left font-serif">
                                <span className="text-[10px] text-[#8C7B65]">
                                    {weekdayName} · {timeStr} 谨识于窗下
                                </span>
                                <span className="mt-0.5 text-sm font-bold tracking-wider text-[#2C241B]">
                                    {author || '小橘雅士'} 藏珍
                                </span>
                            </div>

                            {/* 双枚传统篆刻朱砂印章（白文方印 + 朱文腰圆印） */}
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 items-center rounded-full border border-[#B8332A] bg-[#FAF5E8] px-2 font-serif text-[9px] font-black tracking-widest text-[#B8332A]">
                                    吉光片羽
                                </div>
                                <div className="grid h-8 w-8 grid-cols-2 place-items-center rounded-2xs border border-[#A3241C] bg-[#B8332A] p-0.5 font-serif text-[8px] font-black leading-none text-[#FAF5E8] shadow-2xs">
                                    <span>小</span>
                                    <span>橘</span>
                                    <span>藏</span>
                                    <span>书</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* =====================================================================
     * 样式 10: 植物标本 (Botanical Herbarium - 自然博物志、手绘柑橘标本与分类签)
     * ===================================================================== */
    return (
        <div className="relative mx-auto w-full max-w-[436px] rounded-xl border-2 border-[#3A5A40]/75 bg-[#F6F4EC] p-3.5 text-[#1F2E23] shadow-2xl sm:p-4">
            {/* 博物档案馆双线内框 */}
            <div className="relative border border-[#95A892] bg-[#FAF8F1] p-4 sm:p-5">
                {/* 顶部厘米标尺刻度条 (Archival Metric Scale) */}
                <div className="mb-3 flex items-center justify-between border-b border-[#CBD5C5] pb-2 font-mono text-[9px] text-[#5F7464]">
                    <div className="flex items-center gap-2">
                        <span className="rounded-2xs bg-[#2D5A43] px-1.5 py-0.5 font-bold text-white">
                            HERBARIUM
                        </span>
                        <span className="font-bold tracking-widest text-[#2D5A43]">
                            FLORA OF MIND · 思维植物志
                        </span>
                    </div>
                    <span>SPECIMEN #{serialCode.slice(0, 6)}</span>
                </div>

                {/* 植物学二名法拉丁学名 + 右侧压制柑橘标本手绘插画 SVG */}
                <div className="relative mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#D8E0D2] bg-[#F1F5EE] p-3.5">
                    <div className="space-y-1 text-left">
                        <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#52796F]">
                            FAMILY: AURANTIACEAE · 芸香科闪念属
                        </div>
                        <div className="font-serif text-base font-black italic text-[#1B3B2B]">
                            Citrus idearum <span className="not-italic font-normal text-xs">L.</span>
                        </div>
                        <div className="text-[11px] font-semibold text-[#3A5A40]">
                            中文正名：{memo.tag ? `「${memo.tag}」变种` : '小橘常绿灵感木'}
                        </div>
                    </div>

                    {/* 手绘压花柑橘枝叶标本 SVG（附标本固定胶布条） */}
                    <div className="relative shrink-0 pr-1">
                        <svg viewBox="0 0 88 72" className="h-16 w-20" fill="none">
                            {/* 枝干 */}
                            <path
                                d="M12 64 Q 38 42, 74 12"
                                stroke="#5C4033"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                            />
                            {/* 叶片 1 */}
                            <path
                                d="M28 48 C 16 38, 18 20, 34 22 C 44 24, 40 42, 28 48 Z"
                                fill="#4F775A"
                                stroke="#2D5A43"
                                strokeWidth="1.2"
                            />
                            {/* 叶片 2 */}
                            <path
                                d="M48 36 C 56 46, 74 44, 72 30 C 70 20, 54 24, 48 36 Z"
                                fill="#6B9071"
                                stroke="#2D5A43"
                                strokeWidth="1.2"
                            />
                            {/* 压制小橘果实 */}
                            <circle
                                cx="52"
                                cy="20"
                                r="10"
                                fill="#EA580C"
                                stroke="#9A3412"
                                strokeWidth="1.2"
                            />
                            <circle cx="49" cy="17" r="2" fill="#FDBA74" />
                            {/* 标本固定胶布条 (Mounting Tape) */}
                            <rect
                                x="15"
                                y="50"
                                width="18"
                                height="5"
                                transform="rotate(-28 15 50)"
                                fill="#E6CCB2"
                                stroke="#B08968"
                                strokeWidth="0.7"
                            />
                        </svg>
                    </div>
                </div>

                {/* 野外采集观察记录正文区 */}
                <div className="relative my-3 rounded-xs border border-[#CED8C8] bg-[#FCFBF7] p-4 sm:p-5">
                    <div className="mb-2 flex items-center justify-between font-mono text-[9px] text-[#6B8070]">
                        <span>FIELD OBSERVATION NOTES // 形态与思绪描述</span>
                        <span>ALT. {contentLength}m</span>
                    </div>

                    <div
                        className={`break-words font-serif leading-relaxed text-[#1B2A20] ${
                            isShort
                                ? 'text-lg sm:text-xl font-medium sm:leading-loose'
                                : 'text-sm sm:text-base leading-relaxed'
                        }`}
                    >
                        <PosterMarkdown
                            content={memo.content}
                            blockquoteClassName="my-2 border-l-2 border-[#2D5A43] pl-3 italic text-[#3F5A48]"
                            codeClassName="rounded bg-[#E9EFE7] px-1.5 py-0.5 font-mono text-xs text-[#2D5A43]"
                        />
                    </div>
                </div>

                {/* 右下角标准博物馆植物标本签表格 (Museum Herbarium Label Grid) */}
                <div className="mt-4 border-2 border-[#2D5A43] bg-white text-[10px]">
                    <div className="flex items-center justify-between border-b border-[#2D5A43] bg-[#2D5A43] px-3 py-1 font-mono text-[9px] font-bold tracking-widest text-white">
                        <span>MUSEUM OF NATURAL THOUGHTS · 标本档案签</span>
                        <span>NO. {monthNum}-{dayNum}</span>
                    </div>
                    <div className="grid grid-cols-2 divide-x divide-[#B7C6B5] border-b border-[#B7C6B5]">
                        <div className="px-2.5 py-1.5">
                            <span className="font-mono text-[8px] font-bold text-[#6B8070]">
                                HABITAT / 采集生境:
                            </span>
                            <div className="truncate font-semibold text-[#1F2E23]">
                                #{memo.tag || '日常思想旷野'}
                            </div>
                        </div>
                        <div className="px-2.5 py-1.5">
                            <span className="font-mono text-[8px] font-bold text-[#6B8070]">
                                DATE / 采集日期:
                            </span>
                            <div className="font-mono font-bold text-[#1F2E23]">
                                {yearNum}.{monthNum}.{dayNum} ({weekdayName})
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                            <OrangeFruitIcon className="h-3.5 w-3.5" />
                            <span className="font-mono text-[9px] text-[#5F7464]">COLLECTOR:</span>
                            <span className="font-serif font-bold text-[#1F2E23]">
                                {author || '小橘博物学者'}
                            </span>
                        </div>
                        <span className="rounded-xs border border-[#2D5A43] px-1.5 py-0.2 font-mono text-[8px] font-black text-[#2D5A43]">
                            VERIFIED · 已鉴定
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
