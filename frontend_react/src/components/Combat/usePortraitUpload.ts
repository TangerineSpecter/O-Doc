import {useEffect, useRef, useState} from 'react';
import {uploadResource} from '@/api/resources';
import {getImageUploadConfig} from '@/api/setting';
import {imageExceedsUploadLimit} from '@/utils/imageUpload';

export interface UploadedPortraitAsset {
    assetId: string;
    name: string;
}

export function usePortraitUpload() {
    const [uploaded, setUploaded] = useState<UploadedPortraitAsset | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const alive = useRef(true);
    const lock = useRef(false);

    useEffect(() => {
        alive.current = true;
        return () => {alive.current = false;};
    }, []);

    const upload = async (file: File): Promise<UploadedPortraitAsset | null> => {
        if (lock.current) return null;
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            const extensionAllowed = /\.(png|jpe?g|webp)$/i.test(file.name);
            const mimeAllowed = !file.type || ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
            if (!extensionAllowed || !mimeAllowed) throw new Error('请选择 PNG、JPEG 或 WebP 图片');

            const limits = await getImageUploadConfig();
            if (!alive.current) return null;
            const maxFileSizeMb = Math.min(limits.maxFileSizeMb, 20);
            if (file.size > maxFileSizeMb * 1024 * 1024) throw new Error(`立绘图片不能超过 ${maxFileSizeMb} MB`);

            const bitmap = await createImageBitmap(file);
            const exceeds = imageExceedsUploadLimit(
                {width: bitmap.width, height: bitmap.height, fileSize: file.size},
                {...limits, maxFileSizeMb},
            );
            bitmap.close();
            if (exceeds) throw new Error(`请将图片长边缩小至 ${limits.maxLongEdge} 像素以内`);
            if (!alive.current) return null;

            const result = await uploadResource(file, 'agent_art');
            if (!alive.current) return null;
            if (result.type !== 'image') throw new Error('这张图在资源库中被识别为非图片文件，无法作为冒险立绘');
            const asset = {assetId: result.id, name: file.name};
            setUploaded(asset);
            return asset;
        } catch (err) {
            if (alive.current) setError(err instanceof Error ? err.message : '立绘上传失败，请重试');
            return null;
        } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
        }
    };

    return {uploaded, busy, error, upload, clear: () => {setUploaded(null); setError('');}};
}
