import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import {getImagesByAnthology, type Image} from '../../src/api/image';
import ImageGroupModal from '../../src/components/ImageGallery/ImageGroupModal';
import {ToastProvider} from '../../src/components/common/ToastProvider';
import {localMode} from '../../src/config/development';
import {saveAuthToken} from '../../src/utils/authStorage';
import {worker} from '../../src/mocks/browser';
import {localImageCollectionId, localImageGroupId} from '../../src/mocks/imageGallery/groupRoutes';

function Fixture() {
    const [images, setImages] = useState<Image[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState(false);
    const load = () => {
        setLoading(true);
        setFailed(false);
        void getImagesByAnthology(localImageCollectionId).then(setImages).catch(() => setFailed(true)).finally(() => setLoading(false));
    };
    useEffect(load, []);
    const group = images.filter(image => image.photoGroupId === localImageGroupId);
    return <ToastProvider><main className="p-6">
        <h1>图片组本地验收</h1>
        {loading ? <p>正在加载照片</p> : failed ? <p>照片加载失败</p> : !images.length ? <p>暂无照片</p> : <>
            <p>照片数量：{images.length}</p>
            <button onClick={() => setOpen(true)}>编辑本地拍摄组</button>
            <ImageGroupModal isOpen={open} collId={localImageCollectionId} initialImages={group}
                onClose={() => setOpen(false)} onSuccess={load}/>
        </>}
    </main></ToastProvider>;
}

if (!localMode) throw new Error('图片组验收页只能在纯 local 模式运行');
saveAuthToken('local-demo-token', false);
await worker.start({onUnhandledRequest: 'bypass'});
createRoot(document.getElementById('root')!).render(<Fixture/>);
