import {useState, type ReactNode} from 'react';
import AuthenticatedResourceImage, {type ImageFitMode} from '../common/AuthenticatedResourceImage';
import {isFarmItemIcon} from '../Farm/assets';

function BuiltinItemIcon({src, alt, fallback, className}: {src: string; alt: string; fallback: ReactNode; className: string}) {
    const [failed, setFailed] = useState(false);
    // 内置像素图标避免被强行拉伸或裁剪，保留原汁原味像素居中展示
    const cleanClassName = className
        .replace(/\bobject-cover\b/g, '')
        .replace(/\bh-full\b/g, 'max-h-full')
        .replace(/\bw-full\b/g, 'max-w-full')
        .trim();
    return failed ? (
        <>{fallback}</>
    ) : (
        <img
            src={src}
            alt={alt}
            className={`object-contain ${cleanClassName}`}
            style={{imageRendering: 'pixelated'}}
            onError={() => setFailed(true)}
        />
    );
}

/** 资源图标通过认证接口读取，保留原有占位及完整展示，支持满铺与圆角渲染。 */
export function ItemIconImage({
    src,
    alt,
    fallback,
    className = 'h-full w-full',
    imageClassName,
    fitMode,
}: {
    src?: string;
    alt: string;
    fallback: ReactNode;
    className?: string;
    imageClassName?: string;
    fitMode?: ImageFitMode;
}) {
    // 只有应用内置的已知像素素材使用普通图片，上传资源继续通过认证接口读取。
    if (src && isFarmItemIcon(src)) return <BuiltinItemIcon key={src} src={src} alt={alt} fallback={fallback} className={className}/>;
    const resourceId = src?.match(/^\/api\/resource\/(?:view|download)\/([^/?#]+)(?:[?#].*)?$/)?.[1];
    if (!resourceId) return <>{fallback}</>;

    const effectiveFitMode: ImageFitMode = fitMode || (className.includes('object-cover') ? 'cover' : 'contain');
    const hasFitClass = className.includes('object-cover') || className.includes('object-contain');
    const finalClassName = hasFitClass ? className : `${className} ${effectiveFitMode === 'cover' ? 'object-cover' : 'object-contain'}`;

    return (
        <AuthenticatedResourceImage
            resourceId={resourceId}
            alt={alt}
            className={finalClassName}
            imageClassName={imageClassName}
            fitMode={effectiveFitMode}
            fallback={fallback}
        />
    );
}

