import {Pix} from './canvas';
import {P} from './palette';

// 建筑：画布底边即地面。谷仓为红色复折屋顶立面，鸡舍为暖色木板 A 字屋；等级越高装饰越多。
export const BARN_W = 64, BARN_H = 54, BARN_BODY_X = 14;
export const COOP_W = 46, COOP_H = 42;

export function barn(level: number) {
    const p = new Pix(BARN_W, BARN_H);
    const bx = BARN_BODY_X, top = 10, eave = 14, height = 42, cx = bx + 24, ground = top + height;
    if (level >= 3) silo(p, 1, 6, ground);
    const outer = (ry: number) => ry < 6 ? 8 + ry / 6 * 8 : ry < eave ? 16 + (ry - 6) / 8 * 8 : 24;
    for (let ry = 0; ry < height; ry++) {
        const y = top + ry, hw = outer(ry), inner = ry < eave ? hw - 3 : 22;
        for (let x = bx; x < bx + 48; x++) {
            const d = Math.abs(x + .5 - cx);
            if (d > hw) continue;
            if (d > inner || (ry < 3) || (ry >= eave && ry < eave + 2 && d > 20)) {
                // 屋顶：左亮右暗，隔行瓦片线。
                const left = x < cx;
                let c: number = left ? P.slate2 : P.slate1;
                if ((ry + (left ? 0 : 1)) % 3 === 0) c = left ? P.slate1 : P.slate0;
                if (d > hw - 1) c = left ? P.slate3 : P.slate1;
                p.px(x, y, c);
            } else {
                // 立面：竖向木板与左侧高光。
                let c: number = (x - bx) % 4 === 0 ? P.red1 : P.red2;
                if (x < bx + 6 && (x - bx) % 4) c = P.red3;
                if (ry > height - 6) c = (x - bx) % 4 === 0 ? P.red0 : P.red1;
                if (Math.abs(d - inner) < 1 && ry < eave + 2) c = P.paint1; // 屋檐白色饰边
                p.px(x, y, c);
            }
        }
    }
    // 角柱、地基。
    p.rect(bx + 2, top + eave + 2, 2, height - eave - 4, P.paint1); p.rect(bx + 44, top + eave + 2, 2, height - eave - 4, P.paint0);
    p.rect(bx + 2, ground - 3, 44, 3, P.stone1); p.hline(bx + 2, ground - 3, 44, P.stone2);
    for (let x = bx + 4; x < bx + 46; x += 6) p.px(x, ground - 2, P.stone0);
    // 阁楼窗与干草。
    p.rect(cx - 5, top + 5, 10, 9, P.paint2); p.rect(cx - 4, top + 6, 8, 7, P.ink);
    p.rect(cx - 4, top + 10, 8, 3, P.straw2); p.hline(cx - 4, top + 10, 8, P.straw3); p.px(cx - 2, top + 9, P.straw2);
    // 大门：白框 + X 撑。
    const dw = 18, dh = 17, dx = cx - dw / 2, dy = ground - 3 - dh;
    p.rect(dx - 1, dy - 1, dw + 2, dh + 1, P.paint2);
    p.rect(dx, dy, dw, dh, P.red1); p.vline(cx, dy, dh, P.paint1);
    for (const half of [0, 1]) {
        const x0 = dx + half * dw / 2, w = dw / 2 - 1;
        p.line(x0 + 1, dy + 1, x0 + w - 1, dy + dh - 2, P.paint1); p.line(x0 + w - 1, dy + 1, x0 + 1, dy + dh - 2, P.paint1);
    }
    if (level >= 2) {
        // 风向标与门灯。
        p.vline(cx, top - 8, 8, P.ink); p.hline(cx - 4, top - 6, 9, P.ink); p.px(cx + 5, top - 7, P.ink); p.px(cx + 5, top - 5, P.ink);
        p.rect(cx - 2, top - 10, 4, 3, P.straw1); p.px(cx + 2, top - 10, P.red2);
        p.rect(dx - 5, dy + 3, 3, 4, P.lamp); p.hline(dx - 5, dy + 2, 3, P.ink);
    }
    if (level >= 3) {
        p.rect(dx + dw + 3, ground - 9, 6, 6, P.straw1); p.hline(dx + dw + 3, ground - 9, 6, P.straw3);
    }
    p.outline(P.ink);
    p.under(q => q.ellipse(cx + 3, ground + .5, 27, 2.2, 0x000000, .28));
    return p;
}

function silo(p: Pix, x: number, top: number, ground: number) {
    const w = 13;
    p.ellipse(x + w / 2, top + 4, w / 2, 4.5, (dx, dy) => dx + dy < -.4 ? P.red3 : dx < .3 ? P.red2 : P.red1);
    for (let y = top + 4; y < ground; y++)
        for (let i = 0; i < w; i++) {
            let c: number = i < 3 ? P.stone3 : i < 9 ? P.stone2 : P.stone1;
            if ((y - top) % 6 === 0) c = P.stone1;
            p.px(x + i, y, c);
        }
    p.rect(x + 5, top + 12, 3, 4, P.ink);
}

export function coop(level: number) {
    const p = new Pix(COOP_W, COOP_H);
    const bx = 3, top = level >= 3 ? 4 : 6, ground = COOP_H - 3, cx = bx + 20, eave = 15;
    if (level >= 3) {p.rect(cx + 8, top + 1, 5, 9, P.stone1); p.rect(cx + 8, top + 1, 5, 2, P.stone2); p.rect(cx + 7, top, 7, 2, P.stone0);}
    for (let y = top; y < ground; y++) {
        const ry = y - top;
        for (let x = bx; x < bx + 40; x++) {
            const d = Math.abs(x + .5 - cx);
            if (ry <= eave) {
                const hw = 3 + ry / eave * 18;
                if (d > hw) continue;
                if (d > hw - 3 || ry < 3) {
                    const left = x < cx;
                    let c: number = left ? P.teal2 : P.teal1;
                    if ((x + ry * 2) % 4 === 0) c = left ? P.teal1 : P.teal0;
                    if (d > hw - 1) c = left ? P.teal3 : P.teal1;
                    p.px(x, y, c);
                    continue;
                }
            } else if (d > 18) continue;
            // 横向木板墙。
            let c: number = (ry % 3 === 0) ? P.straw1 : P.straw2;
            if (x < bx + 6 && ry % 3) c = P.straw3;
            if (x > bx + 34) c = (ry % 3 === 0) ? P.straw0 : P.straw1;
            p.px(x, y, c);
        }
    }
    p.rect(bx + 2, top + eave + 1, 36, 1, P.paint1);
    // 圆窗。
    p.ellipse(cx - 9, ground - 12, 3.6, 3.6, P.paint2); p.ellipse(cx - 9, ground - 12, 2.4, 2.4, (dx, dy) => dx + dy < -.2 ? P.foam : P.sky);
    p.px(cx - 9, ground - 12, P.paint2);
    // 门和坡道。
    const dw = 9, dh = 11, dx = cx + 2, dy = ground - dh;
    p.rect(dx - 1, dy - 2, dw + 2, dh + 2, P.wood1); p.rect(dx, dy - 1, dw, dh + 1, P.ink);
    p.rect(dx + 1, dy, dw - 2, 3, 0x4a3040);
    p.line(dx - 1, ground + 1, dx + dw + 1, ground - 3, P.wood2);
    p.rect(cx - 1, top + 6, 3, 3, P.straw3); p.px(cx, top + 7, P.straw0);
    if (level >= 2) {
        p.rect(cx - 14, ground - 7, 10, 3, P.wood1); p.hline(cx - 14, ground - 7, 10, P.wood2);
        for (let i = 0; i < 5; i++) p.px(cx - 13 + i * 2, ground - 8, [P.pink, P.yellow, P.white, P.purple, P.pink][i]);
    }
    if (level >= 3) {p.rect(dx + dw + 2, dy + 2, 3, 4, P.lamp); p.hline(dx + dw + 2, dy + 1, 3, P.ink);}
    p.outline(P.ink);
    p.under(q => q.ellipse(cx + 3, ground + .5, 22, 2, 0x000000, .28));
    return p;
}

/** 未建造建筑的地基：平整土台、木桩围绳、木料堆。 */
export function constructionLot(w: number, h: number) {
    const p = new Pix(w, h);
    p.rect(2, 4, w - 4, h - 6, P.dirt2); p.hline(2, 4, w - 4, P.dirt3); p.hline(2, h - 3, w - 4, P.dirt1);
    for (let i = 0; i < 14; i++) p.px(4 + (i * 7) % (w - 8), 6 + (i * 5) % (h - 10), i % 2 ? P.dirt1 : P.dirt3);
    for (const [x, y] of [[2, 2], [w - 4, 2], [2, h - 6], [w - 4, h - 6]]) {p.rect(x, y, 2, 5, P.wood1); p.px(x, y, P.wood3);}
    p.hline(4, 3, w - 8, P.paint1); p.hline(4, h - 5, w - 8, P.paint1);
    p.rect(w - 16, h - 12, 10, 2, P.wood2); p.rect(w - 15, h - 14, 9, 2, P.wood3); p.rect(w - 17, h - 10, 11, 2, P.wood1);
    p.rect(8, 8, 8, 6, P.wood2); p.rect(9, 9, 6, 4, P.wood3); p.vline(11, 14, 3, P.wood1);
    p.hline(10, 11, 4, P.wood0); p.vline(12, 10, 3, P.wood0);
    return p;
}
