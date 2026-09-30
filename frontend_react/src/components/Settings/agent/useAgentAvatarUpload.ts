import {useEffect, useRef, useState} from 'react';

import {uploadResource} from '@/api/resources';
import {isImageUploadFile} from '@/utils/imageUpload';
import {useToast} from '../../common/ToastProvider';

export const useAgentAvatarUpload = (onUploaded: (avatarUrl: string) => void, label = '头像') => {
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const avatarPreviewObjectUrlRef = useRef<string | null>(null);
    const toast = useToast();
    const uploadVersion = useRef(0);
    const mounted = useRef(true);
    const uploadInFlight = useRef(false);

    const clearAvatarPreview = () => {
        uploadVersion.current += 1;
        if (avatarPreviewObjectUrlRef.current) {
            URL.revokeObjectURL(avatarPreviewObjectUrlRef.current);
            avatarPreviewObjectUrlRef.current = null;
        }
        setAvatarPreviewUrl('');
    };

    const setLocalAvatarPreview = (url: string) => {
        clearAvatarPreview();
        avatarPreviewObjectUrlRef.current = url;
        setAvatarPreviewUrl(url);
    };

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            uploadVersion.current += 1;
            if (avatarPreviewObjectUrlRef.current) URL.revokeObjectURL(avatarPreviewObjectUrlRef.current);
        };
    }, []);

    const handleAvatarUpload = async (file?: File) => {
        if (!file || uploadInFlight.current) return;
        if (!isImageUploadFile(file)) {
            toast.warning(`请选择图片文件作为${label}`);
            return;
        }

        setAvatarUploading(true);
        uploadInFlight.current = true;
        const version = ++uploadVersion.current;
        const localPreviewUrl = URL.createObjectURL(file);
        try {
            const response = await uploadResource(file, 'image');
            if (!mounted.current || version !== uploadVersion.current) {
                URL.revokeObjectURL(localPreviewUrl);
                return;
            }
            onUploaded(`/api/resource/view/${response.id}`);
            setLocalAvatarPreview(localPreviewUrl);
            toast.success(`${label}已上传`);
        } catch {
            URL.revokeObjectURL(localPreviewUrl);
            if (mounted.current && version === uploadVersion.current) toast.error(`${label}上传失败`);
        } finally {
            uploadInFlight.current = false;
            if (mounted.current) setAvatarUploading(false);
            if (avatarInputRef.current) avatarInputRef.current.value = '';
        }
    };

    return {
        avatarInputRef,
        avatarPreviewUrl,
        avatarUploading,
        clearAvatarPreview,
        handleAvatarUpload,
    };
};
