import type {CropKind} from '../../../types/api/farm';
import {P} from './palette';
import {hline, px, rc, vline, type Ctx} from './pixel';

/** 场景沿用目录中的作物身份，新增品种时必须提供独立画法。 */
export type CropSprite = CropKind;

function sprout(g: Ctx, x: number, y: number, wide = false) {
    vline(g, x, y - 2, 3, P.l3);
    hline(g, x - (wide ? 2 : 1), y - 3, wide ? 2 : 1, P.l1);
    hline(g, x + 1, y - 2, wide ? 2 : 1, P.l2);
}

/** 成对椭圆叶，用于豆类；与薯类的宽叶、谷物的细叶区分。 */
function leafPair(g: Ctx, x: number, y: number) {
    rc(g, x - 3, y - 1, 2, 2, P.l2); px(g, x - 3, y - 1, P.l1);
    rc(g, x + 1, y - 1, 2, 2, P.l3); px(g, x + 1, y - 1, P.l2);
}

function broadLeaves(g: Ctx, x: number, y: number, tall = false) {
    vline(g, x, y - (tall ? 8 : 5), tall ? 9 : 6, P.l4);
    for (const [dx, dy] of [[-3, -3], [1, -5], [-2, -6]]) {
        rc(g, x + dx, y + dy, 3, 2, P.l3);
        hline(g, x + dx, y + dy, 2, P.l2); px(g, x + dx, y + dy, P.l1);
    }
    if (tall) { hline(g, x - 2, y - 8, 3, P.l2); px(g, x - 1, y - 9, P.l1); }
}

function flower(g: Ctx, x: number, y: number, color: string = P.c1) {
    hline(g, x - 1, y, 3, color); vline(g, x, y - 1, 3, color); px(g, x, y, P.y2);
}

/* ---- 作物：g 画布，(x,y)=底边中点，stage 1 幼苗 / 2 生长 / 3 成熟 ---- */
export const CROP_DRAW: Record<CropSprite, (g: Ctx, x: number, y: number, st: number) => void> = {
    radish(g, x, y, st) {
        if (st === 1) { sprout(g, x, y); return; }
        vline(g, x, y - 5, 5, P.l3);
        hline(g, x - 3, y - 4, 3, P.l2); hline(g, x + 1, y - 5, 2, P.l1);
        px(g, x - 2, y - 5, P.l1); px(g, x, y - 6, P.l1);
        if (st === 2) { hline(g, x - 1, y, 3, P.pk); return; }
        hline(g, x - 2, y - 2, 5, P.r2); hline(g, x - 2, y - 1, 5, P.pk);
        hline(g, x - 1, y, 3, P.c1); px(g, x, y + 1, P.c2); px(g, x - 1, y - 2, P.r1);
    },
    potato(g, x, y, st) {
        if (st === 1) { sprout(g, x, y, true); return; }
        broadLeaves(g, x, y);
        hline(g, x - 3, y - 1, 7, P.l3);
        flower(g, x + 1, y - 6);
        if (st === 2) return;
        for (const [dx, dy] of [[-3, -1], [1, 0]]) {
            hline(g, x + dx, y + dy - 1, 3, P.w2); rc(g, x + dx - 1, y + dy, 4, 2, P.w3);
            hline(g, x + dx, y + dy, 3, P.w2); px(g, x + dx + 1, y + dy, P.s3);
        }
    },
    corn(g, x, y, st) {
        if (st === 1) { vline(g, x, y - 3, 4, P.l3); px(g, x - 1, y - 3, P.l1); px(g, x + 1, y - 1, P.l2); return; }
        const h = st === 2 ? 8 : 12;
        vline(g, x, y - h, h + 1, P.l4); vline(g, x - 1, y - h + 1, h, P.l2);
        for (const dy of [-2, -5]) {
            hline(g, x - 3, y + dy - 1, 3, P.l2); px(g, x - 4, y + dy - 2, P.l1);
            hline(g, x + 1, y + dy, 3, P.l3); px(g, x + 3, y + dy - 1, P.l2);
        }
        if (st === 2) { px(g, x, y - h - 1, P.l1); return; }
        hline(g, x - 2, y - h, 5, P.y3); vline(g, x, y - h - 2, 3, P.y1);
        rc(g, x + 1, y - 8, 3, 5, P.y2); vline(g, x + 1, y - 8, 4, P.y1);
        px(g, x + 3, y - 7, P.y3); px(g, x + 3, y - 5, P.y3); px(g, x + 2, y - 3, P.l2);
    },
    peanut(g, x, y, st) {
        if (st === 1) { sprout(g, x, y, true); return; }
        vline(g, x, y - 5, 6, P.l4); leafPair(g, x, y - 4); leafPair(g, x, y - 1);
        px(g, x - 1, y - 6, P.l1); px(g, x + 1, y - 5, P.l2);
        px(g, x - 2, y - 2, P.y2);
        if (st === 2) return;
        // 贴土的葫芦形双节果荚，避免画成橙色根茎。
        for (const dx of [-3, 1]) {
            vline(g, x + dx, y - 1, 3, P.w3); vline(g, x + dx + 2, y - 1, 3, P.s3);
            vline(g, x + dx + 1, y - 2, 5, P.w2); px(g, x + dx, y, P.s2);
            px(g, x + dx + 1, y - 1, P.c3); px(g, x + dx + 1, y + 1, P.c3);
        }
    },
    soybean(g, x, y, st) {
        if (st === 1) { sprout(g, x, y); px(g, x + 2, y - 2, P.l2); return; }
        vline(g, x, y - 8, 9, P.l4); leafPair(g, x, y - 6); leafPair(g, x, y - 3);
        hline(g, x - 1, y - 9, 3, P.l2); px(g, x, y - 10, P.l1);
        if (st === 2) { px(g, x + 2, y - 4, P.c1); return; }
        for (const [dx, dy] of [[-3, -5], [2, -4], [-1, -2]]) {
            rc(g, x + dx, y + dy, 2, 4, P.l4); vline(g, x + dx, y + dy, 3, P.l1);
            px(g, x + dx + 1, y + dy + 1, P.c3); px(g, x + dx + 1, y + dy + 3, P.l2);
        }
    },
    strawberry(g, x, y, st) {
        if (st === 1) { sprout(g, x, y, true); px(g, x - 2, y - 2, P.l2); return; }
        for (const [dx, dy] of [[-3, -3], [0, -5], [2, -2]]) {
            rc(g, x + dx - 1, y + dy, 3, 2, P.l3); hline(g, x + dx - 1, y + dy, 2, P.l1);
        }
        hline(g, x - 3, y, 7, P.l4);
        if (st === 2) { flower(g, x + 1, y - 3); return; }
        for (const [dx, dy] of [[-3, -2], [1, -1]]) {
            hline(g, x + dx - 1, y + dy - 1, 3, P.l2);
            rc(g, x + dx - 1, y + dy, 3, 2, P.r2); px(g, x + dx, y + dy + 2, P.r3);
            px(g, x + dx - 1, y + dy, P.y1); px(g, x + dx + 1, y + dy + 1, P.c1);
        }
    },
    sunflower(g, x, y, st) {
        if (st === 1) { sprout(g, x, y, true); vline(g, x, y - 4, 2, P.l2); return; }
        const h = st === 2 ? 7 : 10;
        vline(g, x, y - h, h + 1, P.l4); vline(g, x - 1, y - h + 1, h, P.l3);
        rc(g, x - 4, y - 4, 3, 2, P.l2); px(g, x - 4, y - 4, P.l1);
        rc(g, x + 1, y - 6, 3, 2, P.l2); px(g, x + 2, y - 6, P.l1);
        if (st === 2) { rc(g, x - 1, y - h - 1, 3, 3, P.l2); px(g, x, y - h - 2, P.y2); return; }
        // 八瓣花盘与深棕色籽心，和细长谷穗保持不同剪影。
        rc(g, x - 2, y - h - 3, 5, 7, P.y2); rc(g, x - 3, y - h - 2, 7, 5, P.y1);
        rc(g, x - 2, y - h - 1, 5, 3, P.w4); rc(g, x - 1, y - h - 2, 3, 5, P.w4);
        rc(g, x - 1, y - h - 1, 3, 3, P.s2); px(g, x - 1, y - h - 1, P.w2); px(g, x + 1, y - h + 1, P.w3);
    },
    rice(g, x, y, st) {
        if (st === 1) { vline(g, x, y - 3, 4, P.l3); px(g, x - 1, y - 2, P.l2); px(g, x + 1, y - 3, P.l1); return; }
        for (const [dx, h] of [[-2, 6], [0, 9], [2, 7]]) {
            vline(g, x + dx, y - h, h + 1, P.l3); px(g, x + dx - 1, y - 3, P.l1);
            if (st === 2) { px(g, x + dx + 1, y - h, P.l1); continue; }
            hline(g, x + dx, y - h, 3, P.c3); vline(g, x + dx + 3, y - h + 1, 3, P.y3);
            px(g, x + dx + 1, y - h - 1, P.y1); px(g, x + dx + 2, y - h + 1, P.y1);
            px(g, x + dx + 4, y - h + 2, P.c2); px(g, x + dx + 3, y - h + 4, P.y1);
        }
    },
    cabbage(g, x, y, st) {
        if (st === 1) { sprout(g, x, y, true); hline(g, x - 2, y, 5, P.l3); return; }
        const w = st === 2 ? 5 : 7, left = x - (w >> 1);
        hline(g, left, y, w, P.l4); rc(g, left, y - 3, w, 3, P.l3);
        rc(g, left + 1, y - 4, w - 2, 4, P.l2); hline(g, left + 1, y - 4, w - 2, P.l1);
        if (st === 2) { px(g, x, y - 2, P.l1); return; }
        rc(g, x - 1, y - 3, 3, 3, P.g3); vline(g, x, y - 3, 3, P.l1);
        px(g, left, y - 2, P.l1); px(g, left + 1, y - 1, P.l2); px(g, x + 2, y - 1, P.l4);
    },
    cucumber(g, x, y, st) {
        if (st === 1) { sprout(g, x, y, true); px(g, x + 2, y - 3, P.l1); return; }
        // 细木架与攀缘藤叶是黄瓜的稳定轮廓，生长期也能辨认。
        vline(g, x - 3, y - 9, 10, P.w3); vline(g, x + 3, y - 9, 10, P.w3);
        hline(g, x - 3, y - 8, 7, P.w2); hline(g, x - 3, y - 3, 7, P.w2);
        broadLeaves(g, x, y, true); px(g, x + 2, y - 7, P.y2);
        if (st === 2) return;
        for (const [dx, dy] of [[-2, -5], [1, -7]]) {
            rc(g, x + dx, y + dy, 2, 5, P.l4); vline(g, x + dx, y + dy, 4, P.l2);
            px(g, x + dx, y + dy + 1, P.l1); px(g, x + dx + 1, y + dy + 3, P.l3);
        }
    },
    eggplant(g, x, y, st) {
        if (st === 1) { sprout(g, x, y, true); px(g, x, y - 1, P.pu); return; }
        broadLeaves(g, x, y, true);
        if (st === 2) { flower(g, x + 2, y - 5, P.pu); return; }
        for (const [dx, dy] of [[-3, -3], [1, -5]]) {
            hline(g, x + dx, y + dy - 1, 3, P.l2); rc(g, x + dx, y + dy, 3, 4, P.dk);
            vline(g, x + dx, y + dy, 3, P.pu); px(g, x + dx + 1, y + dy, P.pk);
            hline(g, x + dx, y + dy + 4, 2, P.dk);
        }
    },
    chili(g, x, y, st) {
        if (st === 1) { sprout(g, x, y); vline(g, x, y - 3, 2, P.l2); return; }
        broadLeaves(g, x, y, true);
        if (st === 2) { px(g, x - 2, y - 3, P.c1); px(g, x + 2, y - 5, P.c1); return; }
        for (const [dx, dy] of [[-3, -4], [1, -6], [2, -1]]) {
            hline(g, x + dx, y + dy - 1, 2, P.l4); rc(g, x + dx, y + dy, 2, 3, P.r2);
            px(g, x + dx, y + dy, P.r1); px(g, x + dx + 1, y + dy + 3, P.r3);
            px(g, x + dx + 2, y + dy + 4, P.r3);
        }
    },
    onion(g, x, y, st) {
        if (st === 1) { vline(g, x, y - 3, 4, P.l3); px(g, x + 1, y - 4, P.l1); return; }
        for (const [dx, h] of [[-2, 5], [0, 8], [2, 6]]) {
            vline(g, x + dx, y - h, h - 1, P.l3); px(g, x + dx, y - h, P.l1);
        }
        if (st === 2) { hline(g, x - 1, y, 3, P.c3); return; }
        hline(g, x - 1, y - 3, 3, P.w2); rc(g, x - 3, y - 1, 7, 2, P.w3);
        rc(g, x - 2, y - 2, 5, 4, P.w2); vline(g, x - 1, y - 2, 3, P.c2);
        vline(g, x + 2, y - 1, 2, P.w3); px(g, x, y + 2, P.c3);
    },
    wheat(g, x, y, st) {
        if (st === 1) { px(g, x, y, P.l3); px(g, x, y - 1, P.l2); px(g, x - 1, y - 2, P.l1); px(g, x + 1, y - 2, P.l1); return; }
        if (st === 2) { for (const [dx, h] of [[-2, 4], [0, 6], [2, 4]]) { vline(g, x + dx, y - h + 1, h, P.l3); px(g, x + dx, y - h, P.l1); px(g, x + dx + (dx < 0 ? -1 : 1), y - h + 2, P.l2); } px(g, x, y - 7, P.l1); return; }
        for (const [dx, h] of [[-4, 8], [-1, 10], [2, 8]]) {
            vline(g, x + dx, y - 3, 4, P.l3); vline(g, x + dx + 1, y - 2, 3, P.l4);                 // 秆
            rc(g, x + dx, y - h, 2, h - 3, P.y2); vline(g, x + dx, y - h, h - 3, P.y1); vline(g, x + dx + 1, y - h + 2, h - 5, P.y3);
            px(g, x + dx, y - h - 1, P.y1); px(g, x + dx + 1, y - h + 1, P.y1);
            for (let k = 1; k < h - 3; k += 2) px(g, x + dx + 1, y - h + k + 1, P.y1);           // 麦粒
            px(g, x + dx - 1, y - 2, P.l2);
        }
    },
    tomato(g, x, y, st) {
        if (st === 1) { px(g, x, y, P.l3); px(g, x - 1, y - 1, P.l2); px(g, x + 1, y - 1, P.l2); px(g, x, y - 1, P.l3); return; }
        const bush = (rows: number[]) => rows.forEach((rw, i) => { const yy = y - rows.length + 1 + i; hline(g, x - (rw >> 1), yy, rw, P.l2); px(g, x - (rw >> 1), yy, P.l1); px(g, x - (rw >> 1) + rw - 1, yy, P.l3); if (i === rows.length - 1) hline(g, x - (rw >> 1), yy, rw, P.l3); });
        if (st === 2) { bush([3, 5, 5, 5]); px(g, x - 1, y - 4, P.l1); px(g, x + 1, y - 2, P.c1); px(g, x - 1, y - 1, P.y2); return; }
        
        bush([3, 5, 7, 7, 7, 5]);
        for (const [dx, dy] of [[-3, -3], [1, -3], [-1, -6]]) { rc(g, x + dx, y + dy, 3, 3, P.r2); px(g, x + dx, y + dy, P.r1); hline(g, x + dx, y + dy + 2, 3, P.r3); px(g, x + dx + 1, y + dy - 1, P.l4); }
    },
    pumpkin(g, x, y, st) {
        if (st === 1) { px(g, x, y, P.l3); px(g, x, y - 1, P.l3); px(g, x - 2, y - 2, P.l2); px(g, x - 1, y - 2, P.l2); px(g, x + 1, y - 2, P.l2); px(g, x + 2, y - 2, P.l2); px(g, x - 1, y - 3, P.l1); return; }
        if (st === 2) { hline(g, x - 4, y - 1, 9, P.l3); rc(g, x - 4, y - 4, 4, 3, P.l2); px(g, x - 4, y - 4, P.l1); rc(g, x + 1, y - 3, 3, 2, P.l2); rc(g, x - 1, y - 2, 3, 2, P.l4); px(g, x, y - 2, P.l2); px(g, x + 3, y - 1, P.l1); return; }
        // 成熟：大南瓜 10x7
        const rows = [[3, 4], [1, 8], [0, 10], [0, 10], [0, 10], [1, 8], [2, 6]];
        rows.forEach(([o, w], i) => { const yy = y - 6 + i; hline(g, x - 5 + o, yy, w, P.o2); px(g, x - 5 + o, yy, P.o1); px(g, x - 5 + o + 1, yy, P.o1); px(g, x - 5 + o + w - 1, yy, P.r2); if (i > 4) hline(g, x - 5 + o, yy, w, P.r2); });
        for (const ox of [-2, 1]) vline(g, x + ox, y - 5, 5, P.r2);
        px(g, x - 3, y - 4, P.y3); px(g, x - 3, y - 3, P.y3);
        rc(g, x - 1, y - 8, 2, 2, P.l3); px(g, x + 1, y - 8, P.l2); px(g, x + 2, y - 9, P.l2); px(g, x - 1, y - 8, P.l4);
    }
};

/** 宽叶和高秆作物留出株距，其余沿用原有三株两行的苗床密度。 */
export const CROP_SLOTS: Record<CropSprite, number[]> = {
    radish: [6, 14, 22], potato: [7, 21], corn: [7, 21], peanut: [7, 21],
    soybean: [7, 21], strawberry: [7, 21], pumpkin: [8, 20], sunflower: [7, 21],
    wheat: [6, 14, 22], rice: [5, 12, 19], tomato: [6, 14, 22], cabbage: [6, 14, 22],
    cucumber: [7, 21], eggplant: [7, 21], chili: [7, 21], onion: [6, 14, 22],
};
