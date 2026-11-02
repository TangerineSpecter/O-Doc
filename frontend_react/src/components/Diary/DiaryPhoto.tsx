import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
export default function DiaryPhoto({assetId, url, className = ''}: {assetId: string | null; url: string; className?: string}) {
    if (assetId) return <AuthenticatedResourceImage resourceId={assetId} alt="日记配图" className={className}/>;
    return url ? <img src={url} alt="日记配图" loading="lazy" className={className}/> : null;
}
