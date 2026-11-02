import DiaryMetadata from './DiaryMetadata';
import DiaryGallery from './DiaryGallery';
import DiaryPhoto from './DiaryPhoto';
import type {DiaryEntry} from '../../types/api/diary';
export default function DiaryCard({entry, onOpen, timeline = false}: {entry: DiaryEntry; onOpen: () => void; timeline?: boolean}) {
    return <button onClick={onOpen} className={`diary-card group w-full overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-colors hover:border-orange-200 focus-visible:outline-orange-500 ${timeline ? '' : 'h-full'}`}>
        {!timeline && entry.coverUrl && <div className="relative"><DiaryPhoto assetId={entry.coverAssetId} url={entry.coverUrl} className="aspect-[4/3] w-full object-cover"/>{entry.imageAssetIds.length > 1 && <span className="absolute bottom-3 right-3 rounded-md bg-slate-900/70 px-2 py-1 text-xs text-white">{entry.imageAssetIds.length} 张图片</span>}</div>}
        <div className="p-6"><div className="mb-3 flex items-center gap-3"><time className="text-xs text-slate-500">{entry.entryDate.replace(/-/g, '.')}</time></div>
            <h2 className="break-words text-lg font-bold text-slate-900 group-hover:text-orange-600">{entry.title}</h2>
            <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600 ${timeline ? 'line-clamp-4' : 'line-clamp-3'}`}>{entry.content}</p>
            {timeline && <DiaryGallery ids={entry.imageAssetIds} legacyUrl={entry.coverUrl} compact/>}
            <DiaryMetadata entry={entry}/>
        </div>
    </button>;
}
