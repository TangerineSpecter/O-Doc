import {useState, type ReactNode} from 'react';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import {isFarmItemIcon} from '../Farm/assets';

function BuiltinItemIcon({src, alt, fallback, className}: {src: string; alt: string; fallback: ReactNode; className: string}) {
    const [failed, setFailed] = useState(false);
    return failed ? <>{fallback}</> : <img src={src} alt={alt} className={`${className} object-contain`} style={{imageRendering: 'pixelated'}} onError={()=>setFailed(true)}/>;
}

/** 资源图标通过认证接口读取，保留原有占位及完整居中展示。 */
export function ItemIconImage({src, alt, fallback, className = 'h-full w-full'}: {
    src?: string; alt: string; fallback: ReactNode; className?: string;
}) {
    // 只有应用内置的已知像素素材使用普通图片，上传资源继续通过认证接口读取。
    if (src && isFarmItemIcon(src)) return <BuiltinItemIcon key={src} src={src} alt={alt} fallback={fallback} className={className}/>;
    const resourceId = src?.match(/^\/api\/resource\/(?:view|download)\/([^/?#]+)(?:[?#].*)?$/)?.[1];
    if (!resourceId) return <>{fallback}</>;
    return <AuthenticatedResourceImage resourceId={resourceId} alt={alt}
        className={`${className} object-contain`} fitMode="contain" fallback={fallback}/>;
}
