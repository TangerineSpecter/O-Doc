import type {MarketTransaction} from '../../types/api/market';
import {PotionPortrait} from '../Combat/atlas/PotionPortrait';
import {MaterialPortrait} from '../Combat/atlas/MaterialPortrait';
import {EquipmentPortrait} from '../Combat/atlas/EquipmentPortrait';
import {FishPortrait} from '../Fishing/FishPortrait';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {farmItemIcon} from '../Farm/assets';
import {ArrowDownLeft, ArrowUpRight, Tag} from 'lucide-react';

export type TransactionVisual =
    | {type: 'potion'; potionId: string; name: string}
    | {type: 'farm'; src: string; name: string}
    | {type: 'material'; materialId: string; name: string}
    | {type: 'equipment'; equipmentId: string; name: string; slot?:string; equipmentType?:string}
    | {type: 'fish'; fishId: string; name: string}
    | {type: 'custom'; src: string; name: string};

const POTION_NAME_MAP: Record<string, string> = {
    '治疗药剂1': 'potion.heal.1',
    '治疗药剂2': 'potion.heal.2',
    '治疗药剂3': 'potion.heal.3',
    '治疗药剂4': 'potion.heal.4',
    '回蓝药剂1': 'potion.mana.1',
    '回蓝药剂2': 'potion.mana.2',
    '回蓝药剂3': 'potion.mana.3',
    '回蓝药剂4': 'potion.mana.4',
};

const CROP_NAME_TO_KIND: Record<string, string> = {
    '萝卜': 'radish', '鲜脆萝卜': 'radish',
    '土豆': 'potato', '黄心土豆': 'potato',
    '玉米': 'corn', '金黄甜玉米': 'corn',
    '花生': 'peanut',
    '大豆': 'soybean',
    '草莓': 'strawberry',
    '南瓜': 'pumpkin',
    '向日葵': 'sunflower',
    '小麦': 'wheat',
    '水稻': 'rice',
    '番茄': 'tomato',
    '卷心菜': 'cabbage',
    '黄瓜': 'cucumber',
    '茄子': 'eggplant',
    '辣椒': 'chili',
    '洋葱': 'onion',
};

const MATERIAL_NAME_MAP: Record<string, string> = {
    '黏液': 'material.moss_cave.1',
    '绒耳兔毛': 'material.sprout_meadow.rabbit',
    '叶壳碎片': 'material.sprout_meadow.beetle',
    '晨光粉尘': 'material.sprout_meadow.glowbug',
    '蝠翼': 'material.moss_cave.2',
    '晶蜥鳞': 'material.moss_cave.crystal_lizard',
    '苔石碎片': 'material.moss_cave.3',
    '苔石洞窟印记': 'material.moss_cave.4',
    '矿鼠皮': 'material.abandoned_mine.1',
    '铁矿': 'material.abandoned_mine.2',
    '傀儡核心': 'material.abandoned_mine.3',
    '废弃矿坑印记': 'material.abandoned_mine.4',
    '孢子': 'material.mist_forest.1',
    '狼牙': 'material.mist_forest.2',
    '古木树脂': 'material.mist_forest.3',
    '迷雾林地印记': 'material.mist_forest.4',
    '骨片': 'material.sunken_ruins.1',
    '水灵精华': 'material.sunken_ruins.2',
    '遗迹碎晶': 'material.sunken_ruins.3',
    '沉没遗迹印记': 'material.sunken_ruins.4',
    '灰烬粉': 'material.ember_fortress.1',
    '熔岩碎片': 'material.ember_fortress.2',
    '火焰核心': 'material.ember_fortress.3',
    '灰烬堡垒印记': 'material.ember_fortress.4',
    '裂隙粉尘': 'material.star_rift.1',
    '星蚀结晶': 'material.star_rift.2',
    '领主残核': 'material.star_rift.3',
    '星蚀裂隙印记': 'material.star_rift.4',
};

export function resolveTransactionVisual(row: MarketTransaction): TransactionVisual | null {
    const op = (row.operation || {}) as Record<string, unknown>;
    const res = (row.result || {}) as Record<string, unknown>;
    const kind = String(op.kind || '');
    const name = String(res.name || '').trim();

    // 1. 优先检查自定义图片资源（例如美食料理）
    const iconAssetId = res.iconAssetId || res.icon_asset_id;
    if (typeof iconAssetId === 'string' && iconAssetId) {
        return {type: 'custom', src: `/api/resource/view/${iconAssetId}`, name: name || '商品'};
    }
    const iconUrl = res.iconUrl || res.icon_url;
    if (typeof iconUrl === 'string' && iconUrl) {
        return {type: 'custom', src: iconUrl, name: name || '商品'};
    }

    // 进场统一回收的鱼只带稳定 SKU，按鱼类图鉴像素形象展示。
    const fishSku = String(res.fishingSku || res.fishing_sku || '');
    if (fishSku.startsWith('fish.')) {
        return {type: 'fish', fishId: fishSku.slice('fish.'.length), name: name || '鱼'};
    }

    // 2. 药剂 (Potion)
    const rawPotionId = String(op.potionId || op.potion_id || res.potionId || res.potion_id || '');
    let cleanPotionId = rawPotionId.startsWith('combat.') ? rawPotionId.slice('combat.'.length) : rawPotionId;
    if (!cleanPotionId && (kind === 'buy_potion' || kind === 'buy_combat_potion' || /(治疗|回蓝)药剂/.test(name))) {
        cleanPotionId = POTION_NAME_MAP[name] || '';
        if (!cleanPotionId) {
            const numMatch = name.match(/\d+/);
            const level = numMatch ? numMatch[0] : '1';
            if (name.includes('治疗')) cleanPotionId = `potion.heal.${level}`;
            else if (name.includes('回蓝')) cleanPotionId = `potion.mana.${level}`;
        }
    }
    if (cleanPotionId && cleanPotionId.startsWith('potion.')) {
        return {type: 'potion', potionId: cleanPotionId, name: name || '药剂'};
    }

    // 3. 战斗素材 (Combat Material)
    const rawMaterialId = String(op.materialId || op.material_id || res.materialId || res.material_id || '');
    let cleanMaterialId = rawMaterialId.startsWith('combat.') ? rawMaterialId.slice('combat.'.length) : rawMaterialId;
    if (!cleanMaterialId && (kind === 'sell_combat_material' || MATERIAL_NAME_MAP[name])) {
        cleanMaterialId = MATERIAL_NAME_MAP[name] || '';
    }
    if (cleanMaterialId) {
        return {type: 'material', materialId: cleanMaterialId, name: name || '材料'};
    }

    // 4. 战斗装备 (Combat Equipment)
    const rawEquipmentId = String(op.equipmentId || op.equipment_id || res.equipmentId || res.equipment_id || '');
    if (kind === 'sell_combat_equipment' || rawEquipmentId || row.equipmentSnapshot?.templateId) {
        return {type: 'equipment', equipmentId: row.equipmentSnapshot?.templateId || rawEquipmentId,
                slot: row.equipmentSnapshot?.slot, equipmentType: row.equipmentSnapshot?.equipmentType, name: name || '装备'};
    }

    // 5. 农场物资 / 种子 / 作物 / 动物 / 产物
    const sku = String(res.sku || op.sku || '');
    if (sku) {
        const iconSrc = farmItemIcon(sku);
        if (iconSrc) {
            return {type: 'farm', src: iconSrc, name: name || sku};
        }
    }

    // 常驻饲料
    const slotId = String(op.slotId || op.slot_id || res.slotId || res.slot_id || '');
    if (slotId === 'feed' || name === '饲料' || name === '常驻饲料') {
        const iconSrc = farmItemIcon('feed');
        if (iconSrc) return {type: 'farm', src: iconSrc, name: name || '饲料'};
    }

    // 肥料（品质肥 / 增产肥）
    if (name.includes('品质肥') || name.includes('品质肥料') || slotId.includes('fertilizer.quality')) {
        const iconSrc = farmItemIcon('fertilizer.quality');
        if (iconSrc) return {type: 'farm', src: iconSrc, name: name || '品质肥'};
    }
    if (
        name.includes('增产肥') ||
        name.includes('增产肥料') ||
        name.includes('丰收肥') ||
        name.includes('丰收肥料') ||
        slotId.includes('fertilizer.yield')
    ) {
        const iconSrc = farmItemIcon('fertilizer.yield');
        if (iconSrc) return {type: 'farm', src: iconSrc, name: name || '增产肥'};
    }

    // 种子：如“萝卜种子”、“土豆种子”
    if (name.endsWith('种子')) {
        const baseCrop = name.replace(/种子$/, '');
        const cropKind = CROP_NAME_TO_KIND[baseCrop];
        if (cropKind) {
            const iconSrc = farmItemIcon(`seed.${cropKind}`);
            if (iconSrc) return {type: 'farm', src: iconSrc, name};
        }
    }

    // 作物收获物：如“萝卜”、“鲜脆萝卜”、“黄心土豆”等
    const cropKind = CROP_NAME_TO_KIND[name];
    if (cropKind) {
        const iconSrc = farmItemIcon(`crop.${cropKind}`);
        if (iconSrc) return {type: 'farm', src: iconSrc, name};
    }

    // 动物
    if (name === '鸡' || name === '牛' || name === '羊') {
        const animalMap: Record<string, string> = {鸡: 'animal.chicken', 牛: 'animal.cow', 羊: 'animal.sheep'};
        const iconSrc = farmItemIcon(animalMap[name]);
        if (iconSrc) return {type: 'farm', src: iconSrc, name};
    }

    // 畜产品（鸡蛋、牛奶、羊毛）
    const isGold = (res.stars === 2) || (res.source && (res.source as {quality?: string}).quality === 'gold') || name.includes('金色');
    if (name.includes('蛋')) {
        const iconSrc = farmItemIcon(isGold ? 'product.chicken.gold' : 'product.chicken.normal');
        if (iconSrc) return {type: 'farm', src: iconSrc, name};
    }
    if (name.includes('奶')) {
        const iconSrc = farmItemIcon(isGold ? 'product.cow.gold' : 'product.cow.normal');
        if (iconSrc) return {type: 'farm', src: iconSrc, name};
    }
    if (name.includes('毛')) {
        const iconSrc = farmItemIcon(isGold ? 'product.sheep.gold' : 'product.sheep.normal');
        if (iconSrc) return {type: 'farm', src: iconSrc, name};
    }

    return null;
}

export function TransactionItemIcon({
    transaction,
    isBuy,
    isSell,
}: {
    transaction: MarketTransaction;
    isBuy: boolean;
    isSell: boolean;
}) {
    const visual = resolveTransactionVisual(transaction);
    const arrowIcon = isBuy ? (
        <ArrowDownLeft className="h-5 w-5" />
    ) : isSell ? (
        <ArrowUpRight className="h-5 w-5" />
    ) : (
        <Tag className="h-5 w-5" />
    );

    if (!visual) {
        return (
            <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    isBuy
                        ? 'border-orange-200 bg-orange-50 text-orange-600'
                        : isSell
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-blue-200 bg-blue-50 text-blue-600'
                }`}
            >
                {arrowIcon}
            </div>
        );
    }

    return (
        <div
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all ${
                isBuy
                    ? 'border-orange-200/90 bg-orange-50/50'
                    : isSell
                      ? 'border-emerald-200/90 bg-emerald-50/50'
                      : 'border-slate-200 bg-slate-50'
            }`}
        >
            <div className="flex h-7 w-7 items-center justify-center overflow-hidden">
                {visual.type === 'potion' && (
                    <PotionPortrait
                        potionId={visual.potionId}
                        name={visual.name}
                        decorative
                        className="h-7 w-7"
                    />
                )}
                {visual.type === 'farm' && (
                    <ItemIconImage
                        src={visual.src}
                        alt={visual.name}
                        className="h-7 w-7 object-contain"
                        fallback={arrowIcon}
                    />
                )}
                {visual.type === 'material' && (
                    <MaterialPortrait
                        materialId={visual.materialId}
                        name={visual.name}
                        decorative
                        className="h-7 w-7"
                    />
                )}
                {visual.type === 'equipment' && (
                    <EquipmentPortrait
                        equipmentId={visual.equipmentId || ''}
                        name={visual.name}
                        slot={visual.slot}
                        equipmentType={visual.equipmentType}
                        decorative
                        className="h-7 w-7"
                        fallbackClassName="h-6 w-6"
                    />
                )}
                {visual.type === 'fish' && (
                    <FishPortrait
                        fishId={visual.fishId}
                        name={visual.name}
                        decorative
                        className="h-7 w-7"
                    />
                )}
                {visual.type === 'custom' && (
                    <ItemIconImage
                        src={visual.src}
                        alt={visual.name}
                        className="h-7 w-7 object-contain"
                        fallback={arrowIcon}
                    />
                )}
            </div>

            {/* 右下角极简收支指示微标 */}
            <div
                className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white shadow-2xs ${
                    isBuy
                        ? 'bg-orange-500 text-white'
                        : isSell
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-400 text-white'
                }`}
                title={isBuy ? '支出' : isSell ? '收入' : '交易'}
            >
                {isBuy ? (
                    <ArrowDownLeft className="h-2.5 w-2.5 stroke-[2.5]" />
                ) : isSell ? (
                    <ArrowUpRight className="h-2.5 w-2.5 stroke-[2.5]" />
                ) : (
                    <Tag className="h-2.5 w-2.5 stroke-[2.5]" />
                )}
            </div>
        </div>
    );
}
