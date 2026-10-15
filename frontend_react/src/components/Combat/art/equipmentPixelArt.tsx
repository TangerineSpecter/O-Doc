import {useMemo} from 'react';

type Point = readonly [number, number];
type PixelLayer = {color: string; pixels: Set<string>};
type Palette = {outline: string; main: string; shadow: string; light: string; trim: string; gem: string};

const palettes: Record<string, readonly Palette[]> = {
    cloth_armor: [
        {outline:'#29364b',main:'#a9c2d6',shadow:'#58758e',light:'#e3eff4',trim:'#c79a56',gem:'#5ec9d7'},
        {outline:'#29364b',main:'#8eacc5',shadow:'#486987',light:'#dceaf5',trim:'#cfaa6a',gem:'#62c8d7'},
        {outline:'#302b4c',main:'#8a81b0',shadow:'#51466f',light:'#d9d1ee',trim:'#d4ae6c',gem:'#9be0dc'},
        {outline:'#253b50',main:'#5a9daf',shadow:'#326274',light:'#d0edf0',trim:'#d6bb78',gem:'#81e2e5'},
        {outline:'#34334e',main:'#9a9bb9',shadow:'#5d5c80',light:'#f1efff',trim:'#e0bf77',gem:'#a8edee'},
    ],
    heavy_armor: [
        {outline:'#342d2a',main:'#987450',shadow:'#604631',light:'#d8b77d',trim:'#d5a95e',gem:'#91b7b7'},
        {outline:'#303744',main:'#8c929b',shadow:'#555d67',light:'#dce1e2',trim:'#c1a66a',gem:'#92d4dc'},
        {outline:'#292d3a',main:'#747b89',shadow:'#454a5a',light:'#c7cbd2',trim:'#d1a65e',gem:'#7aaec4'},
        {outline:'#29354a',main:'#71859c',shadow:'#46566b',light:'#d5e0e9',trim:'#d1b36f',gem:'#7ec6d8'},
        {outline:'#3c3032',main:'#a27655',shadow:'#674638',light:'#e0c195',trim:'#e5bb66',gem:'#e1d082'},
    ],
    leather_armor: [
        {outline:'#342b28',main:'#a5794f',shadow:'#694632',light:'#d8b27b',trim:'#d0a05d',gem:'#84a77b'},
        {outline:'#352c27',main:'#8e6848',shadow:'#5b402f',light:'#d0a877',trim:'#d5ad68',gem:'#94b079'},
        {outline:'#29352e',main:'#74804d',shadow:'#495338',light:'#bdc28a',trim:'#d1a85b',gem:'#95c393'},
        {outline:'#353044',main:'#695b7b',shadow:'#463d5a',light:'#b6a8c9',trim:'#c7a266',gem:'#9dc6df'},
        {outline:'#3b2d2c',main:'#9b6049',shadow:'#663f36',light:'#d69a70',trim:'#dfb362',gem:'#d3c57c'},
    ],
    light_armor: [
        {outline:'#273941',main:'#63a1a1',shadow:'#376c70',light:'#c6e6dc',trim:'#d2b06a',gem:'#7cddd0'},
        {outline:'#273b3a',main:'#5b9b78',shadow:'#37684f',light:'#c8e4b8',trim:'#d5b368',gem:'#a8dc89'},
        {outline:'#2d3850',main:'#5d80b0',shadow:'#3f587f',light:'#c8dcf3',trim:'#d3b26b',gem:'#82d2e2'},
        {outline:'#352d4a',main:'#78659c',shadow:'#51446e',light:'#d3c4eb',trim:'#d6b46e',gem:'#b9a2e2'},
    ],
    plate_armor: [
        {outline:'#303947',main:'#8b9aa9',shadow:'#536273',light:'#e1e8e8',trim:'#c59c5d',gem:'#8dced5'},
        {outline:'#2c3a4a',main:'#708ca7',shadow:'#465c73',light:'#ccdfea',trim:'#d2aa63',gem:'#80d7dd'},
        {outline:'#303348',main:'#716f91',shadow:'#4a4a68',light:'#cbc9e0',trim:'#d6ae63',gem:'#a5dae1'},
        {outline:'#2c404c',main:'#5e8c90',shadow:'#3d626a',light:'#c8e4dc',trim:'#dfbc70',gem:'#a5e6d3'},
        {outline:'#40333b',main:'#a17a62',shadow:'#674e46',light:'#e5c49a',trim:'#ebc56a',gem:'#e8dc8a'},
    ],
    magic_shield: [
        {outline:'#28334a',main:'#718da9',shadow:'#435b79',light:'#c8e1ed',trim:'#c4ac6d',gem:'#72e2e8'},
    ],
    small_shield: [
        {outline:'#362b26',main:'#9b6a43',shadow:'#62432f',light:'#d2a56d',trim:'#b7a36d',gem:'#88c7d1'},
    ],
    large_shield: [
        {outline:'#303341',main:'#75849c',shadow:'#48566d',light:'#d5d9de',trim:'#d3ad63',gem:'#8eced8'},
    ],
    accessory: [
        {outline:'#3b3029',main:'#bf9b57',shadow:'#795b32',light:'#f2d78c',trim:'#8fc7c8',gem:'#58cdd6'},
        {outline:'#342d42',main:'#b38c55',shadow:'#6c5142',light:'#e9d594',trim:'#a899cf',gem:'#ac91df'},
        {outline:'#2e3947',main:'#c1a45f',shadow:'#756144',light:'#f5e3a0',trim:'#8bd0ca',gem:'#7be2df'},
    ],
    generic: [
        {outline:'#30394a',main:'#8c9aaa',shadow:'#596777',light:'#dce5e8',trim:'#caa661',gem:'#7fcbd5'},
        {outline:'#30394a',main:'#788ead',shadow:'#4b607d',light:'#d6e2f2',trim:'#d1ad65',gem:'#8ed8df'},
        {outline:'#38354c',main:'#887ba6',shadow:'#564969',light:'#dfd7ed',trim:'#d5ad68',gem:'#a5d8dd'},
    ],
};

function createPainter() {
    const layers: PixelLayer[] = [];
    const add = (color: string, pixels: Set<string>) => {
        if (pixels.size) layers.push({color, pixels});
    };
    const linePixels = (from: Point, to: Point): Set<string> => {
        const pixels = new Set<string>();
        let [x, y] = from;
        const [endX, endY] = to;
        const dx = Math.abs(endX - x), sx = x < endX ? 1 : -1;
        const dy = -Math.abs(endY - y), sy = y < endY ? 1 : -1;
        let error = dx + dy;
        while (true) {
            if (x >= 0 && y >= 0 && x < 32 && y < 32) pixels.add(`${x},${y}`);
            if (x === endX && y === endY) break;
            const doubled = 2 * error;
            if (doubled >= dy) {error += dy; x += sx;}
            if (doubled <= dx) {error += dx; y += sy;}
        }
        return pixels;
    };
    const line = (from: Point, to: Point, color: string, thickness = 1) => {
        const pixels = linePixels(from, to);
        if (thickness > 1) {
            for (const key of [...pixels]) {
                const [x, y] = key.split(',').map(Number);
                for (let oy = -Math.floor(thickness / 2); oy <= Math.floor(thickness / 2); oy++) {
                    for (let ox = -Math.floor(thickness / 2); ox <= Math.floor(thickness / 2); ox++) {
                        if (x + ox >= 0 && y + oy >= 0 && x + ox < 32 && y + oy < 32) pixels.add(`${x + ox},${y + oy}`);
                    }
                }
            }
        }
        add(color, pixels);
    };
    const polygon = (points: readonly Point[], fill: string, outline: string) => {
        const pixels = new Set<string>();
        const ys = points.map(([, y]) => y);
        for (let y = Math.max(0, Math.floor(Math.min(...ys))); y <= Math.min(31, Math.ceil(Math.max(...ys))); y++) {
            const scan = y + 0.5;
            const intersections: number[] = [];
            points.forEach(([x1, y1], index) => {
                const [x2, y2] = points[(index + 1) % points.length];
                if ((y1 > scan) !== (y2 > scan)) intersections.push(x1 + (scan - y1) * (x2 - x1) / (y2 - y1));
            });
            intersections.sort((a, b) => a - b);
            for (let index = 0; index + 1 < intersections.length; index += 2) {
                for (let x = Math.max(0, Math.ceil(intersections[index])); x < Math.min(32, Math.ceil(intersections[index + 1])); x++) {
                    pixels.add(`${x},${y}`);
                }
            }
        }
        add(fill, pixels);
        points.forEach((point, index) => line(point, points[(index + 1) % points.length], outline));
    };
    const rect = (x: number, y: number, width: number, height: number, color: string) => {
        const pixels = new Set<string>();
        for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
            if (px >= 0 && py >= 0 && px < 32 && py < 32) pixels.add(`${px},${py}`);
        }
        add(color, pixels);
    };
    const diamond = (cx: number, cy: number, radius: number, color: string, outline: string) => {
        polygon([[cx,cy-radius],[cx+radius,cy],[cx,cy+radius],[cx-radius,cy]], color, outline);
    };
    return {layers, line, polygon, rect, diamond};
}

function tierFor(id: string, equipmentType: string): number {
    const band = Number(id.match(/\.(30|50|70|90)$/)?.[1] || 0);
    if (!band) return 0;
    const base = equipmentType === 'light_armor' || equipmentType === 'plate_armor' ? 30 : 10;
    return Math.max(0, Math.min(4, Math.floor((band - base) / 20)));
}

function drawShield(p: ReturnType<typeof createPainter>, palette: Palette, equipmentType: string) {
    if (equipmentType === 'large_shield') {
        p.polygon([[7,3],[25,3],[25,13],[22,22],[16,29],[10,22],[7,13]], palette.main, palette.outline);
        p.polygon([[10,6],[22,6],[22,13],[20,20],[16,25],[12,20],[10,13]], palette.shadow, palette.trim);
        p.polygon([[14,7],[18,7],[18,22],[16,25],[14,22]], palette.light, palette.outline);
        p.polygon([[10,12],[22,12],[20,15],[12,15]], palette.trim, palette.outline);
        p.diamond(16,10,2,palette.gem,palette.outline);
        return;
    }
    p.polygon([[9,4],[23,4],[25,8],[24,16],[21,21],[16,26],[11,22],[8,16],[7,9]], palette.main, palette.outline);
    p.polygon([[11,7],[21,7],[22,11],[20,17],[16,22],[12,18],[10,12]], palette.shadow, palette.trim);
    if (equipmentType === 'magic_shield') {
        p.polygon([[16,8],[18,12],[21,13],[18,15],[16,19],[14,15],[11,13],[14,12]], palette.gem, palette.outline);
        p.rect(15,11,2,1,palette.light);
        p.rect(15,15,2,1,palette.light);
    } else {
        p.rect(13,8,1,12,palette.light);
        p.rect(18,8,1,12,palette.trim);
        p.rect(10,13,12,1,palette.trim);
        p.diamond(16,14,2,palette.light,palette.outline);
    }
}

function drawArmor(p: ReturnType<typeof createPainter>, palette: Palette, slot: string, equipmentType: string, tier: number) {
    if (slot === 'head') {
        if (tier === 0) {
            p.polygon([[7,15],[10,9],[14,7],[18,8],[24,4],[23,11],[26,15],[23,19],[9,19]], palette.main, palette.outline);
            p.rect(10,15,13,2,palette.trim);
            p.rect(12,11,2,3,palette.light);
            return;
        }
        if (tier === 1) {
            p.polygon([[6,17],[9,12],[12,13],[15,5],[18,12],[21,8],[24,13],[27,17],[24,20],[8,20]], palette.main, palette.outline);
            p.rect(9,16,15,2,palette.trim);
            p.rect(14,11,2,4,palette.light);
        } else if (tier === 2) {
            p.polygon([[8,19],[7,12],[10,7],[15,4],[20,5],[25,10],[24,19],[21,22],[11,22]], palette.main, palette.outline);
            p.polygon([[11,10],[16,7],[21,10],[21,17],[11,17]], palette.shadow, palette.trim);
            p.rect(14,12,4,2,palette.light);
        } else {
            p.polygon([[6,17],[8,10],[12,11],[12,5],[16,9],[20,4],[20,11],[24,9],[27,17],[24,21],[8,21]], palette.main, palette.outline);
            p.rect(9,16,14,2,palette.trim);
            p.diamond(16,13,tier === 4 ? 3 : 2,palette.gem,palette.outline);
            p.rect(10,11,2,3,palette.light);
            p.rect(21,11,2,3,palette.light);
        }
        return;
    }
    if (slot === 'body') {
        if (equipmentType === 'cloth_armor') {
            p.polygon([[10,4],[14,3],[16,6],[19,3],[23,5],[26,11],[22,13],[23,26],[18,24],[16,27],[13,24],[8,26],[10,13],[6,11]], palette.main, palette.outline);
            p.polygon([[14,7],[16,9],[18,7],[19,22],[16,25],[13,22]], palette.shadow, palette.trim);
            p.rect(9,12,14,2,palette.trim);
            p.diamond(16,12,2,palette.gem,palette.outline);
            p.rect(11,17,2,4,palette.light);
        } else if (equipmentType === 'leather_armor' || equipmentType === 'light_armor') {
            p.polygon([[9,5],[13,4],[16,7],[19,4],[23,5],[26,10],[22,12],[21,22],[11,22],[10,12],[6,10]], palette.main, palette.outline);
            p.polygon([[12,8],[16,10],[20,8],[19,16],[16,18],[13,16]], palette.shadow, palette.trim);
            p.line([10,8],[21,19],palette.trim,2);
            p.line([22,8],[11,19],palette.trim,2);
            p.rect(11,20,10,2,palette.trim);
            p.diamond(16,13,tier >= 3 ? 2 : 1,palette.gem,palette.outline);
        } else {
            p.polygon([[8,4],[12,3],[16,6],[20,3],[24,5],[27,10],[23,13],[22,23],[10,23],[9,13],[5,10]], palette.main, palette.outline);
            p.polygon([[11,7],[16,9],[21,7],[20,15],[16,18],[12,15]], palette.light, palette.outline);
            p.polygon([[12,16],[20,16],[21,21],[11,21]], palette.shadow, palette.trim);
            p.rect(15,9,2,11,palette.trim);
            p.diamond(16,13,tier >= 3 ? 3 : 2,palette.gem,palette.outline);
            p.rect(6,10,3,2,palette.shadow);
            p.rect(23,10,3,2,palette.shadow);
            if (equipmentType === 'plate_armor') {
                p.rect(7,8,4,3,palette.light);
                p.rect(21,8,4,3,palette.light);
                p.rect(12,18,8,2,palette.main);
            }
        }
        if (tier >= 2) {
            p.rect(7,8,3,1,palette.light);
            p.rect(22,8,3,1,palette.light);
            p.rect(14,22,4,1,palette.trim);
        }
        return;
    }
    if (slot === 'hands') {
        p.polygon([[11,7],[14,7],[15,14],[16,14],[16,5],[19,5],[20,14],[21,14],[21,7],[24,8],[24,16],[27,15],[27,20],[23,25],[15,25],[10,21],[7,17],[8,14],[11,17]], palette.main, palette.outline);
        p.polygon([[12,18],[16,19],[21,18],[24,17],[24,21],[21,23],[15,23],[11,20]], palette.shadow, palette.trim);
        p.rect(14,9,1,4,palette.light);
        p.rect(19,7,1,6,palette.light);
        p.diamond(19,20,tier >= 3 ? 2 : 1,palette.gem,palette.outline);
        return;
    }
    if (slot === 'feet') {
        p.polygon([[11,5],[16,5],[17,16],[21,19],[26,20],[27,24],[24,27],[8,27],[6,24],[10,20]], palette.main, palette.outline);
        p.polygon([[10,21],[17,19],[21,22],[25,22],[25,24],[10,24],[8,23]], palette.shadow, palette.trim);
        p.rect(11,8,4,2,palette.light);
        p.rect(17,15,3,2,palette.trim);
        p.rect(12,24,12,1,palette.light);
        p.diamond(15,17,1,palette.gem,palette.outline);
    }
}

function drawAccessory(p: ReturnType<typeof createPainter>, palette: Palette, equipmentId: string, tier: number) {
    if (equipmentId.includes('ring')) {
        const ring = new Set<string>();
        for (let y = 9; y <= 23; y++) for (let x = 9; x <= 23; x++) {
            const distance = (x - 16) ** 2 + (y - 16) ** 2;
            if (distance >= 24 && distance <= 52) ring.add(`${x},${y}`);
        }
        for (const key of ring) {
            const [x,y] = key.split(',').map(Number);
            p.rect(x,y,1,1,palette.outline);
            p.rect(x+1,y,1,1,palette.main);
        }
        p.diamond(16,8,tier >= 2 ? 4 : 3,palette.gem,palette.outline);
        p.rect(15,5,2,1,palette.light);
    } else {
        p.line([12,3],[12,9],palette.outline);
        p.line([20,3],[20,9],palette.outline);
        p.rect(11,3,2,5,palette.trim);
        p.rect(19,3,2,5,palette.trim);
        p.polygon([[12,8],[20,8],[20,17],[16,23],[12,17]], palette.main, palette.outline);
        p.polygon([[14,11],[18,11],[18,16],[16,19],[14,16]], palette.shadow, palette.trim);
        p.diamond(16,14,tier >= 2 ? 4 : 3,palette.gem,palette.outline);
        p.rect(15,11,2,1,palette.light);
    }
}

function drawTrainingSword(p: ReturnType<typeof createPainter>, palette: Palette) {
    p.polygon([[10,23],[8,21],[17,8],[21,5],[20,11],[12,24]], '#bd945b', palette.outline);
    p.polygon([[17,8],[23,4],[21,11],[12,23]], '#a9c7cb', palette.outline);
    p.line([9,20],[15,24],palette.trim,2);
    p.rect(8,21,3,3,'#875b3c');
    p.diamond(9,24,2,palette.gem,palette.outline);
}

function buildIcon(equipmentId: string, slot: string, equipmentType: string): PixelLayer[] {
    const p = createPainter();
    const tier = tierFor(equipmentId, equipmentType);
    const palette = (palettes[equipmentType] || palettes.generic)[tier % (palettes[equipmentType] || palettes.generic).length];
    if (equipmentId === 'equip.training_sword') drawTrainingSword(p, palette);
    else if (slot === 'offhand') drawShield(p, palette, equipmentType);
    else if (slot === 'head' || slot === 'body' || slot === 'hands' || slot === 'feet') drawArmor(p, palette, slot, equipmentType, tier);
    else if (slot === 'accessory') drawAccessory(p, palette, equipmentId, tier);
    else drawTrainingSword(p, palette);
    return p.layers;
}

export function EquipmentPixelArt({equipmentId, slot, equipmentType, className = ''}: {
    equipmentId: string; slot: string; equipmentType: string; className?: string;
}) {
    const layers = useMemo(() => buildIcon(equipmentId, slot, equipmentType), [equipmentId, slot, equipmentType]);
    return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true" shapeRendering="crispEdges">
            {layers.map((layer, index) => {
                const path = [...layer.pixels].map(key => {
                    const [x,y] = key.split(',');
                    return `M${x} ${y}h1v1h-1z`;
                }).join('');
                return <path key={`${layer.color}-${index}`} d={path} fill={layer.color} />;
            })}
        </svg>
    );
}
