import {cavePortraitFrame,caveProfiles,caveSize} from '../animation/cavePixels/caveTypes';
import type {CaveMonsterId} from '../animation/cavePixels/caveTypes';
import bat from '../../../assets/combat/atlas-cave-bat-idle.png';
import lizard from '../../../assets/combat/atlas-cave-crystal-lizard-idle.png';
import beast from '../../../assets/combat/atlas-moss-beast-idle.png';
import king from '../../../assets/combat/atlas-moss-king-idle.png';
const portraits:Record<CaveMonsterId,string>={'monster.cave_bat':bat,'monster.cave_crystal_lizard':lizard,'monster.moss_beast':beast,'monster.moss_king':king};
export function StaticCavePortrait({monsterId,inHabitat}:{monsterId:CaveMonsterId;inHabitat:boolean}) {
    const frame=cavePortraitFrame,scale=frame.habitatScale*caveSize(caveProfiles[monsterId].key);
    const framing=inHabitat?{position:'absolute' as const,left:'50%',transform:'translateX(-50%)',
        top:`${100*(.74-frame.height*frame.ground*scale/420)}%`,width:`${100*frame.width*scale/640}%`,height:`${100*frame.height*scale/420}%`}
        :{width:'100%',height:'100%'};
    return <img src={portraits[monsterId]} alt="" draggable={false} className="object-contain" style={{...framing,imageRendering:'pixelated'}}/>;
}
