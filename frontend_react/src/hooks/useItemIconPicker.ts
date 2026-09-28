import {useEffect, useState} from 'react';
import {getItemIcons, setInventoryIcon, uploadItemIcon} from '../api/itemIcons';
import type {ItemIcon} from '../types/api/itemIcons';
import type {InventoryItem} from '../types/api/travel';

export function useItemIconPicker(item: InventoryItem) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [icons, setIcons] = useState<ItemIcon[]>([]);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [selected, setSelected] = useState<string | null>(item.iconAssetId ?? null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [uploaded, setUploaded] = useState<ItemIcon | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true); setError('');
            void getItemIcons({search, itemId: item.id, page}, controller.signal).then(data => {
                if (controller.signal.aborted) return;
                setIcons(data.list); setTotal(data.total); setPageSize(data.pageSize); setPage(data.page);
            }).catch(e => {
                if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '图标加载失败');
            }).finally(() => {if (!controller.signal.aborted) setLoading(false);});
        }, 200);
        return () => {controller.abort(); window.clearTimeout(timer);};
    }, [item.id, search, page]);
    const upload = async (file: File, name: string) => {
        setBusy(true); setError('');
        try {
            const icon = await uploadItemIcon(file, name);
            setUploaded(icon); setSelected(icon.id);
            return true;
        } catch (e) {setError(e instanceof Error ? e.message : '上传失败，原图片保持不变'); return false;}
        finally {setBusy(false);}
    };
    const save = async () => {
        setBusy(true); setError('');
        try {await setInventoryIcon(item.id, selected); return true;}
        catch (e) {setError(e instanceof Error ? e.message : '设置失败，原图片保持不变'); return false;}
        finally {setBusy(false);}
    };
    return {search, setSearch, page, setPage, icons, total, pageSize, selected, setSelected, loading, busy, error, uploaded, upload, save};
}
