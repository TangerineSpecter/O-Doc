import {useEffect, useRef, useState} from 'react';

import {uploadResource} from '@/api/resources';
import {useToast} from '../../common/ToastProvider';

export const useAgentAvatarUpload = (onUploaded: (avatarUrl: string) => void) => {
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('');
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const avatarPreviewObjectUrlRef = useRef<string | null>(null);
    const toast = useToast();

    const clearAvatarPreview = () => {
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

    useEffect(() => () => {
        if (avatarPreviewObjectUrlRef.current) {
            URL.revokeObjectURL(avatarPreviewObjectUrlRef.current);
        }
    }, []);

    const handleAvatarUpload = async (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.warning('请选择图片文件作为头像');
            return;
        }

        setAvatarUploading(true);
        const localPreviewUrl = URL.createObjectURL(file);
        try {
            const response = await uploadResource(file, 'image');
            onUploaded(`/api/resource/view/${response.id}`);
            setLocalAvatarPreview(localPreviewUrl);
            toast.success('头像已上传');
        } catch {
            URL.revokeObjectURL(localPreviewUrl);
            toast.error('头像上传失败');
        } finally {
            setAvatarUploading(false);
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
