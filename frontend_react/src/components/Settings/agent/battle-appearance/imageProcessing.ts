export interface PixelImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}

export interface CropRect {x: number; y: number; width: number; height: number}
export interface CharacterTransform {x: number; y: number; scale: number}
export const BATTLE_CHARACTER_MIN_SCALE = 0.01;
export const BATTLE_CHARACTER_MAX_SCALE = 4;
export const BATTLE_CHARACTER_FRAME = {width: 374, height: 528};

/** Fit the complete silhouette to the battle frame, keeping every hair strand and the feet. */
export function autoCharacterTransform(bounds: CropRect): CharacterTransform {
    const scale = Math.max(BATTLE_CHARACTER_MIN_SCALE, Math.min(BATTLE_CHARACTER_MAX_SCALE, 338 / bounds.width, 500 / bounds.height));
    return {x: 0, y: 0, scale};
}

export function characterFramePlacement(crop: CropRect, transform: CharacterTransform) {
    const width = Math.max(1, Math.round(crop.width * transform.scale));
    const height = Math.max(1, Math.round(crop.height * transform.scale));
    const x = Math.round((BATTLE_CHARACTER_FRAME.width - width) / 2 + transform.x);
    const y = Math.round(BATTLE_CHARACTER_FRAME.height - height + transform.y);
    return {x, y, width, height, clipped: x < 0 || y < 0 || x + width > BATTLE_CHARACTER_FRAME.width || y + height > BATTLE_CHARACTER_FRAME.height};
}

export function renderCharacterFrame(sourceCanvas: HTMLCanvasElement, crop: CropRect, transform: CharacterTransform) {
    const canvas = document.createElement('canvas');
    canvas.width = BATTLE_CHARACTER_FRAME.width; canvas.height = BATTLE_CHARACTER_FRAME.height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    if (!context) throw new Error('无法初始化像素画布');
    context.imageSmoothingEnabled = false;
    const placement = characterFramePlacement(crop, transform);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, crop.x, crop.y, crop.width, crop.height, placement.x, placement.y, placement.width, placement.height);
    return {canvas, clipped: placement.clipped};
}

const colorDistance = (data: Uint8ClampedArray, offset: number, color: [number, number, number]) =>
    Math.max(Math.abs(data[offset] - color[0]), Math.abs(data[offset + 1] - color[1]), Math.abs(data[offset + 2] - color[2]));

function edgeBackgroundColor({width, height, data}: PixelImage): [number, number, number] {
    const counts = new Map<number, {count: number; rgb: [number, number, number]}>();
    const add = (index: number) => {
        const offset = index * 4;
        if (data[offset + 3] === 0) return;
        const rgb: [number, number, number] = [data[offset], data[offset + 1], data[offset + 2]];
        const key = (Math.round(rgb[0] / 12) << 16) | (Math.round(rgb[1] / 12) << 8) | Math.round(rgb[2] / 12);
        const hit = counts.get(key);
        if (hit) hit.count++;
        else counts.set(key, {count: 1, rgb});
    };
    for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
    for (let y = 1; y < height - 1; y++) { add(y * width); add(y * width + width - 1); }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.rgb ?? [255, 0, 255];
}

/** Removes only border-connected pixels close to the dominant edge color. */
export function removeFlatBackground(source: PixelImage, tolerance = 24) {
    const {width, height} = source;
    const data = new Uint8ClampedArray(source.data);
    if (data.length !== width * height * 4) throw new Error('图片像素数据长度无效');
    let hasAlpha = false;
    for (let p = 3; p < data.length; p += 4) if (data[p] < 255) { hasAlpha = true; break; }
    if (hasAlpha) return {image: {...source, data}, color: null as [number, number, number] | null, removed: 0, alreadyTransparent: true};

    const color = edgeBackgroundColor(source);
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let read = 0, write = 0;
    const enqueue = (index: number) => {
        if (index < 0 || index >= width * height || visited[index]) return;
        const offset = index * 4;
        if (colorDistance(data, offset, color) > tolerance) return;
        visited[index] = 1;
        queue[write++] = index;
    };
    for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
    for (let y = 1; y < height - 1; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
    while (read < write) {
        const index = queue[read++];
        data[index * 4 + 3] = 0;
        const x = index % width;
        if (x > 0) enqueue(index - 1);
        if (x + 1 < width) enqueue(index + 1);
        if (index >= width) enqueue(index - width);
        if (index + width < width * height) enqueue(index + width);
    }
    return {image: {...source, data}, color, removed: write, alreadyTransparent: false};
}

export function alphaBounds(image: PixelImage): CropRect | null {
    let left = image.width, top = image.height, right = -1, bottom = -1;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
        if (image.data[(y * image.width + x) * 4 + 3] === 0) continue;
        left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
    return right < left || bottom < top ? null : {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

/** Remove the clicked connected color patch, including pockets enclosed by hair or sleeves. */
export function removeColorRegion(source: PixelImage, point: {x:number;y:number}, tolerance=24): PixelImage {
    const {width,height}=source;
    const x=Math.floor(point.x),y=Math.floor(point.y);
    if(x<0||y<0||x>=width||y>=height)return source;
    const start=y*width+x,offset=start*4;
    if(source.data[offset+3]===0)return source;
    const color:[number,number,number]=[source.data[offset],source.data[offset+1],source.data[offset+2]];
    const data=new Uint8ClampedArray(source.data),visited=new Uint8Array(width*height),queue=new Int32Array(width*height);
    let read=0,write=0;
    const enqueue=(index:number)=>{
        if(visited[index]||data[index*4+3]===0||colorDistance(data,index*4,color)>tolerance)return;
        visited[index]=1;queue[write++]=index;
    };
    enqueue(start);
    while(read<write){
        const index=queue[read++],column=index%width;data[index*4+3]=0;
        if(column>0)enqueue(index-1);if(column+1<width)enqueue(index+1);
        if(index>=width)enqueue(index-width);if(index+width<width*height)enqueue(index+width);
    }
    return {...source,data};
}

export function applyBrushStroke(image: PixelImage, original: PixelImage, points: {x: number; y: number}[], radius: number, mode: 'erase' | 'restore'): PixelImage {
    const data = new Uint8ClampedArray(image.data);
    const r = Math.max(1, Math.round(radius));
    const sampled:{x:number;y:number}[]=[];
    points.forEach((point,index)=>{
        const previous=points[index-1];
        const distance=previous?Math.hypot(point.x-previous.x,point.y-previous.y):0;
        const segments=Math.max(1,Math.ceil(distance/Math.max(1,r/2)));
        for(let step=1;step<=segments;step++){
            const ratio=step/segments;
            sampled.push(previous?{x:previous.x+(point.x-previous.x)*ratio,y:previous.y+(point.y-previous.y)*ratio}:point);
        }
    });
    for (const point of sampled) {
        const cx = Math.round(point.x), cy = Math.round(point.y);
        for (let y = Math.max(0, cy - r); y <= Math.min(image.height - 1, cy + r); y++) {
            for (let x = Math.max(0, cx - r); x <= Math.min(image.width - 1, cx + r); x++) {
                if ((x - cx) ** 2 + (y - cy) ** 2 > r ** 2) continue;
                const offset = (y * image.width + x) * 4;
                if (mode === 'erase') data[offset + 3] = 0;
                else data.set(original.data.subarray(offset, offset + 4), offset);
            }
        }
    }
    return {...image, data};
}
