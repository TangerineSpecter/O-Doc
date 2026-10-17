import {useRef} from 'react';
import type {FarmSelection, FarmState} from '../../types/api/farm';
import {FarmSceneHud} from './FarmSceneHud';
import {useFarmSceneRenderer} from './useFarmSceneRenderer';
import './FarmCanvas.css';

/** 像素农场场景：324×216 逻辑像素的 Canvas，整数倍缩放；点选地块、动物与建筑通过 onSelect 通知上层。 */
export function FarmCanvas({farm, onSelect}: {farm: FarmState; onSelect: (value: FarmSelection) => void}) {
    const box = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
    const {failed, retry} = useFarmSceneRenderer(canvas, box, farm, onSelect);
    return <div className="farm-canvas-space">
        <div className="farm-canvas-frame overflow-hidden rounded-2xl border border-lime-200/80 bg-[#b9dc8c] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]">
            <div ref={box} className="absolute inset-0 flex items-center justify-center">
                <canvas ref={canvas} role="img" aria-label="像素农场地图；地块与动物详情也可通过下方列表查看"/>
            </div>
            {failed ? <div className="absolute inset-0 flex items-center justify-center bg-lime-50/95 text-sm text-lime-800">
                <div className="text-center">像素场景加载失败，仍可查看下方农场状态。<br/><button className="mt-3 rounded-lg bg-white px-4 py-2" onClick={retry}>重新加载场景</button></div>
            </div> : <FarmSceneHud farm={farm}/>}
        </div>
    </div>;
}
