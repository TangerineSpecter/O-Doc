import {useEffect, useRef, useState, type RefObject} from 'react';
import type {FarmSelection, FarmState} from '../../types/api/farm';
import {FarmSceneRenderer} from './scene/FarmSceneRenderer';
import {toSceneState} from './scene/sceneModel';

/**
 * 把农场数据同步到像素画布：画布控制器随组件挂载创建、卸载释放；
 * 数据变化时重新转换并推送，点选回调始终取最新的 onSelect。
 * 创建失败（如浏览器不支持 Canvas 2D）时返回 failed，由调用方展示降级提示并通过 retry 重试。
 */
export function useFarmSceneRenderer(canvasRef: RefObject<HTMLCanvasElement | null>, boxRef: RefObject<HTMLElement | null>, farm: FarmState, onSelect: (value: FarmSelection) => void) {
    const renderer = useRef<FarmSceneRenderer | null>(null);
    const latest = useRef({farm, onSelect});
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => { latest.current = {farm, onSelect}; });
    useEffect(() => {
        const canvas = canvasRef.current, box = boxRef.current;
        if (!canvas || !box) return;
        let scene: FarmSceneRenderer | null = null;
        try {
            scene = new FarmSceneRenderer(canvas, box, value => latest.current.onSelect(value));
            scene.setState(toSceneState(latest.current.farm));
        } catch (error) {
            console.error('像素农场场景初始化失败', error);
            scene?.dispose();
            queueMicrotask(() => setFailed(true));
            return;
        }
        renderer.current = scene;
        return () => { scene?.dispose(); renderer.current = null; };
    }, [canvasRef, boxRef, attempt]);
    useEffect(() => {
        try { renderer.current?.setState(toSceneState(farm)); } catch (error) { console.error('像素农场场景刷新失败', error); }
    }, [farm]);
    return {failed, retry: () => { setFailed(false); setAttempt(v => v + 1); }};
}
