import {useEffect,useState} from 'react';
import type {AgentBattleAppearance} from '@/types/api/setting';
import {downloadResource} from '@/api/resources';
import {getAgentBattleAppearance} from '@/api/setting';
import {PixelArtSlice} from '@/components/Combat/atlas/PixelArtSlice';
import {identityParts} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';

export function BattleAppearanceEntry({agentId,appearance,onClick}:{agentId:string;appearance?:AgentBattleAppearance|null;onClick:()=>void}) {
    const [imageUrl,setImageUrl]=useState('');
    const [configured,setConfigured]=useState(Boolean(appearance?.characterAssetId||appearance?.headAssetId));
    useEffect(()=>{
        setImageUrl('');
        let resourceId=appearance?.characterAssetId||appearance?.headAssetId||'';
        let alive=true;let objectUrl='';
        void (async()=>{
            if(!resourceId){
                const saved=await getAgentBattleAppearance(agentId);
                if('version'in saved){resourceId=saved.characterAssetId||saved.headAssetId||'';if(alive)setConfigured(Boolean(resourceId));}
            } else setConfigured(true);
            if(!alive)return;
            if(!resourceId){setImageUrl('');setConfigured(false);return;}
            const blob=await downloadResource(resourceId);
            if(!alive)return;objectUrl=URL.createObjectURL(blob);setImageUrl(objectUrl);
        })().catch(()=>{if(alive){setImageUrl('');setConfigured(false);}});
        return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
    },[agentId,appearance?.characterAssetId,appearance?.headAssetId]);
    return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/70 px-2.5 text-xs font-semibold text-orange-800 transition-colors hover:border-orange-300 hover:bg-orange-100" title="编辑战斗形象">
        <span className="relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-lg border border-orange-200 bg-[conic-gradient(#e2e8f0_25%,white_0_50%,#e2e8f0_0_75%,white_0)] [background-size:8px_8px]">
            {imageUrl?<img src={imageUrl} alt="战斗形象缩略图" className="h-full w-full object-contain [image-rendering:pixelated]"/>:<PixelArtSlice region={identityParts.head}/>}
        </span>
        <span>战斗形象</span><span className="hidden text-[10px] font-medium text-orange-600/75 sm:inline">{configured?'已配置':'默认'}</span>
    </button>;
}
