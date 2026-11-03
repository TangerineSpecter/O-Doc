import {Expand, Sparkles} from 'lucide-react';
import DiaryPhoto from './DiaryPhoto';
import type {InlinePhotoGroup} from './diaryReaderContent';

export default function DiaryInlinePhotos({groups, onSelect}: {
    groups?: InlinePhotoGroup[]; onSelect: (index: number) => void;
}) {
    return <>{groups?.map(group => group.type === 'single' ? (
        <div key={group.items[0].globalIndex} className="my-9 overflow-hidden rounded-2xl border border-black/[0.06] bg-zinc-50/80 shadow-2xs group text-left">
            <button type="button" aria-label={`查看日记图片 ${group.items[0].globalIndex + 1}`}
                onClick={() => onSelect(group.items[0].globalIndex)} className="block w-full overflow-hidden relative cursor-zoom-in text-left">
                <DiaryPhoto assetId={group.items[0].assetId} url=""
                    className="w-full aspect-[21/9] sm:aspect-[24/10] object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02]"/>
                <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-950/70 px-3 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"><Expand size={12}/>全屏查看</span>
            </button>
            <div className="px-4 py-2.5 bg-zinc-50/90 text-xs text-zinc-500 flex items-center justify-between border-t border-black/[0.04]">
                <span className="flex items-center gap-1.5 font-medium"><Sparkles size={11} className="text-amber-500"/>生活切片 · 图 {group.items[0].globalIndex + 1}</span>
                <span className="text-[11px] text-zinc-400 font-num">点击照片开启沉浸灯箱</span>
            </div>
        </div>
    ) : (
        <div key={group.items[0].globalIndex} className="my-9 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-left">
            {group.items.map(item => (
                <div key={item.assetId} className="overflow-hidden rounded-2xl border border-black/[0.06] bg-zinc-50/80 shadow-2xs group text-left">
                    <button type="button" aria-label={`查看日记图片 ${item.globalIndex + 1}`} onClick={() => onSelect(item.globalIndex)}
                        className="block w-full overflow-hidden relative cursor-zoom-in text-left">
                        <DiaryPhoto assetId={item.assetId} url=""
                            className="w-full aspect-[16/10] object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"/>
                        <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-zinc-950/70 px-2.5 py-0.5 text-[11px] text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"><Expand size={11}/>大图</span>
                    </button>
                    <div className="px-3.5 py-2 text-xs text-zinc-500 bg-zinc-50/90 text-center border-t border-black/[0.04]">对开细节 · 图 {item.globalIndex + 1}</div>
                </div>
            ))}
        </div>
    ))}</>;
}
