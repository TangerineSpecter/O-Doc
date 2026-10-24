import {equipmentArtLayers} from './equipmentArtDrawing';

export function EquipmentRedesignArt({equipmentId,className=''}:{equipmentId:string;className?:string}) {
    const layers=equipmentArtLayers(equipmentId);
    return <svg viewBox="0 0 48 48" className={className} aria-hidden="true" shapeRendering="crispEdges" data-equipment-pixel-version="2">
        {layers?.map((layer,index)=><path key={index} fill={layer.color} d={[...layer.pixels].map(key=>{const [x,y]=key.split(',');return `M${x} ${y}h1v1h-1z`;}).join('')}/>)}
    </svg>;
}
