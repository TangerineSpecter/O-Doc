import {Graphics} from 'pixi.js';
import {BUILDINGS, GARDEN, HEIGHT, PATHS, POND, TILE, WIDTH, type Rect} from './layout';

// 静态地表：草地、道路、菜园边框、池塘和围栏，只在场景初始化时绘制一次。
const C = {
    grass: 0x9cc46a, grassDark: 0x8db75d, tuft: 0x7aa64f, tuftLight: 0xb4d781,
    path: 0xdcbf8a, pathEdge: 0xbf9b66, pathDot: 0xc9a774, pathLight: 0xead3a4,
    gardenEdge: 0x8a5f3c, gardenEdgeLight: 0xb27f52, gardenGround: 0x93bb60,
    sand: 0xe0cd96, sandDark: 0xc9b47c, water: 0x5aa6c4, waterDeep: 0x4a8fb0, waterLight: 0x86c6db,
    post: 0x8a6440, postTop: 0xc0915e, rail: 0xa97b4f, shadow: 0x000000,
};

/** 确定性伪随机，保证每次刷新地表一致。 */
const rand = (i: number) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};
const inside = (r: Rect, x: number, y: number, pad = 0) => x >= r.x - pad && x < r.x + r.w + pad && y >= r.y - pad && y < r.y + r.h + pad;

export function terrain() {
    const g = new Graphics();
    grass(g);
    paths(g);
    garden(g);
    pond(g);
    for (const spot of Object.values(BUILDINGS)) {
        g.rect(spot.pen.x + 4, spot.pen.y + 8, spot.pen.w - 8, spot.pen.h - 12).fill({color: 0x8ab35a, alpha: .55});
        fenceBox(g, spot.pen, 6);
    }
    flowers(g);
    return g;
}

function grass(g: Graphics) {
    g.rect(0, 0, WIDTH, HEIGHT).fill(C.grass);
    // 柔和的棋盘格明暗，避免大面积平涂。
    for (let ty = 0; ty < HEIGHT / TILE; ty++)
        for (let tx = 0; tx < WIDTH / TILE; tx++)
            if ((tx + ty) % 2) g.rect(tx * TILE, ty * TILE, TILE, TILE).fill({color: C.grassDark, alpha: .18});
    for (let i = 0; i < 520; i++) {
        const x = Math.floor(rand(i) * WIDTH), y = Math.floor(rand(i + 999) * HEIGHT);
        if (PATHS.some(p => inside(p, x, y, 2)) || inside(POND, x, y, 6)) continue;
        // 草簇：三根像素草叶。
        g.rect(x, y, 1, 3).fill(C.tuft); g.rect(x + 2, y - 1, 1, 4).fill(C.tuft); g.rect(x + 4, y + 1, 1, 2).fill(C.tuft);
        if (i % 3 === 0) g.rect(x + 2, y - 1, 1, 1).fill(C.tuftLight);
    }
}

function paths(g: Graphics) {
    for (const p of PATHS) g.rect(p.x - 2, p.y - 2, p.w + 4, p.h + 4).fill(C.pathEdge);
    for (const p of PATHS) g.rect(p.x, p.y, p.w, p.h).fill(C.path);
    for (let i = 0; i < 900; i++) {
        const x = Math.floor(rand(i + 3000) * WIDTH), y = Math.floor(rand(i + 4000) * HEIGHT);
        if (!PATHS.some(p => inside(p, x, y, -3))) continue;
        g.rect(x, y, i % 4 ? 2 : 3, 2).fill(i % 5 ? C.pathDot : C.pathLight);
    }
    // 沿边缘的不规则草边，柔化直线道路。
    for (const p of PATHS) {
        for (let x = p.x; x < p.x + p.w; x += 4) {
            const n = rand(x + p.y);
            if (n > .55 && !PATHS.some(o => o !== p && inside(o, x, p.y - 3))) g.rect(x, p.y - 2, 3, 2 + Math.floor(n * 3)).fill(C.grass);
            if (n < .4 && !PATHS.some(o => o !== p && inside(o, x, p.y + p.h + 3))) g.rect(x, p.y + p.h - 2, 3, 2 + Math.floor(n * 4)).fill(C.grass);
        }
    }
}

function garden(g: Graphics) {
    const {x, y, w, h} = GARDEN;
    g.rect(x, y, w, h).fill(C.gardenGround);
    // 木板矮边框，阴影在下方。
    g.rect(x - 4, y + h, w + 8, 3).fill({color: C.shadow, alpha: .12});
    for (const [rx, ry, rw, rh] of [[x - 4, y - 4, w + 8, 6], [x - 4, y + h - 2, w + 8, 6], [x - 4, y - 4, 6, h + 8], [x + w - 2, y - 4, 6, h + 8]]) {
        g.rect(rx, ry, rw, rh).fill(C.gardenEdge);
        g.rect(rx, ry, rw, 2).fill(C.gardenEdgeLight);
    }
    for (let px = x; px < x + w; px += 34) g.rect(px, y - 4, 1, 6).fill(C.post);
}

function pond(g: Graphics) {
    const {x, y, w, h} = POND;
    // 用叠加矩形拼出圆润像素轮廓。
    const blob = (pad: number, color: number) => {
        g.rect(x + 24 - pad, y - pad, w - 48 + pad * 2, h + pad * 2).fill(color);
        g.rect(x + 8 - pad, y + 8 - pad, w - 16 + pad * 2, h - 16 + pad * 2).fill(color);
        g.rect(x - pad, y + 24 - pad, w + pad * 2, h - 48 + pad * 2).fill(color);
    };
    blob(8, C.sandDark); blob(6, C.sand); blob(0, C.water);
    g.rect(x + 40, y + 30, w - 80, h - 50).fill(C.waterDeep);
    g.rect(x + 56, y + 40, w - 112, h - 72).fill({color: C.waterDeep, alpha: .6});
    for (let i = 0; i < 9; i++) g.rect(x + 20 + Math.floor(rand(i + 70) * (w - 60)), y + 14 + Math.floor(rand(i + 90) * (h - 28)), 10 + (i % 3) * 4, 2).fill(C.waterLight);
    // 荷叶和小花。
    for (const [lx, ly] of [[x + 150, y + 22], [x + 168, y + 66], [x + 34, y + 70]]) {
        g.rect(lx, ly, 12, 8).fill(0x5f9a48); g.rect(lx + 2, ly - 2, 8, 2).fill(0x5f9a48); g.rect(lx + 5, ly - 2, 2, 5).fill(C.water);
        g.rect(lx + 2, ly + 1, 3, 2).fill(0x7db75e);
    }
    g.rect(x + 172, y + 64, 3, 3).fill(0xf2a6b8); g.rect(x + 173, y + 63, 1, 1).fill(0xffffff);
    // 岸边小木栈道连接横路。
    const dy = 12 * TILE + 14;
    g.rect(x - 22, dy + 4, 62, 30).fill({color: C.shadow, alpha: .15});
    for (let dx = x - 22; dx < x + 40; dx += 10) {
        g.rect(dx, dy, 9, 30).fill(0xb7895a); g.rect(dx, dy, 9, 2).fill(0xd5a874); g.rect(dx + 8, dy, 1, 30).fill(0x8a6440);
    }
    // 芦苇。
    for (const [rx, ry] of [[x + w - 18, y + 4], [x + w - 10, y + 12], [x + 6, y + 18], [x + w - 30, y + h - 10]]) {
        g.rect(rx, ry, 1, 10).fill(0x6c9c43); g.rect(rx + 3, ry + 2, 1, 8).fill(0x6c9c43); g.rect(rx, ry - 3, 2, 4).fill(0x8a6440);
    }
}

/** 围栏：横栏两条加竖桩，左侧中段留出门口。 */
function fenceBox(g: Graphics, r: Rect, gate: number) {
    const rail = (x: number, y: number, len: number) => {
        g.rect(x, y + 2, len, 2).fill(C.rail); g.rect(x, y + 7, len, 2).fill(C.rail);
        g.rect(x, y + 9, len, 1).fill({color: C.shadow, alpha: .12});
    };
    const post = (x: number, y: number) => {
        g.rect(x + 1, y + 12, 5, 2).fill({color: C.shadow, alpha: .15});
        g.rect(x, y - 2, 5, 14).fill(C.post); g.rect(x, y - 2, 5, 2).fill(C.postTop);
    };
    const gy = r.y + r.h / 2 - gate * 2, gh = gate * 4;
    rail(r.x, r.y, r.w); rail(r.x, r.y + r.h - 8, r.w);
    for (const x of [r.x, r.x + r.w - 5])
        for (let y = r.y; y < r.y + r.h - 4; y += 4)
            if (x !== r.x || y < gy || y > gy + gh) g.rect(x + 1, y, 3, 4).fill(C.rail);
    for (let x = r.x; x <= r.x + r.w - 5; x += 26) {post(x, r.y); post(x, r.y + r.h - 8);}
    for (let y = r.y + 26; y < r.y + r.h - 12; y += 26) {
        if (y < gy - 8 || y > gy + gh) post(r.x, y);
        post(r.x + r.w - 5, y);
    }
    post(r.x, gy - 6); post(r.x, gy + gh);
}

function flowers(g: Graphics) {
    const colors = [0xf6f1e3, 0xf6d36b, 0xf2a6b8, 0xb9a6e8];
    for (let i = 0; i < 70; i++) {
        const x = Math.floor(rand(i + 7000) * WIDTH), y = Math.floor(rand(i + 8000) * HEIGHT);
        if (PATHS.some(p => inside(p, x, y, 6)) || inside(POND, x, y, 12) || inside(GARDEN, x, y, 8) || Object.values(BUILDINGS).some(b => inside(b.pen, x, y, 8) || inside(b.lot, x, y, 8))) continue;
        const c = colors[i % colors.length];
        g.rect(x, y + 2, 1, 3).fill(C.tuft);
        g.rect(x - 1, y, 3, 1).fill(c); g.rect(x, y - 1, 1, 3).fill(c); g.rect(x, y, 1, 1).fill(0xe8b64a);
    }
}
