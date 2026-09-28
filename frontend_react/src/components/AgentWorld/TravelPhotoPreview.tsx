import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import {useToast} from '../common/ToastProvider';

export default function TravelPhotoPreview({imageUrl}: {imageUrl?: string}) {
    const toast = useToast();
    const resourceId = imageUrl?.match(/^\/api\/resource\/view\/([^/?#]+)$/)?.[1];
    if (!resourceId || !imageUrl) return null;
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(`![旅行场景照](${imageUrl})`);
            toast.success('已复制图片 Markdown，可插入日记');
        } catch {
            toast.error('复制失败，请从资源库插入图片');
        }
    };
    return <div className="mt-3 space-y-2">
        <AuthenticatedResourceImage resourceId={resourceId} alt="已生成的旅行场景照" className="max-h-64 w-full rounded-xl object-contain"/>
        <button type="button" className="text-xs text-orange-600 hover:text-orange-700" onClick={() => void copy()}>复制图片 Markdown</button>
    </div>;
}
