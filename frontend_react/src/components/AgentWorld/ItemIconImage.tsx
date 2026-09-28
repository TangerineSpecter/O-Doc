import type {ReactNode} from 'react';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';

/** 资源图标通过认证接口读取，保留原有占位及完整居中展示。 */
export function ItemIconImage({src, alt, fallback, className = 'h-full w-full'}: {
    src?: string; alt: string; fallback: ReactNode; className?: string;
}) {
    const resourceId = src?.match(/^\/api\/resource\/(?:view|download)\/([^/?#]+)(?:[?#].*)?$/)?.[1];
    if (!resourceId) return <>{fallback}</>;
    return <AuthenticatedResourceImage resourceId={resourceId} alt={alt}
        className={`${className} object-contain`} fitMode="contain" fallback={fallback}/>;
}
