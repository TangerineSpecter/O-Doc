import {useEffect,useState} from 'react';
import {downloadResource} from '@/api/resources';
import {getAgentBattleAppearance} from '@/api/setting';
import {PixelArtSlice} from '@/components/Combat/atlas/PixelArtSlice';
import {identityParts} from '@/components/Combat/animation/playerAppearance/layeredPlayerArt';

export function BattleAppearanceEntry({agentId,headAssetId,onClick}:{agentId:string;headAssetId?:string;onClick:()=>void}) {
    const [imageUrl,setImageUrl]=useState('');
    useEffect(()=>{
        let resourceId=headAssetId;
        let alive=true;let objectUrl='';
        void (async()=>{
            if(!resourceId){const appearance=await getAgentBattleAppearance(agentId);resourceId='headAssetId'in appearance?appearance.headAssetId:'';}
            if(!resourceId||!alive)return;
            const blob=await downloadResource(resourceId);
            if(!alive)return;objectUrl=URL.createObjectURL(blob);setImageUrl(objectUrl);
        })().catch(()=>{if(alive)setImageUrl('');});
        return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
    },[agentId,headAssetId]);
    return <button type="button" onClick={onClick} className="inline-flex h-9 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/70 px-2.5 text-xs font-semibold text-orange-800 transition-colors hover:border-orange-300 hover:bg-orange-100" title="编辑战斗头部形象">
        <span className="relative grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-lg border border-orange-200 bg-[conic-gradient(#e2e8f0_25%,white_0_50%,#e2e8f0_0_75%,white_0)] [background-size:8px_8px]">
            {imageUrl?<img src={imageUrl} alt="战斗头部缩略图" className="h-full w-full object-contain [image-rendering:pixelated]"/>:<PixelArtSlice region={identityParts.head}/>}
        </span>
        <span>战斗形象</span><span className="hidden text-[10px] font-medium text-orange-600/75 sm:inline">{headAssetId?'已配置':'默认'}</span>
    </button>;
}
