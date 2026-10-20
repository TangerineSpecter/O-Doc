import {useEffect, useRef, useState} from 'react';
import {uploadResource} from '@/api/resources';
import {getImageUploadConfig} from '@/api/setting';
import {imageExceedsUploadLimit} from '@/utils/imageUpload';

export function usePortraitReference() {
    const [reference, setReference] = useState<{id: string; name: string; url: string} | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const alive = useRef(true);
    const lock = useRef(false);
    useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
    useEffect(() => () => {if (reference) URL.revokeObjectURL(reference.url);}, [reference]);
    const upload = async (file: File) => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片');
            const limits = await getImageUploadConfig();
            if (!alive.current) return;
            if (file.size > Math.min(limits.maxFileSizeMb, 20) * 1024 * 1024) throw new Error(`参考图不能超过 ${Math.min(limits.maxFileSizeMb, 20)} MB`);
            const bitmap = await createImageBitmap(file);
            const exceeds = imageExceedsUploadLimit({width: bitmap.width, height: bitmap.height, fileSize: file.size}, limits);
            bitmap.close();
            if (exceeds) throw new Error(`请将图片长边缩小至 ${limits.maxLongEdge} 像素以内`);
            if (!alive.current) return;
            const result = await uploadResource(file, 'agent_art');
            if (alive.current) setReference({id: result.id, name: file.name, url: URL.createObjectURL(file)});
        } catch (err) {
            if (alive.current) setError(err instanceof Error ? err.message : '参考图上传失败，请重试');
        } finally {
            lock.current = false;
            if (alive.current) setBusy(false);
        }
    };
    return {reference, busy, error, upload, clear: () => {setReference(null); setError('');}};
}
