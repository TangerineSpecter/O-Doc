import {EquipmentPixelPainter} from './equipmentPixelPainter';
import {equipmentPalette} from './equipmentArtPalette';
import {equipmentArtProfile} from './equipmentArtProfile';
import {drawEquipmentArmor} from './equipmentArmorArt';
import {drawInstrument} from './equipmentInstrumentArt';
import {drawEquipmentHead} from './equipmentHeadArt';
import {drawEquipmentRelic} from './equipmentRelicArt';
import {drawRedesignedAxe, drawRedesignedDagger, drawRedesignedSword} from './equipmentBladeArt';
import {drawRedesignedBow, drawRedesignedGrandStaff, drawRedesignedMageStaff} from './equipmentBowStaffArt';

const cache=new Map<string,ReturnType<typeof buildEquipmentArt>>();
function buildEquipmentArt(id:string) {
    const profile=equipmentArtProfile(id);
    if(!profile)return undefined;
    const painter=new EquipmentPixelPainter();
    const family=(profile.kind==='armor'||profile.kind==='head')?profile.family:profile.kind==='shield'&&profile.style==='small'?'leather':'plate';
    const tier='tier' in profile?profile.tier:0;
    const palette=equipmentPalette(family,tier);
    if(profile.kind==='armor')drawEquipmentArmor(painter,palette,profile.family,profile.slot,profile.tier);
    else if(profile.kind==='head')drawEquipmentHead(painter,palette,profile.family,profile.tier);
    else if(profile.kind==='instrument')drawInstrument(painter,palette,profile.tier,profile.element);
    else if(profile.kind==='weapon') {
        if(profile.weapon==='sword')drawRedesignedSword(painter,profile.element,profile.refined);
        else if(profile.weapon==='axe')drawRedesignedAxe(painter,profile.element,profile.refined);
        else if(profile.weapon==='dagger')drawRedesignedDagger(painter,profile.element,profile.refined);
        else if(profile.weapon==='bow')drawRedesignedBow(painter,profile.element,profile.refined);
        else if(profile.weapon==='mage_staff')drawRedesignedMageStaff(painter,profile.element,profile.refined);
        else drawRedesignedGrandStaff(painter,profile.weapon,profile.element);
    }
    else drawEquipmentRelic(painter,palette,profile);
    // Flatten overpaint once; tiny icons need only one SVG path per visible colour.
    const pixels=new Map<string,string>();
    for(const layer of painter.layers)for(const key of layer.pixels)pixels.set(key,layer.color);
    const colors=new Map<string,Set<string>>();
    for(const [key,color] of pixels) {
        if(!colors.has(color))colors.set(color,new Set());
        colors.get(color)!.add(key);
    }
    return [...colors].map(([color,points])=>({color,pixels:points}));
}
export function equipmentArtLayers(id:string) {
    if(!cache.has(id))cache.set(id,buildEquipmentArt(id));
    return cache.get(id);
}
