import DiaryPhoto from './DiaryPhoto';
export default function DiaryGallery({ids, legacyUrl = '', compact = false}: {ids: string[]; legacyUrl?: string; compact?: boolean}) {
    if (!ids.length) return legacyUrl ? <DiaryPhoto assetId={null} url={legacyUrl} className="mt-5 max-h-[65vh] w-full rounded-xl object-contain"/> : null;
    const shown = compact ? ids.slice(0, 4) : ids;
    return <div className={`mt-5 grid gap-2 ${ids.length === 1 ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3'}`}>{shown.map((id, index) => <div key={id} className="relative overflow-hidden rounded-xl"><DiaryPhoto assetId={id} url="" className={ids.length === 1 ? 'max-h-[65vh] w-full object-contain' : 'aspect-square w-full object-cover'}/>{compact && index === 3 && ids.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-slate-900/45 text-xl font-bold text-white">+{ids.length - 4}</span>}</div>)}</div>;
}
