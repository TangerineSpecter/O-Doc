import {useEffect, useRef, useState} from 'react';
import {useToast} from '@/components/common/ToastProvider';
import {decodeAppearancePackage, encodeAppearancePackage} from './appearancePackage';
import type {AppearancePackageDraft} from './appearancePackage';

export function useAppearancePackage(name: string, getDraft: () => Promise<AppearancePackageDraft>, install: (draft: AppearancePackageDraft, isCurrent: () => boolean) => Promise<void>) {
    const [transferring, setTransferring] = useState(false);
    const inFlight = useRef(false);
    const alive = useRef(true);
    const toast = useToast();
    useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
    const run = async (operation: () => Promise<void>) => {
        if (inFlight.current) return;
        inFlight.current = true; setTransferring(true);
        try {await operation();} catch (error) {if (alive.current) toast.error(error instanceof Error ? error.message : '形象包操作失败');}
        finally {inFlight.current = false; if (alive.current) setTransferring(false);}
    };
    const exportPackage = () => run(async () => {
        const blob = await encodeAppearancePackage(await getDraft());
        if (!alive.current) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `${name.replace(/[\\/:*?"<>|]/g, '_')}-战斗形象.battle-appearance.json`;
        document.body.appendChild(link); link.click(); link.remove();
        // Let the browser start consuming the download before releasing it.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast.success('已导出角色素材及双手、武器布局');
    });
    const importPackage = (file?: File) => file && run(async () => {
        const draft = await decodeAppearancePackage(file);
        if (!alive.current) return;
        await install(draft, () => alive.current);
        if (alive.current) toast.success('形象包已还原到编辑器，请检查后保存；实际职业与装备仍使用目标 Agent 的配置');
    });
    return {transferring, exportPackage, importPackage};
}
