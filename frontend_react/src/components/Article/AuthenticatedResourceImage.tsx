import {useEffect, useState} from 'react';
import type {ImgHTMLAttributes} from 'react';

import {downloadResource} from '../../api/resources';

export function getPreviewResourceId(src: string): string | null {
    const match = /^\/api\/resource\/view\/([A-Za-z0-9_-]+)$/.exec(src);
    return match?.[1] || null;
}

interface Props extends ImgHTMLAttributes<HTMLImageElement> {
    resourceId: string;
}

export default function AuthenticatedResourceImage({resourceId, alt, ...props}: Props) {
    const [blobUrl, setBlobUrl] = useState('');
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        let createdUrl = '';
        setBlobUrl('');
        setFailed(false);

        void downloadResource(resourceId, controller.signal)
            .then(blob => {
                if (controller.signal.aborted) return;
                createdUrl = URL.createObjectURL(blob);
                setBlobUrl(createdUrl);
            })
            .catch(() => {
                if (!controller.signal.aborted) setFailed(true);
            });

        return () => {
            controller.abort();
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [resourceId]);

    if (failed) return <span role="img" aria-label={alt || '图片加载失败'}>图片加载失败</span>;
    if (!blobUrl) return <span role="status">图片加载中…</span>;
    return <img {...props} src={blobUrl} alt={alt || '文章图片'}/>;
}
