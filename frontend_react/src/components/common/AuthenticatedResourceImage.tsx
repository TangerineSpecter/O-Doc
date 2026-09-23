import {useEffect, useState} from 'react';
import {ImageOff} from 'lucide-react';
import {downloadResource} from '../../api/resources';

interface Props {
    resourceId: string;
    alt: string;
    className?: string;
    loading?: 'eager' | 'lazy';
    draggable?: boolean;
}

export default function AuthenticatedResourceImage({resourceId, alt, className = '', loading = 'lazy', draggable = false}: Props) {
    const [result, setResult] = useState<{resourceId: string; objectUrl: string; failed: boolean}>({resourceId: '', objectUrl: '', failed: false});

    useEffect(() => {
        let active = true;
        let nextObjectUrl = '';

        void downloadResource(resourceId)
            .then(blob => {
                if (!active) return;
                nextObjectUrl = URL.createObjectURL(blob);
                setResult({resourceId, objectUrl: nextObjectUrl, failed: false});
            })
            .catch(() => {
                if (active) setResult({resourceId, objectUrl: '', failed: true});
            });

        return () => {
            active = false;
            if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
        };
    }, [resourceId]);

    const objectUrl = result.resourceId === resourceId ? result.objectUrl : '';
    const failed = result.resourceId === resourceId && result.failed;
    if (!objectUrl) {
        return (
            <div className={`${className} flex items-center justify-center bg-slate-50 text-slate-300`} role={failed ? 'img' : undefined} aria-label={failed ? `${alt}加载失败` : undefined}>
                {failed ? <ImageOff className="h-6 w-6"/> : <span className="h-5 w-5 animate-pulse rounded-md bg-slate-200"/>}
            </div>
        );
    }

    return <img src={objectUrl} alt={alt} className={className} loading={loading} draggable={draggable}/>;
}
